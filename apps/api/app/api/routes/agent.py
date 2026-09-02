from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import SessionLocal, get_db
from app.models import AIConversation, AIMessage, AIToolRun, User
from app.schemas.ai import (
    AIChatRequest,
    AIConversationCreate,
    AIConversationRead,
    AIConversationUpdate,
    AIMessageRead,
    AIToolConfirmation,
    AIToolConfirmationResult,
    AIToolRunRead,
)
from app.services.ai.agent import (
    AgentConfigurationError,
    create_conversation,
    run_agent,
    selected_provider_config,
    sse,
)
from app.services.ai.tools import ToolExecutionError, execute_tool

router = APIRouter(prefix="/ai", tags=["AI 学习助手"])


def _owned_conversation(
    db: Session, *, user_id: int, conversation_id: int
) -> AIConversation:
    conversation = db.scalar(
        select(AIConversation).where(
            AIConversation.id == conversation_id,
            AIConversation.user_id == user_id,
        )
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="对话不存在")
    return conversation


@router.get("/conversations", response_model=list[AIConversationRead])
def list_conversations(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    rows = db.execute(
        select(AIConversation, func.count(AIMessage.id))
        .outerjoin(AIMessage, AIMessage.conversation_id == AIConversation.id)
        .where(
            AIConversation.user_id == current_user.id,
            AIConversation.archived_at.is_(None),
        )
        .group_by(AIConversation.id)
        .order_by(AIConversation.updated_at.desc())
    ).all()
    return [
        AIConversationRead(
            id=item.id,
            title=item.title,
            provider=item.provider,
            model=item.model,
            created_at=item.created_at,
            updated_at=item.updated_at,
            archived_at=item.archived_at,
            message_count=count,
        )
        for item, count in rows
    ]


@router.post(
    "/conversations",
    response_model=AIConversationRead,
    status_code=status.HTTP_201_CREATED,
)
def new_conversation(
    payload: AIConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        conversation = create_conversation(
            db,
            user_id=current_user.id,
            title=payload.title,
            provider=payload.provider,
        )
    except AgentConfigurationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return AIConversationRead(
        id=conversation.id,
        title=conversation.title,
        provider=conversation.provider,
        model=conversation.model,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        archived_at=conversation.archived_at,
        message_count=0,
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[AIMessageRead],
)
def conversation_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _owned_conversation(
        db, user_id=current_user.id, conversation_id=conversation_id
    )
    return db.scalars(
        select(AIMessage)
        .where(AIMessage.conversation_id == conversation.id)
        .order_by(AIMessage.id)
    ).all()


@router.get(
    "/conversations/{conversation_id}/tool-runs",
    response_model=list[AIToolRunRead],
)
def conversation_tool_runs(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _owned_conversation(
        db, user_id=current_user.id, conversation_id=conversation_id
    )
    return db.scalars(
        select(AIToolRun)
        .where(AIToolRun.conversation_id == conversation.id)
        .order_by(AIToolRun.id)
    ).all()


@router.patch(
    "/conversations/{conversation_id}", response_model=AIConversationRead
)
def update_conversation(
    conversation_id: int,
    payload: AIConversationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _owned_conversation(
        db, user_id=current_user.id, conversation_id=conversation_id
    )
    if payload.title is not None:
        conversation.title = payload.title.strip()
    if payload.archived is not None:
        conversation.archived_at = (
            datetime.now(UTC).replace(tzinfo=None) if payload.archived else None
        )
    conversation.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    count = db.scalar(
        select(func.count(AIMessage.id)).where(
            AIMessage.conversation_id == conversation.id
        )
    )
    return AIConversationRead(
        id=conversation.id,
        title=conversation.title,
        provider=conversation.provider,
        model=conversation.model,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        archived_at=conversation.archived_at,
        message_count=count or 0,
    )


@router.delete(
    "/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _owned_conversation(
        db, user_id=current_user.id, conversation_id=conversation_id
    )
    db.delete(conversation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/chat/stream")
def chat_stream(
    payload: AIChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.conversation_id:
        conversation = _owned_conversation(
            db,
            user_id=current_user.id,
            conversation_id=payload.conversation_id,
        )
        if payload.provider and payload.provider != conversation.provider:
            raise HTTPException(status_code=409, detail="同一对话不能中途切换模型厂商")
    else:
        try:
            conversation = create_conversation(
                db,
                user_id=current_user.id,
                title=payload.message[:24],
                provider=payload.provider,
            )
        except AgentConfigurationError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    try:
        selected_provider_config(
            db, user_id=current_user.id, provider=conversation.provider
        )
    except AgentConfigurationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    user_message = AIMessage(
        conversation_id=conversation.id, role="user", content=payload.message
    )
    db.add(user_message)
    if conversation.title == "新对话":
        conversation.title = payload.message[:24]
    conversation.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    conversation_id = conversation.id
    user_id = current_user.id

    async def stream():
        yield sse("conversation.created", {"conversation_id": conversation_id})
        with SessionLocal() as stream_db:
            stream_user = stream_db.get(User, user_id)
            stream_conversation = stream_db.get(AIConversation, conversation_id)
            if stream_user is None or stream_conversation is None:
                yield sse("error", {"message": "对话不存在或已失效"})
                return
            async for event in run_agent(
                stream_db, user=stream_user, conversation=stream_conversation
            ):
                yield event

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/tool-runs/{tool_run_id}/confirm",
    response_model=AIToolConfirmationResult,
)
def confirm_tool_run(
    tool_run_id: int,
    payload: AIToolConfirmation,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = db.scalar(
        select(AIToolRun).where(
            AIToolRun.id == tool_run_id, AIToolRun.user_id == current_user.id
        )
    )
    if run is None:
        raise HTTPException(status_code=404, detail="待确认操作不存在")
    if run.status != "pending_confirmation":
        raise HTTPException(status_code=409, detail="该操作已经处理")
    if not payload.confirmed:
        run.status = "cancelled"
        run.result_summary = "用户已取消操作"
        db.commit()
    else:
        try:
            outcome = execute_tool(
                db,
                user=current_user,
                tool_name=run.tool_name,
                arguments=run.arguments,
            )
        except ToolExecutionError as exc:
            run.status = "failed"
            run.result_summary = str(exc)
            db.commit()
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        run.status = "succeeded"
        run.result = outcome.data
        run.result_summary = outcome.summary
        run.confirmed_at = datetime.now(UTC).replace(tzinfo=None)
        db.add(
            AIMessage(
                conversation_id=run.conversation_id,
                role="assistant",
                content=outcome.summary,
            )
        )
        db.commit()
    return AIToolConfirmationResult(
        id=run.id,
        status=run.status,
        tool_name=run.tool_name,
        result=run.result,
        result_summary=run.result_summary,
    )

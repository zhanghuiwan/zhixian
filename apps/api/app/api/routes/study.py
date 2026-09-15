from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas import (
    ReviewCreate,
    ReviewResult,
    StudyQueueResponse,
    StudySessionComplete,
    StudySessionResult,
)
from app.services.study_workspace import StudyError, complete_session, queue, submit
from app.services.vocabulary_collections import VocabularyCollectionError

router = APIRouter(prefix="/study", tags=["学习"])


@router.get("/queue", response_model=StudyQueueResponse)
def get_study_queue(limit: int = Query(20, ge=1, le=50), mode: Literal["all", "new", "review"] = "all", kind: Literal["system", "personal"] | None = None, source_id: int | None = Query(None, ge=1), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return queue(db, current_user, mode, kind, source_id, limit)
    except VocabularyCollectionError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/reviews", response_model=ReviewResult)
def submit_review(payload: ReviewCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return submit(db, current_user, payload)
    except (StudyError, VocabularyCollectionError) as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc


@router.post("/sessions/complete", response_model=StudySessionResult)
def submit_study_session(
    payload: StudySessionComplete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return complete_session(db, current_user, payload)
    except (StudyError, VocabularyCollectionError) as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc

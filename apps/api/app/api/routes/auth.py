from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import User, Wordbook
from app.schemas import LoginRequest, TokenResponse, UserCreate
from app.db.example_content import ensure_example_bookmarks

router = APIRouter(prefix="/auth", tags=["账号"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="该邮箱已注册")
    selected = db.scalar(
        select(Wordbook).where(
            Wordbook.slug == "zhixian-cet4-v1",
            Wordbook.is_published.is_(True),
        )
    ) or db.scalar(select(Wordbook).where(Wordbook.is_published.is_(True)).order_by(Wordbook.id))
    user = User(
        email=email,
        nickname=payload.nickname.strip(),
        password_hash=hash_password(payload.password),
        selected_wordbook_id=selected.id if selected else None,
    )
    db.add(user)
    db.flush()
    ensure_example_bookmarks(db, user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id), user=user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="邮箱或密码不正确")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已停用")
    ensure_example_bookmarks(db, user)
    db.commit()
    return TokenResponse(access_token=create_access_token(user.id), user=user)

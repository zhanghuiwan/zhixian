from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import agent, ai, articles, auth, dashboard, study, users, vocabulary, wordbooks
from app.api.routes import library, records
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.environment in {"development", "test"}:
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.3.0",
    description="知闲英语学习平台 API",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for route in [
    auth.router,
    users.router,
    dashboard.router,
    wordbooks.router,
    study.router,
    vocabulary.router,
    articles.router,
    ai.router,
    agent.router,
    library.router,
    records.router,
]:
    app.include_router(route, prefix="/api/v1")


@app.get("/api/v1/health", tags=["系统"])
def health():
    return {"status": "ok", "service": "zhixian-api"}

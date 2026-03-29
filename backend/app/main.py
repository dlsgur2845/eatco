import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import async_session, engine
from app.models.ingredient import Base
from app.routers import auth, categories, custom_recipes, dashboard, events, expenses, ingredients, notification_logs, notifications, recipes, scan, storage_guide
from app.seed import run_seed
from app.services.expiry_checker import check_and_create_expiry_notifications


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        await run_seed(db)
    # 시작 시 유통기한 알림 체크
    async with async_session() as db:
        await check_and_create_expiry_notifications(db)
    yield


app = FastAPI(title="Eatco API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(ingredients.router)
app.include_router(dashboard.router)
app.include_router(categories.router)
app.include_router(notifications.router)
app.include_router(notification_logs.router)
app.include_router(storage_guide.router)
app.include_router(scan.router)
app.include_router(events.router)
app.include_router(recipes.router)
app.include_router(expenses.router)
app.include_router(custom_recipes.router)


# 업로드 이미지 서빙
UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

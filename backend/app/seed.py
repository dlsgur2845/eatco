"""Seed default data on first run."""

from datetime import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.notification import NotificationSetting
from app.models.storage_guide import StorageGuide
from app.storage_data import STORAGE_GUIDES

DEFAULT_CATEGORIES = ["유제품", "채소/과일", "육류/수산", "가공식품", "음료", "양념/소스", "곡류/면류", "기타"]
DEFAULT_NOTIFICATION_DAYS = [0, 1, 3, 5, 7, 14, 21, 30]


async def seed_categories(db: AsyncSession) -> None:
    result = await db.execute(select(Category).limit(1))
    if result.scalar_one_or_none():
        return
    for name in DEFAULT_CATEGORIES:
        db.add(Category(name=name))
    await db.commit()


async def seed_notification_settings(db: AsyncSession) -> None:
    result = await db.execute(select(NotificationSetting).limit(1))
    if result.scalar_one_or_none():
        return
    for days in DEFAULT_NOTIFICATION_DAYS:
        enabled = days in (0, 1, 3)
        db.add(NotificationSetting(days_before=days, enabled=enabled, push_time=time(9, 0)))
    await db.commit()


async def seed_storage_guides(db: AsyncSession) -> None:
    result = await db.execute(select(StorageGuide).limit(1))
    if result.scalar_one_or_none():
        return
    for data in STORAGE_GUIDES:
        entry = dict(data)
        # keywords 리스트를 comma-separated 문자열로 변환
        kw_list = entry.pop("keywords", [])
        entry["keywords"] = ",".join(kw_list)
        db.add(StorageGuide(**entry))
    await db.commit()


async def run_seed(db: AsyncSession) -> None:
    await seed_categories(db)
    await seed_notification_settings(db)
    await seed_storage_guides(db)

"""Seed default data on first run."""

from datetime import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.notification import NotificationSetting
from app.models.storage_guide import StorageGuide
from app.models.user import Family
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


async def seed_notification_settings_for_family(db: AsyncSession, family_id) -> None:
    """가족에 대해 기본 알림 설정 8행을 생성합니다."""
    for days in DEFAULT_NOTIFICATION_DAYS:
        enabled = days in (0, 1, 3)
        db.add(NotificationSetting(
            family_id=family_id, days_before=days, enabled=enabled, push_time=time(9, 0),
        ))
    await db.commit()


async def seed_notification_settings(db: AsyncSession) -> None:
    # 기존 글로벌 설정이 있으면 per-family로 마이그레이션
    result = await db.execute(
        select(NotificationSetting).where(NotificationSetting.family_id == None).limit(1)  # noqa: E711
    )
    global_settings = result.scalar_one_or_none()

    # 모든 가족에 대해 설정이 없으면 생성
    families_result = await db.execute(select(Family))
    families = families_result.scalars().all()
    for family in families:
        existing = await db.execute(
            select(NotificationSetting)
            .where(NotificationSetting.family_id == family.id)
            .limit(1)
        )
        if not existing.scalar_one_or_none():
            await seed_notification_settings_for_family(db, family.id)

    # 글로벌 설정 삭제 (per-family로 이전 완료)
    if global_settings:
        from sqlalchemy import delete
        await db.execute(
            delete(NotificationSetting).where(NotificationSetting.family_id == None)  # noqa: E711
        )
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

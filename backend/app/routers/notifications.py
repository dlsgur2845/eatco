import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.notification import NotificationSetting
from app.schemas.notification import NotificationSettingResponse, NotificationSettingUpdate

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/settings", response_model=list[NotificationSettingResponse])
async def get_notification_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NotificationSetting).order_by(NotificationSetting.days_before)
    )
    return result.scalars().all()


@router.put("/settings/{setting_id}", response_model=NotificationSettingResponse)
async def update_notification_setting(
    setting_id: uuid.UUID,
    data: NotificationSettingUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NotificationSetting).where(NotificationSetting.id == setting_id)
    )
    setting = result.scalar_one()
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(setting, key, value)
    await db.commit()
    await db.refresh(setting)
    return setting

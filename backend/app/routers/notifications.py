import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.notification import NotificationSetting, PushSubscription
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.notification import (
    NotificationSettingResponse,
    NotificationSettingUpdate,
    PushSubscriptionCreate,
    PushSubscriptionResponse,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/settings", response_model=list[NotificationSettingResponse])
async def get_notification_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NotificationSetting)
        .where(NotificationSetting.family_id == current_user.family_id)
        .order_by(NotificationSetting.days_before)
    )
    return result.scalars().all()


@router.put("/settings/{setting_id}", response_model=NotificationSettingResponse)
async def update_notification_setting(
    setting_id: uuid.UUID,
    data: NotificationSettingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NotificationSetting).where(
            NotificationSetting.id == setting_id,
            NotificationSetting.family_id == current_user.family_id,
        )
    )
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="알림 설정을 찾을 수 없습니다.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(setting, key, value)
    await db.commit()
    await db.refresh(setting)
    return setting


@router.put("/push-time")
async def update_push_time_all(
    data: NotificationSettingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """가족의 모든 알림 설정의 push_time을 한번에 변경합니다."""
    if data.push_time is None:
        raise HTTPException(status_code=400, detail="push_time이 필요합니다.")
    result = await db.execute(
        select(NotificationSetting)
        .where(NotificationSetting.family_id == current_user.family_id)
    )
    for setting in result.scalars().all():
        setting.push_time = data.push_time
    await db.commit()
    return {"message": "알림 시간이 변경되었습니다."}


# --- Push Subscription ---

@router.get("/vapid-public-key")
async def get_vapid_public_key(
    current_user: User = Depends(get_current_user),
):
    if not settings.vapid_public_key:
        raise HTTPException(status_code=503, detail="푸시 알림이 설정되지 않았습니다.")
    return {"public_key": settings.vapid_public_key}


@router.post("/push-subscription", response_model=PushSubscriptionResponse, status_code=201)
async def subscribe_push(
    data: PushSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """푸시 구독 등록 (같은 endpoint가 있으면 업데이트)."""
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.p256dh = data.keys.p256dh
        existing.auth = data.keys.auth
        existing.user_id = current_user.id
        existing.family_id = current_user.family_id
        await db.commit()
        await db.refresh(existing)
        return existing

    sub = PushSubscription(
        user_id=current_user.id,
        family_id=current_user.family_id,
        endpoint=data.endpoint,
        p256dh=data.keys.p256dh,
        auth=data.keys.auth,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.delete("/push-subscription", status_code=204)
async def unsubscribe_push(
    data: PushSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """푸시 구독 해제."""
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == data.endpoint,
            PushSubscription.user_id == current_user.id,
        )
    )
    await db.commit()


@router.get("/push-subscription/status")
async def push_subscription_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """현재 사용자의 푸시 구독 상태."""
    from sqlalchemy import func
    count = await db.scalar(
        select(func.count()).select_from(PushSubscription).where(
            PushSubscription.user_id == current_user.id,
        )
    )
    return {"subscribed": (count or 0) > 0}

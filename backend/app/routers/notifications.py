import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

import logging

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

logger = logging.getLogger(__name__)

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
    """푸시 구독 등록 (같은 endpoint가 있으면 업데이트).

    endpoint 는 unique 라 기기 1대 = 행 1개다. 같은 기기를 가족 중 다른 사람이
    쓰기 시작하면 재할당하는 게 맞다. 다만 **다른 가족으로의 재할당은 막는다** —
    예전 코드는 소유자 확인 없이 user_id/family_id 를 호출자로 덮어써서,
    남의 endpoint 를 아는 사람이 그 기기를 자기 가족 알림 수신처로 바꿔치기할 수
    있었다 (= 상대 기기로 우리 가족 데이터가 흘러감).
    """
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    )
    existing = result.scalar_one_or_none()
    if existing:
        if existing.family_id != current_user.family_id:
            logger.warning(
                "다른 가족(%s)에 등록된 푸시 endpoint 를 가족 %s 의 사용자 %s 가 요청 — 거부",
                existing.family_id, current_user.family_id, current_user.id,
            )
            raise HTTPException(
                status_code=409,
                detail="이 기기는 다른 가족에 등록되어 있습니다. 해당 기기에서 먼저 알림을 해제해주세요.",
            )
        existing.p256dh = data.keys.p256dh
        existing.auth = data.keys.auth
        existing.user_id = current_user.id
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

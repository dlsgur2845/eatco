import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.notification_log import NotificationLog
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.notification_log import NotificationLogResponse, UnreadCountResponse

router = APIRouter(prefix="/api/notification-logs", tags=["notification-logs"])


@router.get("", response_model=list[NotificationLogResponse])
async def list_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NotificationLog)
        .where(NotificationLog.family_id == current_user.family_id)
        .order_by(NotificationLog.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await db.scalar(
        select(func.count())
        .select_from(NotificationLog)
        .where(
            NotificationLog.family_id == current_user.family_id,
            NotificationLog.is_read == False,
        )
    )
    return UnreadCountResponse(count=count or 0)


@router.put("/{notification_id}/read", response_model=NotificationLogResponse)
async def mark_as_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NotificationLog).where(
            NotificationLog.id == notification_id,
            NotificationLog.family_id == current_user.family_id,
        )
    )
    notif = result.scalar_one()
    notif.is_read = True
    await db.commit()
    await db.refresh(notif)
    return notif


@router.put("/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(NotificationLog)
        .where(
            NotificationLog.family_id == current_user.family_id,
            NotificationLog.is_read == False,
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "모두 읽음 처리되었습니다."}


@router.post("/check-expiry")
async def check_expiry(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """수동으로 유통기한 알림을 확인/생성합니다."""
    from app.services.expiry_checker import check_and_create_expiry_notifications
    count = await check_and_create_expiry_notifications(db)
    return {"created": count}

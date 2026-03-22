"""유통기한 임박 알림 생성 서비스.

앱 시작 시 및 /api/notification-logs/check-expiry 호출 시 실행.
이미 당일 생성된 알림은 중복 생성하지 않음.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient import Ingredient
from app.models.notification import NotificationSetting
from app.models.notification_log import NotificationLog, NotificationType
from app.models.user import Family


async def check_and_create_expiry_notifications(db: AsyncSession) -> int:
    """모든 가족에 대해 유통기한 임박 알림을 생성합니다. 생성된 알림 수를 반환."""
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
    created_count = 0

    # 활성화된 알림 주기 조회
    settings_result = await db.execute(
        select(NotificationSetting).where(NotificationSetting.enabled == True)
    )
    enabled_settings = settings_result.scalars().all()
    if not enabled_settings:
        return 0

    # 모든 가족 조회
    families_result = await db.execute(select(Family))
    families = families_result.scalars().all()

    for family in families:
        for setting in enabled_settings:
            target_date = today + timedelta(days=setting.days_before)

            # 해당 날짜에 만료되는 식재료 조회
            ingredients_result = await db.execute(
                select(Ingredient).where(
                    Ingredient.family_id == family.id,
                    Ingredient.expiry_date == target_date,
                )
            )
            expiring_items = ingredients_result.scalars().all()
            if not expiring_items:
                continue

            # 오늘 이미 같은 타입의 알림이 있는지 확인
            existing = await db.scalar(
                select(func.count())
                .select_from(NotificationLog)
                .where(
                    NotificationLog.family_id == family.id,
                    NotificationLog.created_at >= today_start,
                    NotificationLog.title.like(f"%{setting.days_before}일%") if setting.days_before > 0
                    else NotificationLog.title.like("%오늘%"),
                )
            )
            if existing and existing > 0:
                continue

            # 알림 생성
            names = ", ".join(item.name for item in expiring_items[:3])
            extra = f" 외 {len(expiring_items) - 3}건" if len(expiring_items) > 3 else ""

            if setting.days_before == 0:
                title = "오늘 만료되는 식재료가 있어요"
                ntype = NotificationType.EXPIRY_TODAY
            else:
                title = f"{setting.days_before}일 후 만료 예정"
                ntype = NotificationType.EXPIRY_SOON

            message = f"{names}{extra}의 유통기한이 {'오늘' if setting.days_before == 0 else f'{setting.days_before}일 후'}입니다."

            db.add(NotificationLog(
                family_id=family.id,
                type=ntype,
                title=title,
                message=message,
                link="/inventory",
            ))
            created_count += 1

    await db.commit()
    return created_count

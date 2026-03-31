"""소비기한 임박 알림 생성 서비스.

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


async def check_and_create_expiry_notifications(
    db: AsyncSession,
) -> list[tuple]:
    """모든 가족에 대해 소비기한 임박 알림을 생성합니다.

    Returns: list of (family_id, title, message, link) tuples for push delivery.
    """
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
    created = []

    # 모든 가족 조회
    families_result = await db.execute(select(Family))
    families = families_result.scalars().all()

    for family in families:
        # 이 가족의 활성화된 알림 설정 조회
        settings_result = await db.execute(
            select(NotificationSetting).where(
                NotificationSetting.family_id == family.id,
                NotificationSetting.enabled == True,  # noqa: E712
            )
        )
        enabled_settings = settings_result.scalars().all()
        if not enabled_settings:
            continue

        # 벌크 쿼리: 모든 대상 날짜에 해당하는 식재료를 한번에 조회
        target_dates = [today + timedelta(days=s.days_before) for s in enabled_settings]
        ingredients_result = await db.execute(
            select(Ingredient).where(
                Ingredient.family_id == family.id,
                Ingredient.expiry_date.in_(target_dates),
            )
        )
        all_expiring = ingredients_result.scalars().all()
        if not all_expiring:
            continue

        # 날짜별로 그룹핑
        by_date = {}
        for item in all_expiring:
            by_date.setdefault(item.expiry_date, []).append(item)

        for setting in enabled_settings:
            target_date = today + timedelta(days=setting.days_before)
            expiring_items = by_date.get(target_date, [])
            if not expiring_items:
                continue

            # days_before 기반 정확 매칭으로 중복 체크
            ntype = NotificationType.EXPIRY_TODAY if setting.days_before == 0 else NotificationType.EXPIRY_SOON
            existing = await db.scalar(
                select(func.count())
                .select_from(NotificationLog)
                .where(
                    NotificationLog.family_id == family.id,
                    NotificationLog.type == ntype,
                    NotificationLog.days_before == setting.days_before,
                    NotificationLog.created_at >= today_start,
                )
            )
            if existing and existing > 0:
                continue

            # 알림 생성
            names = ", ".join(item.name for item in expiring_items[:3])
            extra = f" 외 {len(expiring_items) - 3}건" if len(expiring_items) > 3 else ""

            if setting.days_before == 0:
                title = "오늘 만료되는 식재료가 있어요"
            else:
                title = f"{setting.days_before}일 후 만료 예정"

            when = "오늘" if setting.days_before == 0 else f"{setting.days_before}일 후"
            message = f"{names}{extra}의 소비기한이 {when}입니다."

            db.add(NotificationLog(
                family_id=family.id,
                type=ntype,
                title=title,
                message=message,
                link="/inventory",
                days_before=setting.days_before,
            ))
            created.append((family.id, title, message, "/inventory"))

    await db.commit()
    return created

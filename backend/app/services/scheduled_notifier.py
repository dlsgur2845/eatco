"""스케줄드 알림 체크 + 푸시 전송 서비스.

APScheduler에 의해 15분 간격으로 실행됩니다.
각 가족의 push_time이 현재 시간 윈도우에 해당하면 만료 알림을 체크하고 푸시를 전송합니다.
"""

import logging
from datetime import datetime, time, timedelta

import pytz

from app.config import settings
from app.database import async_session
from app.services.expiry_checker import check_and_create_expiry_notifications
from app.services.push_service import send_push_to_family

logger = logging.getLogger(__name__)

INTERVAL_MINUTES = 15


async def scheduled_expiry_check():
    """15분마다 실행: 만료 알림 체크 + 푸시 전송."""
    try:
        tz = pytz.timezone(settings.timezone)
        now = datetime.now(tz)
        current_time = now.time()

        # 현재 15분 윈도우: (current_time - 15min, current_time]
        window_start = (
            datetime.combine(now.date(), current_time) - timedelta(minutes=INTERVAL_MINUTES)
        ).time()

        logger.info(f"스케줄러 실행: {now.strftime('%H:%M')} KST, 윈도우 {window_start.strftime('%H:%M')}-{current_time.strftime('%H:%M')}")

        async with async_session() as db:
            # 만료 알림 생성 (모든 가족)
            created = await check_and_create_expiry_notifications(db)

            if not created:
                return

            # 생성된 알림에 대해 푸시 전송
            for family_id, title, message, link in created:
                # 해당 가족의 push_time이 현재 윈도우에 있는지 확인
                from sqlalchemy import select
                from app.models.notification import NotificationSetting
                result = await db.execute(
                    select(NotificationSetting.push_time)
                    .where(NotificationSetting.family_id == family_id)
                    .limit(1)
                )
                row = result.scalar_one_or_none()
                if not row:
                    continue

                family_push_time = row
                if _time_in_window(family_push_time, window_start, current_time):
                    await send_push_to_family(db, family_id, title, message, link)

            logger.info(f"스케줄러 완료: {len(created)}건 알림 생성")
    except Exception as e:
        logger.error(f"스케줄러 에러: {e}", exc_info=True)


def _time_in_window(t: time, window_start: time, window_end: time) -> bool:
    """시간 t가 (window_start, window_end] 범위에 있는지 확인."""
    if window_start <= window_end:
        return window_start < t <= window_end
    # 자정을 넘는 경우 (예: 23:50 ~ 00:05)
    return t > window_start or t <= window_end

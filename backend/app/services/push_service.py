"""Web Push 전송 서비스."""

import asyncio
import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.notification import PushSubscription

logger = logging.getLogger(__name__)


def _send_one(subscription_info: dict, payload: str) -> None:
    """동기 webpush 호출 (asyncio.to_thread에서 실행)."""
    webpush(
        subscription_info=subscription_info,
        data=payload,
        vapid_private_key=settings.vapid_private_key,
        vapid_claims={"sub": settings.vapid_claim_email},
        timeout=10,
    )


async def send_push_to_family(
    db: AsyncSession,
    family_id,
    title: str,
    body: str,
    url: str = "/",
) -> int:
    """가족의 모든 구독 기기에 푸시 전송. 전송 성공 수를 반환."""
    if not settings.vapid_private_key or not settings.vapid_public_key:
        logger.warning("VAPID 키가 설정되지 않아 푸시 전송을 건너뜁니다.")
        return 0

    result = await db.execute(
        select(PushSubscription).where(PushSubscription.family_id == family_id)
    )
    subscriptions = result.scalars().all()
    if not subscriptions:
        return 0

    payload = json.dumps({"title": title, "body": body, "url": url}, ensure_ascii=False)
    success_count = 0
    stale_ids = []

    for sub in subscriptions:
        subscription_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
        }
        try:
            await asyncio.to_thread(_send_one, subscription_info, payload)
            success_count += 1
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                stale_ids.append(sub.id)
                logger.info(f"Stale push subscription 삭제: {sub.endpoint[:50]}...")
            else:
                logger.error(f"Push 전송 실패: {e}")
        except Exception as e:
            logger.error(f"Push 전송 예외: {e}")

    # stale 구독 정리
    if stale_ids:
        await db.execute(
            delete(PushSubscription).where(PushSubscription.id.in_(stale_ids))
        )
        await db.commit()

    logger.info(f"Push 전송 완료: family={family_id}, 성공={success_count}, stale={len(stale_ids)}")
    return success_count

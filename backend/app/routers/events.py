"""사용 이벤트 로깅 API — 수요 검증용."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.usage_event import UsageEvent
from app.models.user import User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/events", tags=["events"])


class EventRequest(BaseModel):
    event_type: str
    metadata: dict | None = None


@router.post("")
async def log_event(
    body: EventRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """사용 이벤트를 기록합니다."""
    event = UsageEvent(
        family_code=str(user.family_id) if user.family_id else "no-family",
        event_type=body.event_type,
        metadata_json=body.metadata,
    )
    db.add(event)
    await db.commit()
    return {"logged": True}

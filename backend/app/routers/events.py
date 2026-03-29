"""사용 이벤트 로깅 API — 수요 검증용."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.usage_event import UsageEvent
from app.routers.scan import verify_family_code

router = APIRouter(prefix="/api/events", tags=["events"])


class EventRequest(BaseModel):
    event_type: str
    metadata: dict | None = None


@router.post("")
async def log_event(
    body: EventRequest,
    code: str = Query(..., description="가정 코드"),
    family=Depends(verify_family_code),
    db: AsyncSession = Depends(get_db),
):
    """사용 이벤트를 기록합니다."""
    event = UsageEvent(
        family_code=code,
        event_type=body.event_type,
        metadata_json=body.metadata,
    )
    db.add(event)
    await db.commit()
    return {"logged": True}

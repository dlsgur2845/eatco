from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.storage_guide import StorageGuide
from app.schemas.storage_guide import StorageGuideResponse

router = APIRouter(prefix="/api/storage-guide", tags=["storage-guide"])


@router.get("/lookup", response_model=StorageGuideResponse | None)
async def lookup_storage(
    name: str = Query(..., description="식재료 이름 (키워드 매칭)"),
    db: AsyncSession = Depends(get_db),
):
    """상품명에 포함된 키워드로 보관기한 가이드를 조회합니다."""
    result = await db.execute(select(StorageGuide))
    guides = result.scalars().all()

    name_lower = name.lower()

    # keywords 필드에서 매칭 — 가장 긴 keyword 우선
    best_match = None
    best_len = 0
    for guide in guides:
        all_keywords = [guide.keyword] + (guide.keywords.split(",") if guide.keywords else [])
        for kw in all_keywords:
            kw_stripped = kw.strip().lower()
            if len(kw_stripped) >= 2 and kw_stripped in name_lower and len(kw_stripped) > best_len:
                best_match = guide
                best_len = len(kw_stripped)

    return best_match


@router.get("/suggest", response_model=list[StorageGuideResponse])
async def suggest_storage(
    q: str = Query(..., min_length=1, description="검색어"),
    db: AsyncSession = Depends(get_db),
):
    """실시간 검색 추천 — 키워드에 검색어가 포함된 항목을 반환합니다."""
    result = await db.execute(select(StorageGuide))
    guides = result.scalars().all()

    q_lower = q.lower()
    matches: list[tuple[int, StorageGuide]] = []

    for guide in guides:
        all_keywords = [guide.keyword] + (guide.keywords.split(",") if guide.keywords else [])
        for kw in all_keywords:
            kw_stripped = kw.strip().lower()
            if kw_stripped and q_lower in kw_stripped:
                # 우선순위: keyword 시작 매칭 > 부분 매칭, 짧은 키워드 우선
                priority = 0 if kw_stripped.startswith(q_lower) else 1
                matches.append((priority, guide))
                break  # 같은 guide 중복 방지

    # 정렬: 시작 매칭 우선, 그 다음 keyword 길이 짧은 순
    matches.sort(key=lambda x: (x[0], len(x[1].keyword)))
    return [m[1] for m in matches[:15]]

"""영수증/스크린샷 스캔 API.

    POST /api/scan — 이미지 업로드 → OCR → 카테고리 매핑 → 식재료 등록
    GET  /api/scan/items — 가정별 식재료 목록 (대시보드용)
    DELETE /api/scan/items/{id} — 식재료 삭제 ("썼어요")
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.ingredient import Ingredient, StorageMethod
from app.models.user import Family, User
from app.routers.auth import get_current_user
from app.config import settings

limiter = Limiter(key_func=get_remote_address)
from app.services.category_mapper import MappedItem, map_ocr_results
from app.services.ocr_service import OCRError, scan_image, scan_image_gemini

router = APIRouter(prefix="/api/scan", tags=["scan"])

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


# --- Schemas ---

class ScannedItemResponse(BaseModel):
    name: str
    matched_keyword: str | None
    normalized_name: str | None = None
    storage_method: str
    shelf_life_days: int
    expiry_date: date
    confidence: float
    auto_matched: bool
    quantity: str | None = None
    price: int | None = None


class ScanResponse(BaseModel):
    items: list[ScannedItemResponse]
    total: int
    store_name: str | None = None


class RegisterRequest(BaseModel):
    items: list[ScannedItemResponse]
    store_name: str | None = None


class IngredientResponse(BaseModel):
    id: str
    name: str
    storage_method: str
    quantity: str | None
    price: int | None
    expiry_date: date
    registered_at: str
    registered_by: str | None
    days_left: int

    model_config = {"from_attributes": True}


# --- Dependencies ---

async def get_user_family_id(user: User = Depends(get_current_user)) -> uuid.UUID:
    if not user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹에 먼저 가입해주세요.")
    return user.family_id


# --- Endpoints ---

@router.post("/analyze", response_model=ScanResponse)
@limiter.limit(settings.rate_limit_scan)
async def analyze_receipt(
    request: Request,
    file: UploadFile = File(...),
    family_id: uuid.UUID = Depends(get_user_family_id),
):
    """이미지를 OCR 분석하여 식재료 목록을 반환합니다 (아직 등록하지 않음)."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=422, detail="JPG, PNG, WebP 이미지만 지원합니다.")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="이미지가 너무 큽니다 (최대 10MB).")

    provider = settings.ocr_provider
    today = date.today()

    # Gemini 경로: 이미지 → 매장명 + 식재료 JSON 직접 추출
    if provider == "gemini" and settings.gemini_api_key:
        try:
            result = await scan_image_gemini(image_bytes, file.content_type or "image/jpeg")
        except OCRError as e:
            raise HTTPException(status_code=503, detail=str(e))

        from datetime import timedelta
        items = [
            ScannedItemResponse(
                name=gi.name,
                matched_keyword=gi.name,
                normalized_name=gi.normalized_name,
                storage_method=gi.storage_method,
                shelf_life_days=gi.shelf_life_days,
                expiry_date=today + timedelta(days=gi.shelf_life_days),
                confidence=gi.confidence,
                auto_matched=True,
                quantity=str(gi.quantity) if gi.quantity is not None else None,
                price=int(gi.price) if gi.price is not None else None,
            )
            for gi in result.items
        ]
        return ScanResponse(items=items, total=len(items), store_name=result.store_name)

    # CLOVA / Mock 경로: OCR → 텍스트 → 카테고리 매핑
    try:
        ocr_lines = await scan_image(image_bytes, file.content_type or "image/jpeg")
    except OCRError as e:
        raise HTTPException(status_code=503, detail=str(e))

    if not ocr_lines:
        return ScanResponse(items=[], total=0)

    mapped = map_ocr_results(ocr_lines)
    items = [
        ScannedItemResponse(
            name=m.name,
            matched_keyword=m.matched_keyword,
            storage_method=m.storage_method,
            shelf_life_days=m.shelf_life_days,
            expiry_date=m.expiry_date,
            confidence=m.confidence,
            auto_matched=m.auto_matched,
        )
        for m in mapped
    ]

    return ScanResponse(items=items, total=len(items))


@router.post("/register")
async def register_items(
    body: RegisterRequest,
    user: User = Depends(get_current_user),
    family_id: uuid.UUID = Depends(get_user_family_id),
    db: AsyncSession = Depends(get_db),
):
    """분석된 식재료를 가정 냉장고에 등록합니다."""
    storage_map = {
        "refrigerated": StorageMethod.REFRIGERATED,
        "frozen": StorageMethod.FROZEN,
        "room_temp": StorageMethod.ROOM_TEMP,
    }

    from app.services.normalizer import normalize_local

    created = []
    for item in body.items:
        # Gemini가 이미 normalized_name을 제공했으면 사용, 아니면 로컬 폴백
        normalized = item.normalized_name or normalize_local(item.name)
        ingredient = Ingredient(
            name=item.name,
            storage_method=storage_map.get(item.storage_method, StorageMethod.REFRIGERATED),
            quantity=item.quantity,
            price=item.price,
            expiry_date=item.expiry_date,
            family_id=family_id,
            registered_by=user.nickname,
            normalized_name=normalized,
            store_name=body.store_name,
        )
        db.add(ingredient)
        created.append(ingredient)

    await db.commit()
    return {"registered": len(created)}


@router.get("/items", response_model=list[IngredientResponse])
async def get_items(
    family_id: uuid.UUID = Depends(get_user_family_id),
    db: AsyncSession = Depends(get_db),
):
    """가정의 식재료 목록을 소비기한 순으로 반환합니다."""
    result = await db.execute(
        select(Ingredient)
        .where(Ingredient.family_id == family_id)
        .order_by(Ingredient.expiry_date.asc())
    )
    ingredients = result.scalars().all()
    today = date.today()

    return [
        IngredientResponse(
            id=str(ing.id),
            name=ing.name,
            storage_method=ing.storage_method.value,
            quantity=ing.quantity,
            price=ing.price,
            expiry_date=ing.expiry_date,
            registered_at=ing.registered_at.isoformat() if ing.registered_at else "",
            registered_by=ing.registered_by,
            days_left=(ing.expiry_date - today).days,
        )
        for ing in ingredients
    ]


class UpdateItemRequest(BaseModel):
    quantity: str | None = None
    price: int | None = None
    name: str | None = None
    expiry_date: date | None = None


@router.patch("/items/{item_id}")
async def update_item(
    item_id: str,
    body: UpdateItemRequest,
    family_id: uuid.UUID = Depends(get_user_family_id),
    db: AsyncSession = Depends(get_db),
):
    """식재료 정보를 수정합니다 (수량 변경 등)."""
    try:
        uid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="잘못된 ID 형식입니다.")

    result = await db.execute(
        select(Ingredient).where(
            Ingredient.id == uid,
            Ingredient.family_id == family_id,
        )
    )
    ingredient = result.scalar_one_or_none()
    if not ingredient:
        raise HTTPException(status_code=404, detail="식재료를 찾을 수 없습니다.")

    if body.quantity is not None:
        ingredient.quantity = body.quantity
    if body.price is not None:
        ingredient.price = body.price
    if body.name is not None:
        ingredient.name = body.name
    if body.expiry_date is not None:
        ingredient.expiry_date = body.expiry_date

    await db.commit()
    return {"updated": True}


@router.delete("/items/{item_id}")
async def delete_item(
    item_id: str,
    family_id: uuid.UUID = Depends(get_user_family_id),
    db: AsyncSession = Depends(get_db),
):
    """식재료를 삭제합니다 ("썼어요")."""
    try:
        uid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="잘못된 ID 형식입니다.")

    result = await db.execute(
        select(Ingredient).where(
            Ingredient.id == uid,
            Ingredient.family_id == family_id,
        )
    )
    ingredient = result.scalar_one_or_none()
    if not ingredient:
        raise HTTPException(status_code=404, detail="식재료를 찾을 수 없습니다.")

    await db.delete(ingredient)
    await db.commit()
    return {"deleted": True}

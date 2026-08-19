"""나만의 레시피 CRUD API + 이미지 업로드."""

import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db

UPLOAD_DIR = os.path.join(settings.upload_dir, "recipes")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

# 확장자는 사용자가 보낸 filename 이 아니라 **실제 바이트**로 정한다.
# 예전에는 file.filename 의 확장자를 그대로 썼고 검사는 클라이언트가 보낸
# content_type 헤더뿐이었다. Content-Type: image/png + filename "x.html" 이면
# /uploads/<uuid>.html 로 저장되어 StaticFiles 가 앱 자체 오리진에서 HTML 로
# 서빙한다 = 저장형 XSS.
_MAGIC = (
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
)


def _sniff_image_ext(data: bytes) -> str | None:
    """이미지 시그니처로 확장자를 판정. 모르면 None."""
    for magic, ext in _MAGIC:
        if data.startswith(magic):
            return ext
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None
MAX_IMAGE_SIZE = 30 * 1024 * 1024  # 30MB (미러리스 원본 대응)
from app.models.custom_recipe import CustomRecipe
from app.models.user import User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/custom-recipes", tags=["custom-recipes"])


class RecipeCreate(BaseModel):
    name: str
    category: str = "기타"
    cooking_method: str = "기타"
    calories: str | None = None
    ingredients: list[str] = []
    manual_steps: list[str] = []
    tip: str | None = None


class RecipeUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    cooking_method: str | None = None
    calories: str | None = None
    ingredients: list[str] | None = None
    manual_steps: list[str] | None = None
    tip: str | None = None


class RecipeResponse(BaseModel):
    id: uuid.UUID
    name: str
    category: str
    cooking_method: str
    calories: str | None
    ingredients: list[str]
    manual_steps: list[str]
    tip: str | None
    image_url: str | None
    created_by: str | None
    created_at: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[RecipeResponse])
async def list_recipes(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """가족의 나만의 레시피 목록."""
    if not user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹에 먼저 가입해주세요.")

    result = await db.execute(
        select(CustomRecipe)
        .where(CustomRecipe.family_id == user.family_id)
        .order_by(CustomRecipe.created_at.desc())
    )
    recipes = result.scalars().all()
    return [
        RecipeResponse(
            id=r.id,
            name=r.name,
            category=r.category,
            cooking_method=r.cooking_method,
            calories=r.calories,
            ingredients=r.ingredients or [],
            manual_steps=r.manual_steps or [],
            tip=r.tip,
            image_url=r.image_url,
            created_by=r.created_by,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in recipes
    ]


@router.post("", response_model=RecipeResponse, status_code=201)
async def create_recipe(
    data: RecipeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """나만의 레시피 등록."""
    if not user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹에 먼저 가입해주세요.")

    recipe = CustomRecipe(
        family_id=user.family_id,
        name=data.name,
        category=data.category,
        cooking_method=data.cooking_method,
        calories=data.calories,
        ingredients=data.ingredients,
        manual_steps=data.manual_steps,
        tip=data.tip,
        created_by=user.nickname,
    )
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)

    return RecipeResponse(
        id=recipe.id,
        name=recipe.name,
        category=recipe.category,
        cooking_method=recipe.cooking_method,
        calories=recipe.calories,
        ingredients=recipe.ingredients or [],
        manual_steps=recipe.manual_steps or [],
        tip=recipe.tip,
        image_url=recipe.image_url,
        created_by=recipe.created_by,
        created_at=recipe.created_at.isoformat() if recipe.created_at else "",
    )


@router.put("/{recipe_id}", response_model=RecipeResponse)
async def update_recipe(
    recipe_id: str,
    data: RecipeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """나만의 레시피 수정."""
    try:
        uid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="잘못된 ID입니다.")

    result = await db.execute(
        select(CustomRecipe).where(
            CustomRecipe.id == uid,
            CustomRecipe.family_id == user.family_id,
        )
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="레시피를 찾을 수 없습니다.")

    if data.name is not None: recipe.name = data.name
    if data.category is not None: recipe.category = data.category
    if data.cooking_method is not None: recipe.cooking_method = data.cooking_method
    if data.calories is not None: recipe.calories = data.calories
    if data.ingredients is not None: recipe.ingredients = data.ingredients
    if data.manual_steps is not None: recipe.manual_steps = data.manual_steps
    if data.tip is not None: recipe.tip = data.tip

    await db.commit()
    await db.refresh(recipe)

    return RecipeResponse(
        id=recipe.id,
        name=recipe.name,
        category=recipe.category,
        cooking_method=recipe.cooking_method,
        calories=recipe.calories,
        ingredients=recipe.ingredients or [],
        manual_steps=recipe.manual_steps or [],
        tip=recipe.tip,
        image_url=recipe.image_url,
        created_by=recipe.created_by,
        created_at=recipe.created_at.isoformat() if recipe.created_at else "",
    )


@router.delete("/{recipe_id}")
async def delete_recipe(
    recipe_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """나만의 레시피 삭제."""
    try:
        uid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="잘못된 ID입니다.")

    result = await db.execute(
        select(CustomRecipe).where(
            CustomRecipe.id == uid,
            CustomRecipe.family_id == user.family_id,
        )
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="레시피를 찾을 수 없습니다.")

    # 이미지 파일도 삭제
    if recipe.image_url:
        file_path = recipe.image_url.replace("/uploads/", settings.upload_dir + "/", 1)
        if os.path.exists(file_path):
            os.remove(file_path)

    await db.delete(recipe)
    await db.commit()
    return {"deleted": True}


@router.post("/{recipe_id}/image")
async def upload_image(
    recipe_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """레시피 이미지 업로드. UUID 파일명으로 저장."""
    try:
        uid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="잘못된 ID입니다.")

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=422, detail="JPG, PNG, WebP 이미지만 지원합니다.")

    result = await db.execute(
        select(CustomRecipe).where(
            CustomRecipe.id == uid,
            CustomRecipe.family_id == user.family_id,
        )
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="레시피를 찾을 수 없습니다.")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="이미지가 너무 큽니다 (최대 5MB).")

    # 기존 이미지 삭제
    if recipe.image_url:
        old_path = recipe.image_url.replace("/uploads/", settings.upload_dir + "/", 1)
        if os.path.exists(old_path):
            os.remove(old_path)

    # UUID 파일명으로 저장. 확장자는 실제 바이트에서만 얻는다.
    ext = _sniff_image_ext(image_bytes)
    if ext is None:
        raise HTTPException(status_code=422, detail="JPG, PNG, WebP 이미지만 지원합니다.")
    filename = f"{uuid.uuid4()}.{ext}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(image_bytes)

    # DB 업데이트
    recipe.image_url = f"/uploads/recipes/{filename}"
    await db.commit()

    return {"image_url": recipe.image_url}

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.ingredient import Ingredient
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.ingredient import DashboardSummary, IngredientResponse

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def get_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    critical_date = today + timedelta(days=3)
    warning_date = today + timedelta(days=7)
    fid = current_user.family_id

    critical = await db.scalar(
        select(func.count()).select_from(Ingredient).where(
            Ingredient.family_id == fid, Ingredient.expiry_date <= critical_date
        )
    )
    warning = await db.scalar(
        select(func.count()).select_from(Ingredient).where(
            Ingredient.family_id == fid,
            Ingredient.expiry_date > critical_date,
            Ingredient.expiry_date <= warning_date,
        )
    )
    total = await db.scalar(
        select(func.count()).select_from(Ingredient).where(Ingredient.family_id == fid)
    )
    safe = (total or 0) - (critical or 0) - (warning or 0)

    return DashboardSummary(critical=critical or 0, warning=warning or 0, safe=safe)


@router.get("/recent", response_model=list[IngredientResponse])
async def get_recent(
    limit: int = 5,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ingredient)
        .where(Ingredient.family_id == current_user.family_id)
        .order_by(Ingredient.registered_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/expiring", response_model=list[IngredientResponse])
async def get_expiring(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    result = await db.execute(
        select(Ingredient)
        .where(Ingredient.family_id == current_user.family_id, Ingredient.expiry_date >= today)
        .order_by(Ingredient.expiry_date.asc())
        .limit(10)
    )
    return result.scalars().all()

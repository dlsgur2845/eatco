"""가계부 API — 월별 지출, 식재료별 가격 추이, 인플레이션 알림, 매장 비교, 예산."""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.ingredient import Ingredient
from app.models.user import Family, User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


# --- Schemas ---

class MonthlyExpense(BaseModel):
    month: str  # "2026-03"
    total: int
    count: int


class ItemPricePoint(BaseModel):
    date: str
    price: int
    store_name: str | None = None
    quantity: str | None = None


class CategoryExpense(BaseModel):
    category: str
    total: int
    count: int


class InflationAlert(BaseModel):
    name: str
    current_price: int
    old_price: int
    change_pct: float


class StoreComparison(BaseModel):
    store_name: str
    latest_price: int
    latest_date: str


class BudgetInfo(BaseModel):
    monthly_budget: int | None
    spent_this_month: int


# --- Dependencies ---

async def get_family_id(user: User = Depends(get_current_user)) -> uuid.UUID:
    if not user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹에 먼저 가입해주세요.")
    return user.family_id


# --- Endpoints ---

@router.get("/monthly", response_model=list[MonthlyExpense])
async def get_monthly_expenses(
    months: int = Query(default=6, ge=1, le=24),
    family_id: uuid.UUID = Depends(get_family_id),
    db: AsyncSession = Depends(get_db),
):
    """최근 N개월 월별 지출 요약."""
    cutoff = date.today().replace(day=1) - timedelta(days=30 * (months - 1))

    month_col = func.to_char(Ingredient.registered_at, 'YYYY-MM').label('month')
    result = await db.execute(
        select(
            month_col,
            func.coalesce(func.sum(Ingredient.price), 0).label('total'),
            func.count().label('count'),
        )
        .where(
            Ingredient.family_id == family_id,
            Ingredient.price.isnot(None),
            Ingredient.registered_at >= cutoff,
        )
        .group_by(month_col)
        .order_by(month_col)
    )

    return [MonthlyExpense(month=r.month, total=r.total, count=r.count) for r in result.all()]


@router.get("/by-item", response_model=list[ItemPricePoint])
async def get_item_prices(
    name: str = Query(...),
    family_id: uuid.UUID = Depends(get_family_id),
    db: AsyncSession = Depends(get_db),
):
    """특정 식재료의 가격 이력."""
    result = await db.execute(
        select(Ingredient)
        .where(
            Ingredient.family_id == family_id,
            Ingredient.price.isnot(None),
            (Ingredient.normalized_name == name) | (Ingredient.name.ilike(f"%{name}%")),
        )
        .order_by(Ingredient.registered_at.asc())
    )

    items = result.scalars().all()
    return [
        ItemPricePoint(
            date=i.registered_at.strftime('%Y-%m-%d'),
            price=i.price,
            store_name=i.store_name,
            quantity=i.quantity,
        )
        for i in items
    ]


@router.get("/by-category", response_model=list[CategoryExpense])
async def get_category_expenses(
    month: str = Query(default=None, description="YYYY-MM"),
    family_id: uuid.UUID = Depends(get_family_id),
    db: AsyncSession = Depends(get_db),
):
    """보관방법별 지출 비율."""
    target_month = month or date.today().strftime('%Y-%m')
    month_filter = func.to_char(Ingredient.registered_at, 'YYYY-MM')

    result = await db.execute(
        select(
            Ingredient.storage_method.label('category'),
            func.coalesce(func.sum(Ingredient.price), 0).label('total'),
            func.count().label('count'),
        )
        .where(
            Ingredient.family_id == family_id,
            Ingredient.price.isnot(None),
            month_filter == target_month,
        )
        .group_by(Ingredient.storage_method)
    )

    method_labels = {'REFRIGERATED': '냉장', 'FROZEN': '냉동', 'ROOM_TEMP': '실온'}
    return [
        CategoryExpense(
            category=method_labels.get(str(r.category).upper(), str(r.category)),
            total=r.total,
            count=r.count,
        )
        for r in result.all()
    ]


@router.get("/alerts", response_model=list[InflationAlert])
async def get_inflation_alerts(
    family_id: uuid.UUID = Depends(get_family_id),
    db: AsyncSession = Depends(get_db),
):
    """인플레이션 알림 — 3개월 전 대비 30% 이상 상승한 식재료."""
    today = date.today()
    three_months_ago = today - timedelta(days=90)

    # normalized_name이 있고 가격이 있는 항목만
    result = await db.execute(
        select(Ingredient)
        .where(
            Ingredient.family_id == family_id,
            Ingredient.price.isnot(None),
            Ingredient.normalized_name.isnot(None),
            Ingredient.registered_at >= three_months_ago,
        )
        .order_by(Ingredient.registered_at.asc())
    )

    items = result.scalars().all()

    # normalized_name별로 그룹핑
    groups: dict[str, list] = {}
    for item in items:
        groups.setdefault(item.normalized_name, []).append(item)

    alerts: list[InflationAlert] = []
    for name, group in groups.items():
        if len(group) < 2:
            continue

        old_price = group[0].price
        new_price = group[-1].price

        if old_price and old_price > 0:
            change = ((new_price - old_price) / old_price) * 100
            if change >= 30:
                alerts.append(InflationAlert(
                    name=name,
                    current_price=new_price,
                    old_price=old_price,
                    change_pct=round(change, 1),
                ))

    return alerts


@router.get("/compare", response_model=list[StoreComparison])
async def compare_stores(
    name: str = Query(...),
    family_id: uuid.UUID = Depends(get_family_id),
    db: AsyncSession = Depends(get_db),
):
    """매장별 가격 비교."""
    result = await db.execute(
        select(Ingredient)
        .where(
            Ingredient.family_id == family_id,
            Ingredient.price.isnot(None),
            Ingredient.store_name.isnot(None),
            (Ingredient.normalized_name == name) | (Ingredient.name.ilike(f"%{name}%")),
        )
        .order_by(Ingredient.registered_at.desc())
    )

    items = result.scalars().all()

    # 매장별 최신 가격
    store_latest: dict[str, tuple] = {}
    for item in items:
        if item.store_name and item.store_name not in store_latest:
            store_latest[item.store_name] = (item.price, item.registered_at.strftime('%Y-%m-%d'))

    return [
        StoreComparison(store_name=store, latest_price=price, latest_date=dt)
        for store, (price, dt) in store_latest.items()
    ]


@router.get("/budget", response_model=BudgetInfo)
async def get_budget(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """현재 예산 + 이번 달 지출."""
    if not user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹에 먼저 가입해주세요.")

    family = await db.get(Family, user.family_id)
    budget = family.monthly_budget if family else None

    this_month = date.today().strftime('%Y-%m')
    result = await db.execute(
        select(func.coalesce(func.sum(Ingredient.price), 0))
        .where(
            Ingredient.family_id == user.family_id,
            Ingredient.price.isnot(None),
            func.to_char(Ingredient.registered_at, 'YYYY-MM') == this_month,
        )
    )
    spent = result.scalar() or 0

    return BudgetInfo(monthly_budget=budget, spent_this_month=spent)


@router.post("/budget")
async def set_budget(
    amount: int = Query(..., ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """월별 예산 설정."""
    if not user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹에 먼저 가입해주세요.")

    family = await db.get(Family, user.family_id)
    if not family:
        raise HTTPException(status_code=404, detail="가족을 찾을 수 없습니다.")

    family.monthly_budget = amount
    await db.commit()
    return {"monthly_budget": amount}

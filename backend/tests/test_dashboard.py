"""Dashboard API 유닛테스트 (가족 단위 격리)."""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_dashboard_summary(auth_client: AsyncClient):
    await auth_client.post("/api/ingredients", json={
        "name": "임박1", "storage_method": "refrigerated", "quantity": 1,
        "expiry_date": str(date.today() + timedelta(days=1)),
    })
    await auth_client.post("/api/ingredients", json={
        "name": "경고1", "storage_method": "refrigerated", "quantity": 1,
        "expiry_date": str(date.today() + timedelta(days=5)),
    })
    await auth_client.post("/api/ingredients", json={
        "name": "안전1", "storage_method": "frozen", "quantity": 1,
        "expiry_date": str(date.today() + timedelta(days=30)),
    })

    res = await auth_client.get("/api/dashboard/summary")
    assert res.status_code == 200
    data = res.json()
    assert data["critical"] >= 1
    assert data["safe"] >= 1


@pytest.mark.asyncio
async def test_dashboard_recent(auth_client: AsyncClient):
    await auth_client.post("/api/ingredients", json={
        "name": "최근등록", "storage_method": "refrigerated", "quantity": 1,
        "expiry_date": str(date.today() + timedelta(days=7)),
    })
    res = await auth_client.get("/api/dashboard/recent")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_dashboard_expiring(auth_client: AsyncClient):
    res = await auth_client.get("/api/dashboard/expiring")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_dashboard_requires_auth(client: AsyncClient):
    res = await client.get("/api/dashboard/summary")
    assert res.status_code == 401

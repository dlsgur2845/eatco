"""Ingredients CRUD 유닛테스트 (가족 단위 격리)."""

from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_create_ingredient(auth_client: AsyncClient):
    res = await auth_client.post(
        "/api/ingredients",
        json={
            "name": "유기농 우유 1L",
            "storage_method": "refrigerated",
            "quantity": 1,
            "expiry_date": str(date.today() + timedelta(days=5)),
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "유기농 우유 1L"
    assert data["family_id"] is not None  # 서버에서 자동 설정


@pytest.mark.asyncio
async def test_list_ingredients_family_scoped(auth_client: AsyncClient):
    """같은 가족만 볼 수 있어야 함."""
    await auth_client.post(
        "/api/ingredients",
        json={"name": "시금치", "storage_method": "refrigerated", "quantity": 1,
              "expiry_date": str(date.today() + timedelta(days=3))},
    )
    res = await auth_client.get("/api/ingredients")
    assert res.status_code == 200
    items = res.json()
    assert isinstance(items, list)
    # 모든 아이템이 같은 family_id를 가져야 함
    if items:
        fid = items[0]["family_id"]
        assert all(i["family_id"] == fid for i in items)


@pytest.mark.asyncio
async def test_other_family_cannot_see():
    """다른 가족의 재료는 보이지 않아야 함."""
    from app.main import app
    transport = ASGITransport(app=app)

    # User A: 재료 등록
    async with AsyncClient(transport=transport, base_url="http://test") as ca:
        res = await ca.post("/api/auth/register", json={"email": "a@eatco.com", "nickname": "A", "password": "pass1234"})
        ca.cookies.set("eatco_token", res.cookies.get("eatco_token"))
        await ca.post("/api/ingredients", json={
            "name": "A의 우유", "storage_method": "refrigerated", "quantity": 1,
            "expiry_date": str(date.today() + timedelta(days=5)),
        })

    # User B: 재료 목록 조회
    async with AsyncClient(transport=transport, base_url="http://test") as cb:
        res = await cb.post("/api/auth/register", json={"email": "b@eatco.com", "nickname": "B", "password": "pass1234"})
        cb.cookies.set("eatco_token", res.cookies.get("eatco_token"))
        list_res = await cb.get("/api/ingredients")
        assert list_res.status_code == 200
        names = [i["name"] for i in list_res.json()]
        assert "A의 우유" not in names


@pytest.mark.asyncio
async def test_list_ingredients_filter_storage(auth_client: AsyncClient):
    await auth_client.post(
        "/api/ingredients",
        json={"name": "냉동 블루베리", "storage_method": "frozen", "quantity": 1,
              "expiry_date": str(date.today() + timedelta(days=180))},
    )
    res = await auth_client.get("/api/ingredients", params={"storage_method": "frozen"})
    assert res.status_code == 200
    for item in res.json():
        assert item["storage_method"] == "frozen"


@pytest.mark.asyncio
async def test_list_ingredients_search(auth_client: AsyncClient):
    await auth_client.post(
        "/api/ingredients",
        json={"name": "제주 흙당근", "storage_method": "refrigerated", "quantity": 1,
              "expiry_date": str(date.today() + timedelta(days=7))},
    )
    res = await auth_client.get("/api/ingredients", params={"search": "당근"})
    assert res.status_code == 200
    assert any("당근" in i["name"] for i in res.json())


@pytest.mark.asyncio
async def test_get_ingredient(auth_client: AsyncClient):
    create = await auth_client.post(
        "/api/ingredients",
        json={"name": "양배추", "storage_method": "refrigerated", "quantity": 1,
              "expiry_date": str(date.today() + timedelta(days=14))},
    )
    iid = create.json()["id"]
    res = await auth_client.get(f"/api/ingredients/{iid}")
    assert res.status_code == 200
    assert res.json()["name"] == "양배추"


@pytest.mark.asyncio
async def test_update_ingredient(auth_client: AsyncClient):
    create = await auth_client.post(
        "/api/ingredients",
        json={"name": "두부", "storage_method": "refrigerated", "quantity": 1,
              "expiry_date": str(date.today() + timedelta(days=5))},
    )
    iid = create.json()["id"]
    res = await auth_client.put(f"/api/ingredients/{iid}", json={"quantity": 3})
    assert res.status_code == 200
    assert res.json()["quantity"] == 3


@pytest.mark.asyncio
async def test_delete_ingredient(auth_client: AsyncClient):
    create = await auth_client.post(
        "/api/ingredients",
        json={"name": "삭제대상", "storage_method": "room_temp", "quantity": 1,
              "expiry_date": str(date.today() + timedelta(days=30))},
    )
    iid = create.json()["id"]
    res = await auth_client.delete(f"/api/ingredients/{iid}")
    assert res.status_code == 204


@pytest.mark.asyncio
async def test_batch_delete(auth_client: AsyncClient):
    ids = []
    for name in ["삭제1", "삭제2"]:
        r = await auth_client.post(
            "/api/ingredients",
            json={"name": name, "storage_method": "room_temp", "quantity": 1,
                  "expiry_date": str(date.today() + timedelta(days=10))},
        )
        ids.append(r.json()["id"])
    res = await auth_client.post("/api/ingredients/batch-delete", json={"ids": ids})
    assert res.status_code == 204

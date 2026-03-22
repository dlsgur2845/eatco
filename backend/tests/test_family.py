"""Family (가족 그룹) 유닛테스트."""

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_create_family(auth_client: AsyncClient):
    res = await auth_client.post("/api/auth/family", json={"name": "우리 가족"})
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "우리 가족"
    assert len(data["invite_code"]) > 0
    assert len(data["members"]) >= 1


@pytest.mark.asyncio
async def test_join_family():
    from app.main import app

    transport = ASGITransport(app=app)

    # User 1: register + create family
    async with AsyncClient(transport=transport, base_url="http://test") as c1:
        res1 = await c1.post("/api/auth/register", json={"email": "owner@eatco.com", "nickname": "주인", "password": "pass1234"})
        assert res1.status_code == 201
        token1 = res1.cookies.get("eatco_token")
        if token1:
            c1.cookies.set("eatco_token", token1)

        create_res = await c1.post("/api/auth/family", json={"name": "참여테스트"})
        assert create_res.status_code == 201
        invite_code = create_res.json()["invite_code"]

    # User 2: register + join family
    async with AsyncClient(transport=transport, base_url="http://test") as c2:
        res2 = await c2.post("/api/auth/register", json={"email": "member@eatco.com", "nickname": "멤버", "password": "pass1234"})
        assert res2.status_code == 201
        token2 = res2.cookies.get("eatco_token")
        if token2:
            c2.cookies.set("eatco_token", token2)

        join_res = await c2.post("/api/auth/family/join", json={"invite_code": invite_code})
        assert join_res.status_code == 200
        assert join_res.json()["name"] == "참여테스트"
        assert len(join_res.json()["members"]) >= 1


@pytest.mark.asyncio
async def test_join_invalid_code(auth_client: AsyncClient):
    res = await auth_client.post("/api/auth/family/join", json={"invite_code": "INVALID9"})
    assert res.status_code == 404

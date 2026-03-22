"""Auth (회원가입/로그인/로그아웃) 유닛테스트."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    res = await client.post(
        "/api/auth/register",
        json={"email": "new@eatco.com", "nickname": "신규유저", "password": "pass1234"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "new@eatco.com"
    assert data["nickname"] == "신규유저"
    assert data["family_id"] is not None  # 1인 가족 자동 생성
    assert "eatco_token" in res.cookies


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={"email": "dup@eatco.com", "nickname": "첫번째", "password": "pass1234"},
    )
    res = await client.post(
        "/api/auth/register",
        json={"email": "dup@eatco.com", "nickname": "두번째", "password": "pass1234"},
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={"email": "login@eatco.com", "nickname": "로그인", "password": "pass1234"},
    )
    res = await client.post(
        "/api/auth/login",
        json={"email": "login@eatco.com", "password": "pass1234"},
    )
    assert res.status_code == 200
    assert "eatco_token" in res.cookies


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={"email": "wrong@eatco.com", "nickname": "잘못", "password": "pass1234"},
    )
    res = await client.post(
        "/api/auth/login",
        json={"email": "wrong@eatco.com", "password": "wrongpass"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_logout(auth_client: AsyncClient):
    res = await auth_client.post("/api/auth/logout")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_me_authenticated(auth_client: AsyncClient):
    res = await auth_client.get("/api/auth/me")
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "test@eatco.com"
    assert data["family_id"] is not None


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    res = await client.get("/api/auth/me")
    assert res.status_code == 401

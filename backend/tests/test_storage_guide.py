"""Storage Guide API 유닛테스트."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_lookup_exact_keyword(client: AsyncClient):
    res = await client.get("/api/storage-guide/lookup", params={"name": "우유"})
    assert res.status_code == 200
    data = res.json()
    assert data is not None
    assert data["keyword"] == "우유"
    assert data["refrigerated_days"] == 7


@pytest.mark.asyncio
async def test_lookup_in_product_name(client: AsyncClient):
    res = await client.get("/api/storage-guide/lookup", params={"name": "유기농 우유 1L"})
    assert res.status_code == 200
    data = res.json()
    assert data is not None
    assert data["keyword"] == "우유"


@pytest.mark.asyncio
async def test_lookup_frozen_item(client: AsyncClient):
    res = await client.get("/api/storage-guide/lookup", params={"name": "냉동 블루베리"})
    assert res.status_code == 200
    data = res.json()
    assert data is not None
    assert data["keyword"] == "블루베리"
    assert data["frozen_days"] == 365


@pytest.mark.asyncio
async def test_lookup_no_match(client: AsyncClient):
    res = await client.get("/api/storage-guide/lookup", params={"name": "완전없는재료qqq"})
    assert res.status_code == 200
    assert res.json() is None


@pytest.mark.asyncio
async def test_lookup_longest_match(client: AsyncClient):
    """고등어는 '생선'보다 '고등어' 키워드가 우선 매칭."""
    res = await client.get("/api/storage-guide/lookup", params={"name": "간고등어"})
    assert res.status_code == 200
    data = res.json()
    assert data is not None
    assert data["keyword"] == "고등어"
    assert data["refrigerated_days"] == 2
    assert data["frozen_days"] == 90


@pytest.mark.asyncio
async def test_lookup_kimchi(client: AsyncClient):
    res = await client.get("/api/storage-guide/lookup", params={"name": "종가집 김치"})
    assert res.status_code == 200
    data = res.json()
    assert data is not None
    assert data["keyword"] == "김치"
    assert data["refrigerated_days"] == 90


@pytest.mark.asyncio
async def test_suggest_korean(client: AsyncClient):
    """한국어 자동완성 검색."""
    res = await client.get("/api/storage-guide/suggest", params={"q": "참"})
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    keywords = [d["keyword"] for d in data]
    assert "참치" in keywords


@pytest.mark.asyncio
async def test_suggest_english(client: AsyncClient):
    """영어 키워드로 검색."""
    res = await client.get("/api/storage-guide/suggest", params={"q": "salmon"})
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    assert any("연어" in d["keyword"] for d in data)


@pytest.mark.asyncio
async def test_suggest_empty(client: AsyncClient):
    """매칭 없는 검색어."""
    res = await client.get("/api/storage-guide/suggest", params={"q": "xyznotfound"})
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_suggest_max_results(client: AsyncClient):
    """결과는 최대 15개까지."""
    res = await client.get("/api/storage-guide/suggest", params={"q": "고"})
    assert res.status_code == 200
    data = res.json()
    assert len(data) <= 15

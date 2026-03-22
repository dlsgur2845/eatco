"""Categories API 유닛테스트."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_categories(client: AsyncClient):
    res = await client.get("/api/categories")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 8
    names = [c["name"] for c in data]
    assert "유제품" in names
    assert "채소/과일" in names
    assert "육류/수산" in names

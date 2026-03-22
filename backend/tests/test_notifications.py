"""Notifications API 유닛테스트."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_notification_settings(client: AsyncClient):
    res = await client.get("/api/notifications/settings")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 8
    days = [s["days_before"] for s in data]
    assert 0 in days
    assert 1 in days
    assert 3 in days

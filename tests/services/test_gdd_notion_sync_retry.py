"""Tests politique backoff sync Notion."""
import pytest
import httpx

from services.gdd_notion_sync_retry import SyncBackoffPolicy, run_with_retries


@pytest.mark.asyncio
async def test_backoff_delay_caps() -> None:
    p = SyncBackoffPolicy(initial_seconds=1.0, multiplier=10.0, max_seconds=50.0)
    assert p.delay_after_attempt(0) == 1.0
    assert p.delay_after_attempt(2) == 50.0


@pytest.mark.asyncio
async def test_run_with_retries_succeeds_second_attempt() -> None:
    call_count = 0

    async def flaky() -> str:
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            req = httpx.Request("GET", "https://example.com")
            resp = httpx.Response(503, request=req)
            raise httpx.HTTPStatusError("x", request=req, response=resp)
        return "ok"

    policy = SyncBackoffPolicy(initial_seconds=0.01, multiplier=2.0, max_seconds=0.05)
    result = await run_with_retries(
        flaky,
        policy=policy,
        max_attempts=4,
        is_transient=lambda e: isinstance(e, httpx.HTTPStatusError)
        and e.response.status_code == 503,
    )
    assert result == "ok"
    assert call_count == 2

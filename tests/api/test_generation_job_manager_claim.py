"""Tests du verrouillage exclusif try_claim_stream_job."""
import pytest

from api.services.generation_job_manager import GenerationJobManager


@pytest.mark.asyncio
async def test_try_claim_stream_job_first_succeeds() -> None:
    """Le premier claim passe queued → running."""
    mgr = GenerationJobManager(ttl_seconds=3600)
    jid = mgr.create_job({"x": 1})
    ok = await mgr.try_claim_stream_job(jid)
    assert ok is True
    job = mgr.get_job(jid)
    assert job is not None
    assert job["status"] == "running"


@pytest.mark.asyncio
async def test_try_claim_stream_job_second_fails() -> None:
    """Un second claim sur le même job est refusé."""
    mgr = GenerationJobManager(ttl_seconds=3600)
    jid = mgr.create_job({"x": 1})
    assert await mgr.try_claim_stream_job(jid) is True
    assert await mgr.try_claim_stream_job(jid) is False

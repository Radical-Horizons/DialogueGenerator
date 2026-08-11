"""Tests du cleanup périodique partagé par les job managers batch (FR87/FR88)."""

from __future__ import annotations

import asyncio

import pytest

from api.services.batch_node_generation_job_manager import BatchNodeGenerationJobManager
from api.services.batch_validation_job_manager import BatchValidationJobManager
from api.services.in_memory_batch_job_manager import InMemoryBatchJobManager


@pytest.mark.asyncio
async def test_cleanup_task_purges_expired_jobs_without_polling() -> None:
    """Un job expiré doit disparaître via le sweep périodique, sans jamais
    appeler get_job — sinon il fuit en mémoire tant que personne ne le poll."""
    manager = InMemoryBatchJobManager(ttl_seconds=0, cleanup_interval_seconds=0.05)
    manager._register("job-1", {"total": 1})
    assert "job-1" in manager._jobs

    await manager.start_cleanup_task()
    try:
        await asyncio.sleep(0.2)
        assert "job-1" not in manager._jobs
    finally:
        await manager.stop_cleanup_task()


@pytest.mark.asyncio
async def test_start_cleanup_task_is_idempotent() -> None:
    """Un second `start_cleanup_task` ne doit pas remplacer la tâche en cours."""
    manager = InMemoryBatchJobManager(cleanup_interval_seconds=60)
    await manager.start_cleanup_task()
    first_task = manager._cleanup_task
    await manager.start_cleanup_task()
    try:
        assert manager._cleanup_task is first_task
    finally:
        await manager.stop_cleanup_task()


@pytest.mark.asyncio
async def test_stop_cleanup_task_without_start_is_a_noop() -> None:
    """Arrêter un cleanup jamais démarré ne doit pas lever d'exception."""
    manager = InMemoryBatchJobManager()
    await manager.stop_cleanup_task()
    assert manager._cleanup_task is None


def test_batch_validation_job_manager_inherits_cleanup() -> None:
    """La sous-classe validation garde bien create_job/set_progress spécifiques."""
    manager = BatchValidationJobManager()
    job_id = manager.create_job(["doc-1", "doc-2"], "writer-1")
    manager.set_progress(job_id, 1)
    job = manager.get_job(job_id)
    assert job is not None
    assert job["document_ids"] == ["doc-1", "doc-2"]
    assert job["total"] == 2
    assert job["current"] == 1
    assert job["status"] == "running"
    assert hasattr(manager, "start_cleanup_task")


def test_batch_node_generation_job_manager_inherits_cleanup() -> None:
    """La sous-classe génération garde bien create_job/set_progress spécifiques."""
    manager = BatchNodeGenerationJobManager()
    job_id = manager.create_job(["n1", "n2"], "writer-1")
    manager.set_progress(job_id, 1, "Nœud 1/2")
    job = manager.get_job(job_id)
    assert job is not None
    assert job["parent_ids"] == ["n1", "n2"]
    assert job["detail"] == "Nœud 1/2"
    assert hasattr(manager, "start_cleanup_task")

"""Lots FR87/FR88 face à un redémarrage serveur : état persisté, ``interrupted``, reprise.

Un redémarrage est simulé par un second gestionnaire relisant le même fichier :
c'est exactement ce que fait le container au démarrage du process.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any, Iterator
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_batch_node_generation_job_manager,
    get_batch_node_generation_service,
    get_batch_validation_job_manager,
    get_batch_validation_service,
    get_config_service,
    get_context_builder,
    get_cost_governance_service,
    get_document_persistence_service,
    get_llm_pricing_service,
    get_llm_usage_service,
)
from api.main import app
from api.routers.auth import get_current_user
from api.services.batch_node_generation_job_manager import BatchNodeGenerationJobManager
from api.services.batch_validation_job_manager import BatchValidationJobManager
from services.batch_node_generation_service import (
    BatchNodeGenerationService,
    BatchParentResult,
)
from services.batch_validation_service import BatchValidationItem
from services.graph_node_orchestrator import GenerationResult

JOBS_URL = "/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs"
VALIDATE_JOBS_URL = "/api/v1/dialogues/batch-validate/jobs"
PARENT_IDS = [f"n{i}" for i in range(10)]


def _user(user_id: str = "writer-1", role: str = "writer") -> dict[str, object]:
    return {"id": user_id, "username": user_id, "role": role, "is_active": True}


def _parent_spec(node_id: str) -> dict[str, Any]:
    return {
        "parent_node_id": node_id,
        "parent_node_content": {
            "speaker": "PNJ",
            "line": "Hello",
            "choices": [{"text": "A"}],
        },
        "context_selections": {},
        "user_instructions": "",
    }


def _ok_result(parent_id: str) -> BatchParentResult:
    return BatchParentResult(
        parent_node_id=parent_id,
        status="ok",
        nodes=[{"id": f"child-{parent_id}", "speaker": "PNJ", "line": "x"}],
        suggested_connections=[
            {"from": parent_id, "to": f"child-{parent_id}", "via_choice_index": 0}
        ],
    )


def _interrupted_generation_job(storage: Path, done: list[str]) -> str:
    """Job lancé puis coupé net après ``done`` parents : process 1, sans ``complete``."""
    before_restart = BatchNodeGenerationJobManager(storage_path=storage)
    job_id = before_restart.create_job(PARENT_IDS, "writer-1")
    before_restart.set_progress(job_id, len(done), "Nœud en cours")
    for parent_id in done:
        before_restart.record_item(job_id, parent_id, asdict(_ok_result(parent_id)))
    return job_id


@pytest.fixture
def storage(tmp_path: Path) -> Path:
    return tmp_path / "batch_node_generation_jobs.json"


@pytest.fixture
def generation_api() -> Iterator[dict[str, Any]]:
    """Dépendances du router génération batch ; le manager est posé par chaque test."""
    orchestrator = MagicMock()
    orchestrator.generate = AsyncMock(
        side_effect=lambda **kw: GenerationResult(
            nodes=[{"id": f"child-{kw['parent_node_id']}", "speaker": "PNJ", "line": "y"}],
            parent_node_id=kw["parent_node_id"],
            suggested_connections=[],
        )
    )
    context_builder = MagicMock()
    context_builder.get_characters_names.return_value = []
    pricing = MagicMock()
    pricing.calculate_cost.return_value = 0.01
    cost = MagicMock()
    cost.check_budget.return_value = {"allowed": True, "percentage": 0.0, "warning": None}
    deps: dict[str, Any] = {
        "orchestrator": orchestrator,
        "pricing": pricing,
        "cost": cost,
    }
    app.dependency_overrides[get_config_service] = lambda: MagicMock()
    app.dependency_overrides[get_llm_usage_service] = lambda: MagicMock()
    app.dependency_overrides[get_context_builder] = lambda: context_builder
    app.dependency_overrides[get_batch_node_generation_service] = (
        lambda: BatchNodeGenerationService(orchestrator=orchestrator)
    )
    app.dependency_overrides[get_llm_pricing_service] = lambda: pricing
    app.dependency_overrides[get_cost_governance_service] = lambda: cost
    app.dependency_overrides[get_current_user] = lambda: _user()
    try:
        yield deps
    finally:
        app.dependency_overrides.clear()


def _use_manager(manager: Any, dependency: Any) -> None:
    app.dependency_overrides[dependency] = lambda: manager


def _async_client() -> httpx.AsyncClient:
    """Client ASGI sur la boucle du test : la tâche de fond du job y survit entre requêtes."""
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def _wait_terminal(client: httpx.AsyncClient, url: str) -> dict[str, Any]:
    body: dict[str, Any] = {}
    for _ in range(250):
        body = (await client.get(url)).json()
        if body["status"] in ("completed", "cancelled", "error"):
            return body
        await asyncio.sleep(0.02)
    raise AssertionError(f"job jamais terminé : {body}")


def test_restart_turns_running_job_into_interrupted(storage: Path) -> None:
    """Un job ``running`` relu au démarrage devient ``interrupted``, points de reprise intacts."""
    job_id = _interrupted_generation_job(storage, done=["n0", "n1", "n2"])

    after_restart = BatchNodeGenerationJobManager(storage_path=storage)

    job = after_restart.get_job(job_id)
    assert job is not None
    assert job["status"] == "interrupted"
    assert set(after_restart.checkpointed_items(job_id)) == {"n0", "n1", "n2"}


def test_restart_drops_expired_jobs(storage: Path) -> None:
    """Le nettoyage TTL s'applique aussi à l'état relu."""
    before_restart = BatchNodeGenerationJobManager(ttl_seconds=0, storage_path=storage)
    before_restart.create_job(PARENT_IDS, "writer-1")
    time.sleep(0.01)

    after_restart = BatchNodeGenerationJobManager(storage_path=storage)

    assert after_restart._jobs == {}


def test_poll_interrupted_job_returns_status_and_partial_detail(
    storage: Path, generation_api: dict[str, Any]
) -> None:
    """Polling après redémarrage : ``interrupted`` + ce qui a réussi, pas un 404 nu."""
    job_id = _interrupted_generation_job(storage, done=["n0", "n1", "n2"])
    _use_manager(
        BatchNodeGenerationJobManager(storage_path=storage),
        get_batch_node_generation_job_manager,
    )
    client = TestClient(app)

    response = client.get(f"{JOBS_URL}/{job_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "interrupted"
    report = body["report"]
    assert report["ok_count"] == 3
    assert [i["parent_node_id"] for i in report["items"]] == PARENT_IDS
    assert {i["parent_node_id"] for i in report["items"] if i["status"] == "ok"} == {
        "n0",
        "n1",
        "n2",
    }

    assert client.get(f"{JOBS_URL}/inconnu").status_code == 404


@pytest.mark.asyncio
async def test_resume_regenerates_only_remaining_parents(
    storage: Path, generation_api: dict[str, Any]
) -> None:
    """Reprise : 0 appel LLM pour les parents acquis, cost gate sur les restants, rapport complet."""
    done = ["n0", "n1", "n2", "n3"]
    job_id = _interrupted_generation_job(storage, done=done)
    _use_manager(
        BatchNodeGenerationJobManager(storage_path=storage),
        get_batch_node_generation_job_manager,
    )
    client = _async_client()

    created = await client.post(
        JOBS_URL,
        json={"parents": [_parent_spec(p) for p in PARENT_IDS], "resume_job_id": job_id},
    )

    assert created.status_code == 202
    assert created.json()["job_id"] == job_id
    final = await _wait_terminal(client, f"{JOBS_URL}/{job_id}")
    assert final["status"] == "completed"

    generated_for = [
        call.kwargs["parent_node_id"]
        for call in generation_api["orchestrator"].generate.call_args_list
    ]
    assert sorted(generated_for) == sorted(set(PARENT_IDS) - set(done))
    _, cost_kwargs = generation_api["pricing"].calculate_cost.call_args
    assert cost_kwargs["prompt_tokens"] == 5000 * (len(PARENT_IDS) - len(done))

    items = final["report"]["items"]
    assert [i["parent_node_id"] for i in items] == PARENT_IDS
    assert all(i["status"] == "ok" for i in items)
    child_ids = [n["id"] for i in items for n in i["nodes"]]
    assert len(child_ids) == len(set(child_ids)) == len(PARENT_IDS)


@pytest.mark.asyncio
async def test_reposting_same_batch_resumes_interrupted_job(
    storage: Path, generation_api: dict[str, Any]
) -> None:
    """Reposter le même lot sans ``resume_job_id`` retombe sur le job interrompu."""
    job_id = _interrupted_generation_job(storage, done=["n0", "n1"])
    _use_manager(
        BatchNodeGenerationJobManager(storage_path=storage),
        get_batch_node_generation_job_manager,
    )
    client = _async_client()

    created = await client.post(JOBS_URL, json={"parents": [_parent_spec(p) for p in PARENT_IDS]})

    assert created.json()["job_id"] == job_id
    await _wait_terminal(client, f"{JOBS_URL}/{job_id}")
    assert generation_api["orchestrator"].generate.call_count == len(PARENT_IDS) - 2


def test_interrupted_job_stays_private_to_its_owner(
    storage: Path, generation_api: dict[str, Any]
) -> None:
    """IDOR : un autre writer ne lit ni ne reprend le job interrompu (404, pas 403)."""
    job_id = _interrupted_generation_job(storage, done=["n0"])
    _use_manager(
        BatchNodeGenerationJobManager(storage_path=storage),
        get_batch_node_generation_job_manager,
    )
    app.dependency_overrides[get_current_user] = lambda: _user("writer-2")
    client = TestClient(app)

    assert client.get(f"{JOBS_URL}/{job_id}").status_code == 404
    resumed = client.post(
        JOBS_URL,
        json={"parents": [_parent_spec(p) for p in PARENT_IDS], "resume_job_id": job_id},
    )
    assert resumed.status_code == 404
    reposted = client.post(JOBS_URL, json={"parents": [_parent_spec(p) for p in PARENT_IDS]})
    assert reposted.status_code == 202
    assert reposted.json()["job_id"] != job_id


def test_resume_refuses_a_job_still_running(
    storage: Path, generation_api: dict[str, Any]
) -> None:
    """Pas de reprise concurrente d'un job actif (double génération sinon)."""
    manager = BatchNodeGenerationJobManager(storage_path=storage)
    job_id = manager.create_job(PARENT_IDS, "writer-1")
    manager.set_progress(job_id, 1)
    _use_manager(manager, get_batch_node_generation_job_manager)
    client = TestClient(app)

    response = client.post(
        JOBS_URL,
        json={"parents": [_parent_spec(p) for p in PARENT_IDS], "resume_job_id": job_id},
    )

    assert response.status_code == 409
    assert generation_api["orchestrator"].generate.call_count == 0


@pytest.fixture
def validation_api() -> Iterator[MagicMock]:
    batch_service = MagicMock()
    app.dependency_overrides[get_config_service] = lambda: MagicMock()
    app.dependency_overrides[get_document_persistence_service] = lambda: MagicMock()
    app.dependency_overrides[get_batch_validation_service] = lambda: batch_service
    app.dependency_overrides[get_current_user] = lambda: _user()
    try:
        yield batch_service
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_validation_job_interrupted_then_resumed_without_revalidating(
    tmp_path: Path, validation_api: MagicMock
) -> None:
    """FR87 : même contrat — ``interrupted`` lisible, reprise des seuls dialogues restants."""
    storage = tmp_path / "batch_validation_jobs.json"
    doc_ids = [f"doc-{i}" for i in range(20)]
    before_restart = BatchValidationJobManager(storage_path=storage)
    job_id = before_restart.create_job(doc_ids, "writer-1")
    before_restart.set_progress(job_id, 5)
    for doc_id in doc_ids[:5]:
        before_restart.record_item(
            job_id, doc_id, {"document_id": doc_id, "status": "valid", "issues": []}
        )

    _use_manager(
        BatchValidationJobManager(storage_path=storage), get_batch_validation_job_manager
    )
    client = _async_client()
    polled = (await client.get(f"{VALIDATE_JOBS_URL}/{job_id}")).json()
    assert polled["status"] == "interrupted"
    assert polled["report"]["valid_count"] == 5

    def _validate(ids: list[str], **kwargs: Any) -> Any:
        report = MagicMock()
        report.items = [BatchValidationItem(document_id=d, status="valid") for d in ids]
        report.cancelled = False
        report.started_at = "t0"
        report.finished_at = "t1"
        return report

    validation_api.validate_batch.side_effect = _validate
    created = await client.post(
        VALIDATE_JOBS_URL, json={"document_ids": doc_ids, "resume_job_id": job_id}
    )

    assert created.json()["job_id"] == job_id
    final = await _wait_terminal(client, f"{VALIDATE_JOBS_URL}/{job_id}")
    assert validation_api.validate_batch.call_args.args[0] == doc_ids[5:]
    assert final["report"]["valid_count"] == 20

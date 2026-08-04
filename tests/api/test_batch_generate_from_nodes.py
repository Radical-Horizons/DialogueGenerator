"""Tests API génération batch multi-parents FR88."""

from __future__ import annotations

from typing import Any, Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_batch_node_generation_job_manager,
    get_batch_node_generation_service,
    get_config_service,
    get_context_builder,
    get_llm_usage_service,
)
from api.main import app
from api.routers.auth import get_current_user
from api.services.batch_node_generation_job_manager import BatchNodeGenerationJobManager
from services.batch_node_generation_service import (
    BatchNodeGenerationReport,
    BatchParentResult,
)
from services.graph_node_orchestrator import GenerationResult


def _user(user_id: str = "writer-1", role: str = "writer") -> dict[str, object]:
    return {
        "id": user_id,
        "username": user_id,
        "role": role,
        "is_active": True,
    }


def _parent_spec(node_id: str) -> dict[str, Any]:
    return {
        "parent_node_id": node_id,
        "parent_node_content": {
            "speaker": "PNJ",
            "line": "Hello",
            "choices": [{"text": "A"}, {"text": "B"}],
        },
        "context_selections": {},
        "user_instructions": "",
    }


@pytest.fixture
def batch_gen_client() -> Iterator[tuple[TestClient, MagicMock, BatchNodeGenerationJobManager]]:
    """Client API avec service batch génération mocké."""
    batch_service = MagicMock()
    job_manager = BatchNodeGenerationJobManager()
    config = MagicMock()
    usage = MagicMock()
    context_builder = MagicMock()
    context_builder.get_characters_names.return_value = []

    app.dependency_overrides[get_config_service] = lambda: config
    app.dependency_overrides[get_llm_usage_service] = lambda: usage
    app.dependency_overrides[get_context_builder] = lambda: context_builder
    app.dependency_overrides[get_batch_node_generation_service] = lambda: batch_service
    app.dependency_overrides[get_batch_node_generation_job_manager] = lambda: job_manager
    app.dependency_overrides[get_current_user] = lambda: _user()
    try:
        yield TestClient(app), batch_service, job_manager
    finally:
        app.dependency_overrides.clear()


def test_job_rejects_small_batch(
    batch_gen_client: tuple[TestClient, MagicMock, BatchNodeGenerationJobManager],
) -> None:
    """N < 10 est refusé sur l'endpoint jobs (boucle client attendue)."""
    client, _, _ = batch_gen_client
    response = client.post(
        "/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs",
        json={"parents": [_parent_spec(f"n{i}") for i in range(3)]},
    )
    assert response.status_code in (400, 422)


def test_job_large_batch_returns_202(
    batch_gen_client: tuple[TestClient, MagicMock, BatchNodeGenerationJobManager],
) -> None:
    """N ≥ 10 crée un job 202."""
    client, batch_service, _ = batch_gen_client
    batch_service.generate_batch = AsyncMock(
        return_value=BatchNodeGenerationReport(
            items=[
                BatchParentResult(
                    parent_node_id=f"n{i}",
                    status="ok",
                    nodes=[{"id": f"child-{i}", "speaker": "PNJ", "line": "x"}],
                    suggested_connections=[
                        {
                            "from": f"n{i}",
                            "to": f"child-{i}",
                            "via_choice_index": 0,
                            "connection_type": "choice",
                        }
                    ],
                )
                for i in range(10)
            ],
            started_at="t0",
            finished_at="t1",
        )
    )
    response = client.post(
        "/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs",
        json={"parents": [_parent_spec(f"n{i}") for i in range(10)]},
    )
    assert response.status_code == 202
    body = response.json()
    assert "job_id" in body
    assert body["total"] == 10


def test_job_status_and_cancel(
    batch_gen_client: tuple[TestClient, MagicMock, BatchNodeGenerationJobManager],
) -> None:
    """GET status + cancel d'un job."""
    client, batch_service, job_manager = batch_gen_client
    batch_service.generate_batch = AsyncMock(
        return_value=BatchNodeGenerationReport(items=[], started_at="t0", finished_at="t1")
    )
    created = client.post(
        "/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs",
        json={"parents": [_parent_spec(f"n{i}") for i in range(10)]},
    )
    job_id = created.json()["job_id"]
    status = client.get(
        f"/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs/{job_id}"
    )
    assert status.status_code == 200
    assert status.json()["job_id"] == job_id

    cancelled = client.post(
        f"/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs/{job_id}/cancel"
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["cancelled"] is True
    assert job_manager.is_cancelled(job_id)


@pytest.mark.asyncio
async def test_service_partial_failure_and_skip() -> None:
    """Échec partiel + skip « déjà connectés »."""
    orchestrator = MagicMock()

    async def _gen(**kwargs: Any) -> GenerationResult:
        pid = kwargs["parent_node_id"]
        if pid == "p2":
            raise ValueError("Tous les choix sont déjà connectés. Aucun nœud à générer.")
        if pid == "p3":
            raise RuntimeError("LLM down")
        return GenerationResult(
            nodes=[{"id": f"c-{pid}", "line": "ok"}],
            suggested_connections=[
                {
                    "from": pid,
                    "to": f"c-{pid}",
                    "via_choice_index": 0,
                    "connection_type": "choice",
                }
            ],
            parent_node_id=pid,
            batch_count=1,
        )

    orchestrator.generate = AsyncMock(side_effect=_gen)
    from services.batch_node_generation_service import (
        BatchNodeGenerationService,
        BatchParentInput,
    )

    service = BatchNodeGenerationService(orchestrator=orchestrator)
    llm = MagicMock()
    report = await service.generate_batch(
        [
            BatchParentInput("p1", {"choices": [{"text": "a"}]}, {}),
            BatchParentInput("p2", {"choices": [{"text": "a", "targetNode": "x"}]}, {}),
            BatchParentInput("p3", {"choices": [{"text": "a"}]}, {}),
        ],
        llm_client=llm,
    )
    assert report.ok_count == 1
    assert report.items[1].status == "skipped"
    assert report.items[2].status == "error"
    assert report.total_nodes_generated == 1


@pytest.mark.asyncio
async def test_service_progress_detail_includes_choice_counters() -> None:
    """Progress detail FR88 : « Nœud i/N — j/k » pendant la génération des choix."""
    orchestrator = MagicMock()

    async def _gen(**kwargs: Any) -> GenerationResult:
        cb = kwargs.get("progress_callback")
        assert cb is not None
        cb(1, 2)
        return GenerationResult(
            nodes=[{"id": "c1", "line": "ok"}],
            suggested_connections=[],
            parent_node_id=kwargs["parent_node_id"],
            batch_count=1,
        )

    orchestrator.generate = AsyncMock(side_effect=_gen)
    from services.batch_node_generation_service import (
        BatchNodeGenerationService,
        BatchParentInput,
    )

    details: list[str] = []
    service = BatchNodeGenerationService(orchestrator=orchestrator)
    await service.generate_batch(
        [
            BatchParentInput(
                "p1",
                {"choices": [{"text": "a"}, {"text": "b"}]},
                {},
            ),
        ],
        llm_client=MagicMock(),
        on_progress=lambda _c, _t, detail: details.append(detail),
    )
    assert any(d == "Nœud 1/1 — 0/2" for d in details)
    assert any(d == "Nœud 1/1 — 1/2" for d in details)


def test_batch_generate_job_idor_cross_user(
    batch_gen_client: tuple[TestClient, MagicMock, BatchNodeGenerationJobManager],
) -> None:
    """Un autre writer ne peut pas lire/annuler le job generate (404)."""
    from api.main import app
    from api.routers.auth import get_current_user

    client, batch_service, _ = batch_gen_client
    batch_service.generate_batch = AsyncMock(
        return_value=BatchNodeGenerationReport(
            items=[], started_at="t0", finished_at="t1"
        )
    )
    created = client.post(
        "/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs",
        json={"parents": [_parent_spec(f"n{i}") for i in range(10)]},
    )
    assert created.status_code == 202
    job_id = created.json()["job_id"]

    app.dependency_overrides[get_current_user] = lambda: _user("writer-2")
    try:
        status = client.get(
            f"/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs/{job_id}"
        )
        assert status.status_code == 404
        cancel = client.post(
            f"/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs/{job_id}/cancel"
        )
        assert cancel.status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: _user()

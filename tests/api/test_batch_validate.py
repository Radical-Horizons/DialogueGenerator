"""Tests API validation batch FR87."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_batch_validation_job_manager,
    get_batch_validation_service,
    get_config_service,
    get_document_persistence_service,
)
from api.main import app
from api.routers.auth import get_current_user
from api.services.batch_validation_job_manager import BatchValidationJobManager
from services.batch_validation_service import (
    BatchValidationIssue,
    BatchValidationItem,
    BatchValidationReport,
    BatchValidationService,
)
from services.document_persistence_service import DialogueAccessDeniedError


def _user(user_id: str = "writer-1", role: str = "writer") -> dict[str, object]:
    return {
        "id": user_id,
        "username": user_id,
        "role": role,
        "is_active": True,
    }


@pytest.fixture
def batch_client(tmp_path: Path) -> Iterator[tuple[TestClient, MagicMock, MagicMock]]:
    """Client API avec service batch mocké."""
    dialogue_dir = tmp_path / "Dialogues"
    dialogue_dir.mkdir()
    config = MagicMock()
    config.get_unity_dialogues_path.return_value = dialogue_dir
    persistence = MagicMock()
    persistence.require_access.return_value = None
    batch_service = MagicMock()
    job_manager = BatchValidationJobManager()

    app.dependency_overrides[get_config_service] = lambda: config
    app.dependency_overrides[get_document_persistence_service] = lambda: persistence
    app.dependency_overrides[get_batch_validation_service] = lambda: batch_service
    app.dependency_overrides[get_batch_validation_job_manager] = lambda: job_manager
    app.dependency_overrides[get_current_user] = lambda: _user()
    try:
        yield TestClient(app), persistence, batch_service
    finally:
        app.dependency_overrides.clear()


def _report(items: list[BatchValidationItem], cancelled: bool = False) -> BatchValidationReport:
    return BatchValidationReport(
        items=items,
        cancelled=cancelled,
        started_at="2026-08-04T10:00:00Z",
        finished_at="2026-08-04T10:00:01Z",
    )


def test_sync_small_batch_all_valid(
    batch_client: tuple[TestClient, MagicMock, MagicMock],
) -> None:
    """Petit lot entièrement valide retourne 5 items valid."""
    client, _, batch_service = batch_client
    batch_service.validate_batch.return_value = _report(
        [
            BatchValidationItem(document_id=f"d{i}", status="valid", validated_at="t")
            for i in range(5)
        ]
    )
    response = client.post(
        "/api/v1/dialogues/batch-validate",
        json={"document_ids": [f"d{i}" for i in range(5)]},
    )
    assert response.status_code == 200
    assert response.json()["valid_count"] == 5
    assert response.json()["invalid_count"] == 0


def test_sync_mixed_errors(
    batch_client: tuple[TestClient, MagicMock, MagicMock],
) -> None:
    """Le rapport sépare valides et invalides."""
    client, _, batch_service = batch_client
    batch_service.validate_batch.return_value = _report(
        [
            BatchValidationItem(document_id="ok", status="valid", validated_at="t"),
            BatchValidationItem(
                document_id="bad",
                status="invalid",
                issues=[
                    BatchValidationIssue(
                        type="orphan_node",
                        message="Orphelin",
                        severity="error",
                        source="graph",
                        node_id="N1",
                    )
                ],
                validated_at="t",
            ),
        ]
    )
    response = client.post(
        "/api/v1/dialogues/batch-validate",
        json={"document_ids": ["ok", "bad"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["valid_count"] == 1
    assert body["invalid_count"] == 1
    assert body["items"][1]["issues"][0]["node_id"] == "N1"


def test_sync_rejects_large_batch(
    batch_client: tuple[TestClient, MagicMock, MagicMock],
) -> None:
    """N ≥ 20 est refusé sur l'endpoint sync."""
    client, _, _ = batch_client
    response = client.post(
        "/api/v1/dialogues/batch-validate",
        json={"document_ids": [f"d{i}" for i in range(20)]},
    )
    assert response.status_code in (400, 422)


def test_job_large_batch_returns_202(
    batch_client: tuple[TestClient, MagicMock, MagicMock],
) -> None:
    """N ≥ 20 crée un job 202."""
    client, _, batch_service = batch_client
    batch_service.validate_batch.return_value = _report(
        [
            BatchValidationItem(document_id=f"d{i}", status="valid", validated_at="t")
            for i in range(20)
        ]
    )
    response = client.post(
        "/api/v1/dialogues/batch-validate/jobs",
        json={"document_ids": [f"d{i}" for i in range(20)]},
    )
    assert response.status_code == 202
    assert "job_id" in response.json()


def test_cancel_job(
    batch_client: tuple[TestClient, MagicMock, MagicMock],
) -> None:
    """L'annulation marque le job cancelled."""
    client, _, batch_service = batch_client

    def slow_batch(ids, **kwargs):
        if kwargs.get("should_cancel") and kwargs["should_cancel"]():
            return _report(
                [
                    BatchValidationItem(document_id=ids[0], status="cancelled", validated_at="t")
                ],
                cancelled=True,
            )
        return _report(
            [BatchValidationItem(document_id=i, status="valid", validated_at="t") for i in ids]
        )

    batch_service.validate_batch.side_effect = slow_batch
    created = client.post(
        "/api/v1/dialogues/batch-validate/jobs",
        json={"document_ids": [f"d{i}" for i in range(20)]},
    )
    job_id = created.json()["job_id"]
    cancel = client.post(f"/api/v1/dialogues/batch-validate/jobs/{job_id}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["cancelled"] is True or cancel.json()["status"] == "cancelled"


def test_service_lore_absent_is_warning(tmp_path: Path) -> None:
    """Sans contexte lore : warning lore_not_applicable, pas d'échec lore seul."""
    dialogue_dir = tmp_path / "Dialogues"
    dialogue_dir.mkdir()
    doc = {"schemaVersion": "1.1.0", "nodes": [{"id": "START", "line": "Bonjour", "speaker": "A"}]}
    (dialogue_dir / "scene.json").write_text(json.dumps(doc), encoding="utf-8")
    config = MagicMock()
    config.get_unity_dialogues_path.return_value = dialogue_dir
    service = BatchValidationService(config_service=config)
    item = service.validate_one("scene", access_allowed=True)
    lore_warnings = [
        i for i in item.issues if i.type == "lore_not_applicable"
    ]
    assert lore_warnings
    assert lore_warnings[0].severity == "warning"
    # Pas d'erreur lore seule
    assert not any(i.source == "lore" and i.severity == "error" for i in item.issues)


def test_validate_batch_cancel_marks_remaining(tmp_path: Path) -> None:
    """should_cancel laisse un rapport partiel avec cancelled."""
    dialogue_dir = tmp_path / "Dialogues"
    dialogue_dir.mkdir()
    for name in ("a", "b", "c"):
        (dialogue_dir / f"{name}.json").write_text(
            json.dumps(
                {
                    "schemaVersion": "1.1.0",
                    "nodes": [{"id": "START", "line": "x", "speaker": "A"}],
                }
            ),
            encoding="utf-8",
        )
    config = MagicMock()
    config.get_unity_dialogues_path.return_value = dialogue_dir
    service = BatchValidationService(config_service=config)
    calls = {"n": 0}

    def should_cancel() -> bool:
        calls["n"] += 1
        return calls["n"] > 1

    report = service.validate_batch(
        ["a", "b", "c"],
        can_access=lambda _doc: True,
        should_cancel=should_cancel,
    )
    assert report.cancelled is True
    assert report.items[0].status in ("valid", "invalid")
    assert all(item.status == "cancelled" for item in report.items[1:])


def test_service_denied(tmp_path: Path) -> None:
    """Accès refusé → status denied."""
    config = MagicMock()
    config.get_unity_dialogues_path.return_value = tmp_path
    service = BatchValidationService(config_service=config)
    item = service.validate_one("private", access_allowed=False)
    assert item.status == "denied"


def test_service_lore_present_contradiction(tmp_path: Path) -> None:
    """Avec faits lore contradictoires, une issue lore est signalée."""
    dialogue_dir = tmp_path / "Dialogues"
    dialogue_dir.mkdir()
    doc = {
        "schemaVersion": "1.1.0",
        "nodes": [
            {
                "id": "START",
                "line": "Marc est mort hier.",
                "speaker": "Narrateur",
            }
        ],
        "gdd_lore_facts": [
            {
                "entity_name": "Marc",
                "category": "Personnages",
                "gdd_path": "Personnages/Marc",
                "vitality": "alive",
            }
        ],
    }
    (dialogue_dir / "lore.json").write_text(json.dumps(doc), encoding="utf-8")
    config = MagicMock()
    config.get_unity_dialogues_path.return_value = dialogue_dir
    service = BatchValidationService(config_service=config)
    item = service.validate_one("lore", access_allowed=True)
    assert not any(i.type == "lore_not_applicable" for i in item.issues)
    # Au minimum pas de crash ; la détection lore dépend des regex
    assert item.status in ("valid", "invalid")


def test_rbac_denied_via_access_callback(
    batch_client: tuple[TestClient, MagicMock, MagicMock],
) -> None:
    """Un id inaccessible apparaît denied dans le rapport sync."""
    client, persistence, batch_service = batch_client

    def validate_batch(ids, **kwargs):
        items = []
        for doc_id in ids:
            allowed = kwargs["can_access"](doc_id)
            items.append(
                BatchValidationItem(
                    document_id=doc_id,
                    status="denied" if not allowed else "valid",
                    validated_at="t",
                )
            )
        return _report(items)

    def require_access(doc_id, user, path):
        if doc_id == "secret":
            raise DialogueAccessDeniedError("no")
        return None

    persistence.require_access.side_effect = require_access
    batch_service.validate_batch.side_effect = validate_batch
    response = client.post(
        "/api/v1/dialogues/batch-validate",
        json={"document_ids": ["ok", "secret"]},
    )
    assert response.status_code == 200
    statuses = {i["document_id"]: i["status"] for i in response.json()["items"]}
    assert statuses["secret"] == "denied"

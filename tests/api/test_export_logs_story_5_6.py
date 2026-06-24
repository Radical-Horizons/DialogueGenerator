"""Tests Story 5.6 — logs export Unity (FR54)."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service, get_export_log_service
from api.main import app
from services.export_log_service import ExportLogService

client = TestClient(app)

_VALID_NODE_ID = "node-a1b2c3d4e5f6789012345678abcdef01"

_VALID_GRAPH = {
    "nodes": [
        {
            "id": _VALID_NODE_ID,
            "type": "dialogueNode",
            "position": {"x": 0, "y": 0},
            "data": {
                "stableId": _VALID_NODE_ID,
                "displayName": "Ouverture",
                "line": "Bonjour aventurier !",
                "speaker": "PNJ",
                "choices": [{"choiceId": "choice_reply", "text": "Répondre"}],
            },
        },
        {
            "id": "END",
            "type": "endNode",
            "position": {"x": 0, "y": 200},
            "data": {"line": ""},
        },
    ],
    "edges": [
        {
            "id": "e1",
            "source": _VALID_NODE_ID,
            "target": "END",
            "data": {"edgeType": "choice", "choiceIndex": 0},
        }
    ],
    "metadata": {"title": "Export Log Test", "node_count": 2, "edge_count": 1},
}

_INVALID_NODE_ID = "NODE_LEGACY_INVALID"

_INVALID_GRAPH = {
    "nodes": [
        {
            "id": _INVALID_NODE_ID,
            "type": "dialogueNode",
            "position": {"x": 0, "y": 0},
            "data": {
                "id": _INVALID_NODE_ID,
                "line": "Id nœud hors schéma v1.2.0",
                "speaker": "PNJ",
                "choices": [{"text": "Accepter"}],
            },
        },
        {"id": "END", "type": "endNode", "position": {"x": 0, "y": 200}, "data": {"line": ""}},
    ],
    "edges": [
        {
            "id": "e1",
            "source": _INVALID_NODE_ID,
            "target": "END",
            "data": {"edgeType": "choice", "choiceIndex": 0},
        }
    ],
    "metadata": {"title": "Invalid Log Test", "node_count": 2, "edge_count": 1},
}

_VALID_DOCUMENT = {
    "schemaVersion": "1.2.0",
    "nodes": [
        {
            "id": _VALID_NODE_ID,
            "line": "Bonjour",
            "speaker": "PNJ",
            "choices": [
                {"choiceId": "choice_reply", "text": "Répondre", "targetNode": "END"},
            ],
        },
        {"id": "END", "line": ""},
    ],
}

_INVALID_DOCUMENT = {
    "schemaVersion": "1.2.0",
    "nodes": [
        {
            "id": "NODE_LEGACY_INVALID",
            "line": "Id nœud hors schéma",
            "nextNode": "END",
        },
    ],
}


def _write_doc(base: Path, doc_id: str, document: dict) -> None:
    base.mkdir(parents=True, exist_ok=True)
    (base / f"{doc_id}.json").write_text(
        json.dumps(document, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


@pytest.fixture
def unity_and_logs_tmp(tmp_path: Path):
    """Override Unity path + logs export dir."""
    logs_dir = tmp_path / "export_logs"
    logs_dir.mkdir()
    mock_config = MagicMock()
    mock_config.get_unity_dialogues_path.return_value = str(tmp_path / "unity")
    (tmp_path / "unity").mkdir()
    export_svc = ExportLogService(logs_dir=logs_dir)
    app.dependency_overrides[get_config_service] = lambda: mock_config
    app.dependency_overrides[get_export_log_service] = lambda: export_svc
    try:
        yield tmp_path / "unity", export_svc
    finally:
        app.dependency_overrides.pop(get_config_service, None)
        app.dependency_overrides.pop(get_export_log_service, None)


def _count_log_entries(export_svc: ExportLogService) -> int:
    return export_svc.list_exports().total_count


@pytest.mark.api
class TestExportLoggingOnRealExport:
    """AC #1, #2, #7 — journalisation export réel uniquement."""

    def test_save_and_write_success_creates_log_entry(self, unity_and_logs_tmp):
        unity_dir, export_svc = unity_and_logs_tmp
        before = _count_log_entries(export_svc)
        response = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write",
            json=_VALID_GRAPH,
        )
        assert response.status_code == 200
        assert _count_log_entries(export_svc) == before + 1
        entries = export_svc.list_exports().entries
        assert entries[0]["export_status"] == "success"
        assert entries[0]["validation_status"] == "valid"
        assert entries[0]["file_size_bytes"] is not None
        assert (unity_dir / entries[0]["filename"]).is_file()

    def test_save_and_write_validation_failure_logs_without_file(
        self, unity_and_logs_tmp
    ):
        unity_dir, export_svc = unity_and_logs_tmp
        before = _count_log_entries(export_svc)
        response = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write",
            json=_INVALID_GRAPH,
        )
        assert response.status_code == 422
        assert _count_log_entries(export_svc) == before + 1
        entry = export_svc.list_exports().entries[0]
        assert entry["export_status"] == "failure"
        assert len(entry["errors"]) > 0
        assert list(unity_dir.glob("*.json")) == []

    def test_preview_export_does_not_create_log(self, unity_and_logs_tmp):
        _, export_svc = unity_and_logs_tmp
        before = _count_log_entries(export_svc)
        response = client.post(
            "/api/v1/unity-dialogues/graph/preview-export",
            json=_VALID_GRAPH,
        )
        assert response.status_code == 200
        assert _count_log_entries(export_svc) == before

    def test_batch_export_two_docs_one_ok_one_invalid(self, unity_and_logs_tmp):
        unity_dir, export_svc = unity_and_logs_tmp
        _write_doc(unity_dir, "valid_one", _VALID_DOCUMENT)
        _write_doc(unity_dir, "invalid_one", _INVALID_DOCUMENT)
        before = _count_log_entries(export_svc)
        response = client.post(
            "/api/v1/dialogues/batch-export",
            json={"document_ids": ["valid_one", "invalid_one"]},
        )
        assert response.status_code == 200
        assert _count_log_entries(export_svc) == before + 2
        statuses = {e["dialogue_id"]: e["export_status"] for e in export_svc.list_exports().entries[:2]}
        assert statuses["valid_one"] == "success"
        assert statuses["invalid_one"] == "failure"


@pytest.mark.api
class TestExportLogsApi:
    """AC #3, #5 — GET /exports/logs."""

    def test_get_export_logs_sorted_and_aggregates(self, unity_and_logs_tmp):
        _, export_svc = unity_and_logs_tmp
        export_svc.log_export(
            {
                "id": "1",
                "timestamp": "2026-06-01T10:00:00+00:00",
                "dialogue_id": "a",
                "filename": "a.json",
                "export_status": "success",
                "validation_status": "valid",
                "cost_eur": None,
                "file_size_bytes": 10,
                "errors": [],
                "warnings_gdd": [],
                "source": "graph",
            }
        )
        export_svc.log_export(
            {
                "id": "2",
                "timestamp": "2026-06-02T10:00:00+00:00",
                "dialogue_id": "b",
                "filename": "b.json",
                "export_status": "failure",
                "validation_status": "invalid",
                "cost_eur": None,
                "file_size_bytes": None,
                "errors": ["err"],
                "warnings_gdd": [],
                "source": "batch",
            }
        )

        response = client.get("/api/v1/exports/logs")
        assert response.status_code == 200
        body = response.json()
        assert body["total_count"] == 2
        assert body["success_count"] == 1
        assert body["failure_count"] == 1
        assert body["entries"][0]["dialogue_id"] == "b"

    def test_get_export_logs_filters_by_status(self, unity_and_logs_tmp):
        _, export_svc = unity_and_logs_tmp
        export_svc.log_export(
            {
                "id": "1",
                "timestamp": date.today().isoformat() + "T12:00:00+00:00",
                "dialogue_id": "ok",
                "filename": "ok.json",
                "export_status": "success",
                "validation_status": "valid",
                "cost_eur": None,
                "file_size_bytes": 1,
                "errors": [],
                "warnings_gdd": [],
                "source": "graph",
            }
        )
        export_svc.log_export(
            {
                "id": "2",
                "timestamp": date.today().isoformat() + "T11:00:00+00:00",
                "dialogue_id": "ko",
                "filename": "ko.json",
                "export_status": "failure",
                "validation_status": "invalid",
                "cost_eur": None,
                "file_size_bytes": None,
                "errors": ["x"],
                "warnings_gdd": [],
                "source": "graph",
            }
        )

        response = client.get("/api/v1/exports/logs", params={"status": "failure"})
        assert response.status_code == 200
        body = response.json()
        assert body["total_count"] == 1
        assert body["entries"][0]["dialogue_id"] == "ko"

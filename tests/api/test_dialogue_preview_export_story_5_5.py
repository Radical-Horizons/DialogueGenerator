"""Tests API Story 5.5 — preview export Unity (FR53)."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app

client = TestClient(app)

_VALID_DOCUMENT = {
    "schemaVersion": "1.2.0",
    "nodes": [{"id": "START", "line": "Bonjour", "speaker": "PNJ", "choices": []}],
}

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
    "metadata": {"title": "Preview Test", "node_count": 2, "edge_count": 1},
}


def _write_export(base: Path, filename: str, document: dict) -> None:
    base.mkdir(parents=True, exist_ok=True)
    (base / filename).write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")


@pytest.fixture
def unity_tmp_path(tmp_path):
    mock_config = MagicMock()
    mock_config.get_unity_dialogues_path.return_value = str(tmp_path)
    app.dependency_overrides[get_config_service] = lambda: mock_config
    try:
        yield tmp_path
    finally:
        app.dependency_overrides.pop(get_config_service, None)


@pytest.mark.api
class TestGraphPreviewExport:
    """POST /api/v1/unity-dialogues/graph/preview-export."""

    def test_valid_graph_returns_preview_metadata(self):
        response = client.post(
            "/api/v1/unity-dialogues/graph/preview-export",
            json=_VALID_GRAPH,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["schema_valid"] is True
        assert body["node_count"] >= 1
        assert body["size_bytes"] > 0
        assert body["filename"].endswith(".json")
        assert '"nodes"' in body["json_content"]
        parsed = json.loads(body["json_content"])
        assert "nodes" in parsed

    def test_invalid_graph_returns_schema_valid_false(self):
        invalid_graph = {
            **_VALID_GRAPH,
            "nodes": [
                {
                    "id": _VALID_NODE_ID,
                    "type": "dialogueNode",
                    "position": {"x": 0, "y": 0},
                    "data": {
                        "stableId": _VALID_NODE_ID,
                        "displayName": "Sans speaker",
                        "line": "Bonjour",
                        "choices": [],
                    },
                }
            ],
            "edges": [],
        }
        response = client.post(
            "/api/v1/unity-dialogues/graph/preview-export",
            json=invalid_graph,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["schema_valid"] is False
        assert len(body["errors"]) > 0


@pytest.mark.api
class TestGetDocumentPreviewExport:
    """GET /api/v1/dialogues/{document_id}/preview-export."""

    def test_preview_existing_document(self, unity_tmp_path: Path):
        _write_export(unity_tmp_path, "quest_arc.json", _VALID_DOCUMENT)
        response = client.get("/api/v1/dialogues/quest_arc/preview-export")
        assert response.status_code == 200
        body = response.json()
        assert body["filename"] == "quest_arc.json"
        assert body["node_count"] == 1
        assert body["size_bytes"] > 0

    def test_preview_unknown_document_returns_404(self, unity_tmp_path: Path):
        response = client.get("/api/v1/dialogues/unknown_doc/preview-export")
        assert response.status_code == 404

    def test_preview_rejects_path_traversal_document_id(self, unity_tmp_path: Path):
        response = client.get("/api/v1/dialogues/../etc/passwd/preview-export")
        assert response.status_code in (404, 422, 400)


@pytest.mark.api
class TestBatchPreviewExport:
    """POST /api/v1/dialogues/batch-preview-export."""

    def test_batch_preview_two_documents(self, unity_tmp_path: Path):
        _write_export(unity_tmp_path, "alpha.json", _VALID_DOCUMENT)
        doc_b = {
            "schemaVersion": "1.2.0",
            "nodes": [
                {"id": "A", "line": "A", "speaker": "PNJ", "choices": []},
                {"id": "B", "line": "B", "speaker": "PNJ", "choices": []},
            ],
        }
        _write_export(unity_tmp_path, "beta.json", doc_b)

        response = client.post(
            "/api/v1/dialogues/batch-preview-export",
            json={"document_ids": ["alpha", "beta"]},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["dialogue_count"] == 2
        assert body["total_size_bytes"] > 0
        assert len(body["items"]) == 2
        filenames = {item["filename"] for item in body["items"]}
        assert "alpha.json" in filenames
        assert "beta.json" in filenames

"""Tests POST /api/v1/documents/{id}/preview (Story 9.4)."""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.dependencies import get_config_service


@pytest.fixture
def mock_config_service():
    """Mock du ConfigurationService."""
    from services.configuration_service import ConfigurationService

    mock = MagicMock(spec=ConfigurationService)
    return mock


@pytest.fixture
def client(mock_config_service):
    """Client de test avec config mockée."""
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_post_preview_returns_counts(client: TestClient, mock_config_service: MagicMock, tmp_path: Path) -> None:
    doc_id = "preview-doc"
    doc = {
        "schemaVersion": "1.1.0",
        "nodes": [
            {
                "id": "N1",
                "speaker": "S",
                "line": "L",
                "visibilityConditions": {
                    "combinator": "AND",
                    "items": [{"kind": "flag_bool", "flagId": "F", "equals": True}],
                },
                "choices": [{"choiceId": "c1", "text": "OK"}],
            },
        ],
    }
    (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
    (tmp_path / f"{doc_id}.meta").write_text(
        json.dumps({"revision": 2, "updated_at": "2026-04-18T12:00:00Z"}),
        encoding="utf-8",
    )
    mock_config_service.get_unity_dialogues_path.return_value = tmp_path

    response = client.post(
        f"/api/v1/documents/{doc_id}/preview",
        json={"revision": 2, "flag_states": {"F": False}},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["revision"] == 2
    assert data["nodes_total"] == 1
    assert data["nodes_masked"] == 1
    assert data["masked_node_ids"] == ["N1"]
    assert data["choices_total"] == 1


def test_post_preview_revision_stale_409(client: TestClient, mock_config_service: MagicMock, tmp_path: Path) -> None:
    doc_id = "pv-stale"
    doc = {"schemaVersion": "1.1.0", "nodes": []}
    (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
    (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 1}), encoding="utf-8")
    mock_config_service.get_unity_dialogues_path.return_value = tmp_path

    response = client.post(
        f"/api/v1/documents/{doc_id}/preview",
        json={"revision": 99, "flag_states": {}},
    )
    assert response.status_code == 409

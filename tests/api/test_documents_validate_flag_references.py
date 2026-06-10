"""POST /documents/{id}/validate-flag-references (Story 9.5)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app


@pytest.fixture
def mock_config_service():
    return MagicMock()


@pytest.fixture
def client(mock_config_service):
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestDocumentsValidateFlagReferences:
    """Endpoint dédié FR93."""

    def test_with_body_document(self, client):
        """Référence absente des dialogueFlags → erreur dialogue_flag_undeclared."""
        payload = {
            "schemaVersion": "1.2.0",
            "dialogueFlags": [
                {
                    "flagId": "PLAYER_KILLED_BOSS",
                    "type": "bool",
                    "initialValue": True,
                }
            ],
            "nodes": [
                {
                    "id": "N1",
                    "line": "Hi",
                    "visibilityConditions": {
                        "combinator": "AND",
                        "items": [
                            {
                                "kind": "flag_bool",
                                "flagId": "NOT_DECLARED_XYZ",
                                "equals": True,
                            }
                        ],
                    },
                }
            ],
        }
        r = client.post(
            "/api/v1/documents/doc-flagtest/validate-flag-references",
            json={"document": payload},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is False
        assert any(e["type"] == "dialogue_flag_undeclared" for e in data["errors"])

    def test_reads_file_when_body_empty(self, client, mock_config_service, tmp_path):
        doc_id = "flag-ref-stored"
        stored = {
            "schemaVersion": "1.2.0",
            "dialogueFlags": [
                {
                    "flagId": "PLAYER_KILLED_BOSS",
                    "type": "bool",
                    "initialValue": True,
                }
            ],
            "nodes": [{"id": "N1", "line": "OK"}],
        }
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(stored), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 1}), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = str(tmp_path)

        r = client.post(
            f"/api/v1/documents/{doc_id}/validate-flag-references",
            json={},
        )
        assert r.status_code == 200
        assert r.json()["valid"] is True

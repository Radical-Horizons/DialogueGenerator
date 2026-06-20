"""Tests Story 5.3 — endpoint validation document persisté (FR51)."""
from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app

client = TestClient(app)

_VALID_DOC = {
    "schemaVersion": "1.2.0",
    "nodes": [
        {
            "id": "node-a1b2c3d4e5f6789012345678abcdef01",
            "line": "Hello",
            "speaker": "NPC",
            "choices": [{"choiceId": "c1", "text": "Go", "targetNode": "END"}],
        },
        {"id": "END", "line": ""},
    ],
}


@pytest.fixture
def unity_doc_dir(tmp_path):
    """Répertoire Unity avec documents de test."""
    mock_config = MagicMock()
    mock_config.get_unity_dialogues_path.return_value = str(tmp_path)
    app.dependency_overrides[get_config_service] = lambda: mock_config
    try:
        yield tmp_path
    finally:
        app.dependency_overrides.pop(get_config_service, None)


@pytest.mark.api
class TestValidateDocumentSchemaEndpoint:
    """AC #7 — POST /dialogues/{document_id}/validate-schema."""

    def test_valid_document_returns_conformant(self, unity_doc_dir):
        (unity_doc_dir / "good_doc.json").write_text(
            json.dumps(_VALID_DOC, ensure_ascii=False), encoding="utf-8"
        )
        response = client.post("/api/v1/dialogues/good_doc/validate-schema")
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] is True
        assert data["errors"] == []

    def test_invalid_document_returns_formatted_errors(self, unity_doc_dir):
        bad = dict(_VALID_DOC)
        bad["nodes"] = [
            {
                "id": "node-b2c3d4e5f678901234567890abcdef12",
                "line": "Bad",
                "choices": [{"text": "No id"}],
            }
        ]
        (unity_doc_dir / "bad_doc.json").write_text(
            json.dumps(bad, ensure_ascii=False), encoding="utf-8"
        )
        response = client.post("/api/v1/dialogues/bad_doc/validate-schema")
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] is False
        assert data["error_count"] >= 1
        assert "Erreur schéma Unity" in data["errors"][0]

    def test_unknown_document_returns_404(self, unity_doc_dir):
        response = client.post("/api/v1/dialogues/missing_doc/validate-schema")
        assert response.status_code == 404

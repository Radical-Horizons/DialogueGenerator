"""Tests API Story 5.2 — batch export Unity JSON (FR50)."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app

client = TestClient(app)

_VALID_NODE_ID = "node-a1b2c3d4e5f6789012345678abcdef01"

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
def unity_tmp_path(tmp_path):
    """Override config Unity path pour les tests d'écriture."""
    mock_config = MagicMock()
    mock_config.get_unity_dialogues_path.return_value = str(tmp_path)
    app.dependency_overrides[get_config_service] = lambda: mock_config
    try:
        yield tmp_path
    finally:
        app.dependency_overrides.pop(get_config_service, None)


@pytest.mark.api
class TestBatchExportApiSuccess:
    """Batch export API — succès."""

    def test_batch_export_three_documents(self, unity_tmp_path: Path):
        for doc_id in ("doc_a", "doc_b", "doc_c"):
            _write_doc(unity_tmp_path, doc_id, _VALID_DOCUMENT)

        response = client.post(
            "/api/v1/dialogues/batch-export",
            json={"document_ids": ["doc_a", "doc_b", "doc_c"]},
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body["exported"]) == 3
        assert body["failed"] == []


@pytest.mark.api
class TestBatchExportApiPartialFailure:
    """AC #2 — échec partiel continue."""

    def test_batch_export_continues_after_single_validation_failure(
        self, unity_tmp_path: Path
    ):
        _write_doc(unity_tmp_path, "valid_one", _VALID_DOCUMENT)
        _write_doc(unity_tmp_path, "invalid_one", _INVALID_DOCUMENT)
        _write_doc(unity_tmp_path, "valid_two", _VALID_DOCUMENT)

        response = client.post(
            "/api/v1/dialogues/batch-export",
            json={"document_ids": ["valid_one", "invalid_one", "valid_two"]},
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body["exported"]) == 2
        assert len(body["failed"]) == 1
        assert body["failed"][0]["id"] == "invalid_one"
        assert len(body["failed"][0]["errors"]) > 0


@pytest.mark.api
class TestBatchExportApiPathUnavailable:
    """AC #4 — chemin Unity null."""

    def test_batch_export_rejects_when_unity_path_null(self):
        mock_config = MagicMock()
        mock_config.get_unity_dialogues_path.return_value = None
        app.dependency_overrides[get_config_service] = lambda: mock_config
        try:
            response = client.post(
                "/api/v1/dialogues/batch-export",
                json={"document_ids": ["doc_a"]},
            )
            assert response.status_code == 422
            body = response.json()
            assert body["error"]["details"]["field"] == "unity_dialogues_path"
        finally:
            app.dependency_overrides.pop(get_config_service, None)


@pytest.mark.api
class TestBatchExportApiSkipValidation:
    """Option skip_validation."""

    def test_batch_export_skip_validation_writes_invalid(self, unity_tmp_path: Path):
        _write_doc(unity_tmp_path, "invalid_doc", _INVALID_DOCUMENT)

        response = client.post(
            "/api/v1/dialogues/batch-export",
            json={
                "document_ids": ["invalid_doc"],
                "skip_validation": True,
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body["exported"]) == 1
        assert body["failed"] == []

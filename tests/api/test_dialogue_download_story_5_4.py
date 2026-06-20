"""Tests API Story 5.4 — téléchargement exports Unity (FR52)."""
from __future__ import annotations

import json
import zipfile
from io import BytesIO
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


def _write_export(base: Path, filename: str, document: dict) -> None:
    base.mkdir(parents=True, exist_ok=True)
    (base / filename).write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")


@pytest.fixture
def unity_tmp_path(tmp_path):
    """Override config Unity path pour les tests download."""
    mock_config = MagicMock()
    mock_config.get_unity_dialogues_path.return_value = str(tmp_path)
    app.dependency_overrides[get_config_service] = lambda: mock_config
    try:
        yield tmp_path
    finally:
        app.dependency_overrides.pop(get_config_service, None)


@pytest.fixture
def unity_path_unconfigured():
    """Chemin Unity non configuré."""
    mock_config = MagicMock()
    mock_config.get_unity_dialogues_path.return_value = None
    app.dependency_overrides[get_config_service] = lambda: mock_config
    try:
        yield mock_config
    finally:
        app.dependency_overrides.pop(get_config_service, None)


@pytest.mark.api
class TestGetDocumentDownload:
    """GET /api/v1/dialogues/{document_id}/download."""

    def test_download_existing_document_returns_attachment(self, unity_tmp_path: Path):
        _write_export(unity_tmp_path, "quest_arc.json", _VALID_DOCUMENT)

        response = client.get("/api/v1/dialogues/quest_arc/download")

        assert response.status_code == 200
        assert "attachment" in response.headers.get("content-disposition", "")
        assert "quest_arc.json" in response.headers.get("content-disposition", "")
        body = json.loads(response.content.decode("utf-8"))
        assert "nodes" in body

    def test_download_unknown_document_returns_404(self, unity_tmp_path: Path):
        response = client.get("/api/v1/dialogues/unknown_doc/download")
        assert response.status_code == 404

    def test_download_rejects_path_traversal_document_id(self, unity_tmp_path: Path):
        response = client.get("/api/v1/dialogues/../etc/passwd/download")
        assert response.status_code in (404, 422, 400)

    def test_download_without_unity_path_returns_422(self, unity_path_unconfigured):
        response = client.get("/api/v1/dialogues/any_doc/download")
        assert response.status_code == 422

    def test_download_corrupt_json_returns_422(self, unity_tmp_path: Path):
        (unity_tmp_path / "corrupt.json").write_text("{not-json", encoding="utf-8")
        response = client.get("/api/v1/dialogues/corrupt/download")
        assert response.status_code == 422


@pytest.mark.api
class TestPostBatchDownload:
    """POST /api/v1/dialogues/batch-download."""

    def test_batch_download_zip_two_files(self, unity_tmp_path: Path):
        _write_export(unity_tmp_path, "doc_a.json", _VALID_DOCUMENT)
        _write_export(unity_tmp_path, "doc_b.json", _VALID_DOCUMENT)

        response = client.post(
            "/api/v1/dialogues/batch-download",
            json={"filenames": ["doc_a.json", "doc_b.json"], "compression": "deflate"},
        )

        assert response.status_code == 200
        assert response.headers.get("content-type", "").startswith("application/zip")
        assert "attachment" in response.headers.get("content-disposition", "")
        with zipfile.ZipFile(BytesIO(response.content)) as archive:
            assert sorted(archive.namelist()) == ["doc_a.json", "doc_b.json"]

    def test_batch_download_rejects_path_traversal_filename(self, unity_tmp_path: Path):
        _write_export(unity_tmp_path, "doc_a.json", _VALID_DOCUMENT)

        response = client.post(
            "/api/v1/dialogues/batch-download",
            json={"filenames": ["../doc_a.json"]},
        )

        assert response.status_code == 422

    def test_batch_download_missing_file_returns_404(self, unity_tmp_path: Path):
        response = client.post(
            "/api/v1/dialogues/batch-download",
            json={"filenames": ["missing.json"]},
        )
        assert response.status_code == 404


@pytest.mark.api
class TestExportWritePathTraversal:
    """POST /api/v1/dialogues/unity/export — même garde-fous que le download (Story 5.4)."""

    def test_export_rejects_path_traversal_filename(self, unity_tmp_path: Path) -> None:
        outside = unity_tmp_path.parent / "outside_escape.json"
        payload = {
            "json_content": json.dumps(_VALID_DOCUMENT, ensure_ascii=False),
            "title": "Test",
            "filename": "../../outside_escape.json",
        }
        response = client.post("/api/v1/dialogues/unity/export", json=payload)
        assert response.status_code == 422
        assert not outside.exists()

    def test_export_writes_only_under_unity_dir(self, unity_tmp_path: Path) -> None:
        valid_node_id = "node-a1b2c3d4e5f6789012345678abcdef01"
        document = {
            "schemaVersion": "1.2.0",
            "nodes": [
                {
                    "id": valid_node_id,
                    "line": "Bonjour",
                    "speaker": "PNJ",
                    "choices": [{"choiceId": "c1", "text": "OK", "targetNode": "END"}],
                },
                {"id": "END", "line": ""},
            ],
        }
        payload = {
            "json_content": json.dumps(document, ensure_ascii=False),
            "title": "Quest Arc",
            "filename": "quest_arc.json",
        }
        response = client.post("/api/v1/dialogues/unity/export", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["filename"] == "quest_arc.json"
        assert "file_path" not in body or body.get("file_path") is None
        assert (unity_tmp_path / "quest_arc.json").is_file()

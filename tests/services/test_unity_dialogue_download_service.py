"""Tests service téléchargement Unity (Story 5.4 / FR52)."""
from __future__ import annotations

import json
import zipfile
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from services.configuration_service import ConfigurationService
from services.unity_dialogue_download_service import (
    build_batch_download_zip,
    read_document_download_payload,
    safe_export_filename,
)


@pytest.mark.unit
class TestSafeExportFilename:
    """Validation basename export."""

    def test_accepts_json_basename(self):
        assert safe_export_filename("quest_arc.json") == "quest_arc.json"

    def test_adds_json_extension(self):
        assert safe_export_filename("quest_arc") == "quest_arc.json"

    def test_rejects_path_traversal(self):
        with pytest.raises(ValueError, match="path traversal"):
            safe_export_filename("../secret.json")


@pytest.mark.unit
class TestReadDocumentDownloadPayload:
    """Lecture document pour GET download."""

    def test_returns_formatted_json(self, tmp_path: Path):
        doc = {"schemaVersion": "1.2.0", "nodes": [{"id": "START", "line": "Bonjour"}]}
        (tmp_path / "doc_a.json").write_text(json.dumps(doc), encoding="utf-8")
        config = MagicMock(spec=ConfigurationService)
        config.get_unity_dialogues_path.return_value = str(tmp_path)

        content, filename = read_document_download_payload(config, "doc_a")

        assert filename == "doc_a.json"
        parsed = json.loads(content)
        assert parsed["nodes"][0]["line"] == "Bonjour"
        assert "\n" in content

    def test_missing_document_raises(self, tmp_path: Path):
        config = MagicMock(spec=ConfigurationService)
        config.get_unity_dialogues_path.return_value = str(tmp_path)
        with pytest.raises(FileNotFoundError):
            read_document_download_payload(config, "missing_doc")

    def test_corrupt_json_raises_value_error(self, tmp_path: Path):
        (tmp_path / "bad.json").write_text("{not-json", encoding="utf-8")
        config = MagicMock(spec=ConfigurationService)
        config.get_unity_dialogues_path.return_value = str(tmp_path)
        with pytest.raises(ValueError, match="invalide"):
            read_document_download_payload(config, "bad")


@pytest.mark.unit
class TestBuildBatchDownloadZip:
    """Archive ZIP batch."""

    def test_zip_contains_two_json_files(self, tmp_path: Path):
        for name in ("doc_a.json", "doc_b.json"):
            (tmp_path / name).write_text(
                json.dumps({"schemaVersion": "1.2.0", "nodes": []}),
                encoding="utf-8",
            )
        config = MagicMock(spec=ConfigurationService)
        config.get_unity_dialogues_path.return_value = str(tmp_path)

        zip_bytes, zip_name = build_batch_download_zip(
            config, ["doc_a.json", "doc_b.json"], compression="deflate"
        )

        assert zip_name == "unity-dialogues-export.zip"
        with zipfile.ZipFile(BytesIO(zip_bytes)) as archive:
            assert sorted(archive.namelist()) == ["doc_a.json", "doc_b.json"]

    def test_store_compression(self, tmp_path: Path):
        (tmp_path / "doc_a.json").write_text("{}", encoding="utf-8")
        config = MagicMock(spec=ConfigurationService)
        config.get_unity_dialogues_path.return_value = str(tmp_path)

        zip_bytes, _ = build_batch_download_zip(config, ["doc_a.json"], compression="store")

        with zipfile.ZipFile(BytesIO(zip_bytes)) as archive:
            info = archive.getinfo("doc_a.json")
            assert info.compress_type == zipfile.ZIP_STORED

"""Tests Story 5.2 — batch export Unity JSON (FR50)."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from api.utils.unity_schema_validator import validate_unity_json
from services.batch_export_service import (
    BatchExportFailedItem,
    batch_export_documents,
    export_persisted_document,
)

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
def mock_config(tmp_path: Path):
    """ConfigurationService mocké avec chemin Unity temporaire."""
    config = MagicMock()
    config.get_unity_dialogues_path.return_value = str(tmp_path)
    return config


@pytest.mark.unit
class TestBatchExportServiceSuccess:
    """Batch export — succès complet."""

    def test_batch_export_three_documents(self, mock_config, tmp_path: Path):
        for doc_id in ("doc_a", "doc_b", "doc_c"):
            _write_doc(tmp_path, doc_id, _VALID_DOCUMENT)

        result = batch_export_documents(
            mock_config,
            ["doc_a", "doc_b", "doc_c"],
            skip_validation=False,
            filename_strategy="preserve",
        )

        assert len(result.exported) == 3
        assert result.failed == []
        assert result.cancelled is False
        for doc_id in ("doc_a", "doc_b", "doc_c"):
            assert (tmp_path / f"{doc_id}.json").exists()


@pytest.mark.unit
class TestBatchExportContinuesAfterValidationFailure:
    """AC #2 — un échec validation n'arrête pas le batch."""

    def test_batch_export_continues_after_single_validation_failure(
        self, mock_config, tmp_path: Path
    ):
        _write_doc(tmp_path, "valid_one", _VALID_DOCUMENT)
        _write_doc(tmp_path, "invalid_one", _INVALID_DOCUMENT)
        _write_doc(tmp_path, "valid_two", _VALID_DOCUMENT)

        result = batch_export_documents(
            mock_config,
            ["valid_one", "invalid_one", "valid_two"],
            skip_validation=False,
            filename_strategy="preserve",
        )

        assert len(result.exported) == 2
        assert len(result.failed) == 1
        assert result.failed[0].id == "invalid_one"
        assert len(result.failed[0].errors) > 0


@pytest.mark.unit
class TestBatchExportUnityPathNull:
    """AC #4 — chemin Unity null → échec global."""

    def test_batch_export_fails_when_unity_path_null(self):
        config = MagicMock()
        config.get_unity_dialogues_path.return_value = None

        with pytest.raises(Exception) as exc_info:
            batch_export_documents(config, ["doc_a"])

        assert "unity_dialogues_path" in str(exc_info.value).lower() or getattr(
            exc_info.value, "details", {}
        ).get("field") == "unity_dialogues_path"


@pytest.mark.unit
class TestBatchExportSkipValidation:
    """AC #4 — option skip_validation écrit malgré schéma invalide."""

    def test_skip_validation_writes_invalid_document(self, mock_config, tmp_path: Path):
        _write_doc(tmp_path, "invalid_doc", _INVALID_DOCUMENT)

        result = batch_export_documents(
            mock_config,
            ["invalid_doc"],
            skip_validation=True,
            filename_strategy="preserve",
        )

        assert len(result.exported) == 1
        assert result.failed == []


@pytest.mark.unit
class TestBatchExportSlugStrategy:
    """AC #4 — stratégie slug pour le nom de fichier exporté."""

    def test_batch_export_slug_filename_from_title(self, mock_config, tmp_path: Path):
        doc = {**_VALID_DOCUMENT, "title": "Bonjour Monde!"}
        _write_doc(tmp_path, "doc_a", doc)

        result = batch_export_documents(
            mock_config,
            ["doc_a"],
            skip_validation=False,
            filename_strategy="slug",
        )

        assert len(result.exported) == 1
        assert result.exported[0] == "bonjour_monde.json"
        assert (tmp_path / "bonjour_monde.json").is_file()
        assert (tmp_path / "doc_a.json").is_file()


@pytest.mark.unit
class TestBatchExportPreservesMetadata:
    """Code review 5.2 — réécriture preserve conserve title et dialogueFlags."""

    def test_batch_export_preserves_document_metadata(self, mock_config, tmp_path: Path):
        doc = {
            **_VALID_DOCUMENT,
            "title": "Titre éditable",
            "dialogueFlags": [
                {"flagId": "quest_done", "type": "bool", "initialValue": False},
            ],
        }
        _write_doc(tmp_path, "doc_meta", doc)

        result = batch_export_documents(
            mock_config,
            ["doc_meta"],
            skip_validation=False,
            filename_strategy="preserve",
        )

        assert len(result.exported) == 1
        written = json.loads((tmp_path / "doc_meta.json").read_text(encoding="utf-8"))
        assert written["title"] == "Titre éditable"
        assert written["dialogueFlags"] == doc["dialogueFlags"]


@pytest.mark.unit
class TestBatchExportDiskErrors:
    """AC #2 — erreur disque sur un item n'arrête pas le batch."""

    def test_batch_export_continues_after_oserror_on_write(
        self, mock_config, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        _write_doc(tmp_path, "doc_a", _VALID_DOCUMENT)
        _write_doc(tmp_path, "doc_b", _VALID_DOCUMENT)
        _write_doc(tmp_path, "doc_c", _VALID_DOCUMENT)

        original_export = export_persisted_document

        def flaky_export(config, doc_id, **kwargs):
            if doc_id == "doc_b":
                raise OSError("disque plein")
            return original_export(config, doc_id, **kwargs)

        monkeypatch.setattr(
            "services.batch_export_service.export_persisted_document",
            flaky_export,
        )

        result = batch_export_documents(
            mock_config,
            ["doc_a", "doc_b", "doc_c"],
            skip_validation=False,
            filename_strategy="preserve",
        )

        assert len(result.exported) == 2
        assert len(result.failed) == 1
        assert result.failed[0].id == "doc_b"


@pytest.mark.unit
class TestExportPersistedDocumentMissing:
    """Document absent → échec item."""

    def test_export_missing_document_raises_not_found(self, mock_config, tmp_path: Path):
        with pytest.raises(FileNotFoundError):
            export_persisted_document(mock_config, "missing_doc")

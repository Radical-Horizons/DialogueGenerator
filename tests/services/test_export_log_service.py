"""Tests service ExportLogService (Story 5.6 / FR54)."""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from services.export_log_service import (
    ExportLogService,
    build_export_log_metadata,
    metadata_from_document,
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


@pytest.fixture
def export_logs_dir(tmp_path: Path) -> Path:
    """Répertoire logs export isolé."""
    log_dir = tmp_path / "exports"
    log_dir.mkdir(parents=True)
    return log_dir


@pytest.fixture
def export_log_service(export_logs_dir: Path) -> ExportLogService:
    """Service avec répertoire temporaire."""
    return ExportLogService(logs_dir=export_logs_dir)


@pytest.mark.unit
class TestExportLogServicePersistence:
    """AC #1 — persistance append-safe."""

    def test_log_export_appends_success_entry(self, export_log_service: ExportLogService):
        entry = build_export_log_metadata(
            dialogue_id="doc_a",
            filename="doc_a.json",
            export_status="success",
            validation_status="valid",
            file_size_bytes=128,
            errors=[],
            warnings_gdd=[],
            source="graph",
        )
        export_log_service.log_export(entry)

        day_file = export_log_service.logs_dir / f"{date.today().isoformat()}.json"
        assert day_file.is_file()
        stored = json.loads(day_file.read_text(encoding="utf-8"))
        assert len(stored) == 1
        assert stored[0]["export_status"] == "success"
        assert stored[0]["filename"] == "doc_a.json"
        assert stored[0]["file_size_bytes"] == 128
        assert stored[0]["validation_status"] == "valid"

    def test_log_export_appends_failure_entry(self, export_log_service: ExportLogService):
        entry = build_export_log_metadata(
            dialogue_id="bad_doc",
            filename="bad_doc.json",
            export_status="failure",
            validation_status="invalid",
            file_size_bytes=None,
            errors=["choiceId manquant"],
            warnings_gdd=[],
            source="batch",
        )
        export_log_service.log_export(entry)

        result = export_log_service.list_exports()
        assert result.total_count == 1
        assert result.failure_count == 1
        assert result.entries[0]["errors"] == ["choiceId manquant"]


@pytest.mark.unit
class TestExportLogServiceList:
    """Consultation et filtres."""

    def test_list_exports_sorted_recent_first(self, export_log_service: ExportLogService):
        older = build_export_log_metadata(
            dialogue_id="a",
            filename="a.json",
            export_status="success",
            validation_status="valid",
            file_size_bytes=10,
            errors=[],
            warnings_gdd=[],
            source="graph",
        )
        older["timestamp"] = "2026-01-01T10:00:00+00:00"
        newer = build_export_log_metadata(
            dialogue_id="b",
            filename="b.json",
            export_status="success",
            validation_status="valid",
            file_size_bytes=20,
            errors=[],
            warnings_gdd=[],
            source="graph",
        )
        newer["timestamp"] = "2026-01-02T10:00:00+00:00"
        export_log_service.log_export(older)
        export_log_service.log_export(newer)

        result = export_log_service.list_exports()
        assert result.entries[0]["dialogue_id"] == "b"
        assert result.entries[1]["dialogue_id"] == "a"

    def test_list_exports_filters_by_status(self, export_log_service: ExportLogService):
        export_log_service.log_export(
            build_export_log_metadata(
                dialogue_id="ok",
                filename="ok.json",
                export_status="success",
                validation_status="valid",
                file_size_bytes=1,
                errors=[],
                warnings_gdd=[],
                source="batch",
            )
        )
        export_log_service.log_export(
            build_export_log_metadata(
                dialogue_id="ko",
                filename="ko.json",
                export_status="failure",
                validation_status="invalid",
                file_size_bytes=None,
                errors=["err"],
                warnings_gdd=[],
                source="batch",
            )
        )

        filtered = export_log_service.list_exports(status="failure")
        assert filtered.total_count == 1
        assert filtered.entries[0]["dialogue_id"] == "ko"

    def test_corrupt_daily_file_returns_partial_empty(self, export_log_service: ExportLogService):
        bad_file = export_log_service.logs_dir / f"{date.today().isoformat()}.json"
        bad_file.write_text("{not json", encoding="utf-8")
        result = export_log_service.list_exports()
        assert result.total_count == 0


@pytest.mark.unit
class TestBuildExportLogMetadata:
    """Construction métadonnées centralisée."""

    def test_cost_eur_null_when_no_llm_records(self):
        mock_llm = MagicMock()
        mock_llm.get_dialogue_costs.return_value = {
            "dialogue_id": "doc_x",
            "total_cost_eur": 0.0,
            "node_count": 0,
            "avg_cost_per_node_eur": 0.0,
            "breakdown": [],
        }
        meta = build_export_log_metadata(
            dialogue_id="doc_x",
            filename="doc_x.json",
            export_status="success",
            validation_status="valid",
            file_size_bytes=50,
            errors=[],
            warnings_gdd=[],
            source="unity_export",
            llm_usage_service=mock_llm,
        )
        assert meta["cost_eur"] is None

    def test_cost_eur_from_llm_service(self):
        mock_llm = MagicMock()
        mock_llm.get_dialogue_costs.return_value = {
            "dialogue_id": "doc_y",
            "total_cost_eur": 0.0123,
            "node_count": 2,
            "avg_cost_per_node_eur": 0.00615,
            "breakdown": [],
        }
        meta = build_export_log_metadata(
            dialogue_id="doc_y",
            filename="doc_y.json",
            export_status="success",
            validation_status="valid",
            file_size_bytes=50,
            errors=[],
            warnings_gdd=[],
            source="library",
            llm_usage_service=mock_llm,
        )
        assert meta["cost_eur"] == pytest.approx(0.0123)

    def test_metadata_from_document_success(self):
        meta = metadata_from_document(
            _VALID_DOCUMENT,
            dialogue_id="valid_one",
            filename="valid_one.json",
            export_status="success",
            skip_validation=False,
            source="batch",
        )
        assert meta["validation_status"] == "valid"
        assert meta["file_size_bytes"] is not None
        assert meta["file_size_bytes"] > 0

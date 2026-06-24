"""Tests unity_export_normalizer (Epic 5 retro T1)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from api.utils.unity_schema_validator import validate_unity_json
from services.unity_export_normalizer import (
    normalize_unity_export_document,
    prepare_unity_export_document,
)
from services.unity_export_validation_service import validate_unity_export_document

_E2E_FIXTURE = {
    "schemaVersion": "1.1.0",
    "nodes": [
        {
            "id": "node-root",
            "speaker": "Mobile",
            "line": "Fixture mobile responsive",
            "choices": [
                {
                    "choiceId": "mobile_go_end",
                    "text": "Continuer",
                    "condition": "",
                    "influenceDelta": None,
                    "respectDelta": None,
                    "targetNode": "node-end",
                },
                {
                    "choiceId": "__idx_1",
                    "text": "",
                    "condition": "",
                    "influenceDelta": None,
                    "respectDelta": None,
                },
            ],
            "title": "",
        },
        {"id": "node-end", "speaker": "Mobile", "line": "Fin mobile"},
    ],
}


class TestUnityExportNormalizer:
    """Normalisation export Unity."""

    def test_strips_placeholder_choices_and_null_fields(self) -> None:
        normalized = normalize_unity_export_document(_E2E_FIXTURE)
        root = normalized["nodes"][0]
        assert len(root["choices"]) == 1
        choice = root["choices"][0]
        assert choice["choiceId"] == "mobile_go_end"
        assert "influenceDelta" not in choice
        assert "respectDelta" not in choice
        assert "condition" not in choice
        assert "title" not in root

    def test_e2e_fixture_valid_after_normalization(self) -> None:
        result = validate_unity_export_document(_E2E_FIXTURE)
        assert result.is_valid is True
        assert result.error_count == 0

    def test_prepare_legacy_list(self) -> None:
        nodes = _E2E_FIXTURE["nodes"]
        prepared = prepare_unity_export_document(nodes)
        assert prepared["schemaVersion"] == "1.1.0"
        assert len(prepared["nodes"][0]["choices"]) == 1

    def test_on_disk_e2e_mobile_fixture_when_present(self) -> None:
        path = (
            Path(__file__).resolve().parents[2]
            / "Assets"
            / "Dialogue"
            / "e2e-mobile-epic17-w1-43996e02b09364608741.json"
        )
        if not path.is_file():
            pytest.skip("fixture e2e mobile absente")
        raw = json.loads(path.read_text(encoding="utf-8"))
        result = validate_unity_export_document(raw)
        assert result.is_valid is True, result.errors

    def test_generated_start_dialogue_valid_after_normalization(self) -> None:
        """Régression : génération graphe START + choix test sans choiceId/targetNode."""
        doc = {
            "schemaVersion": "1.2.0",
            "nodes": [
                {
                    "id": "START",
                    "speaker": "PNJ",
                    "line": "Bonjour",
                    "choices": [
                        {
                            "text": "Tenter",
                            "test": "Volonté+Adaptabilité:12",
                        }
                    ],
                }
            ],
        }
        result = validate_unity_export_document(doc)
        assert result.is_valid is True, result.errors
        choice = doc["nodes"][0]["choices"][0]
        assert choice["choiceId"] == "choice_START_0"
        assert choice["targetNode"] == "END"
        assert choice["test"] == "Volonté+Adaptabilité:12"

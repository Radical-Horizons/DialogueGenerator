"""Tests unity_export_normalizer (Epic 5 retro T1)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from api.utils.unity_schema_validator import validate_unity_json
from api.utils.unity_schema_validator import validate_unity_json_structured
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
        from tests.fixtures.unity_post_generation import RAW_POST_GENERATION_DOCUMENT

        doc = dict(RAW_POST_GENERATION_DOCUMENT)
        doc["nodes"] = [dict(RAW_POST_GENERATION_DOCUMENT["nodes"][0])]
        result = validate_unity_export_document(doc)
        assert result.is_valid is True, result.errors
        choice = doc["nodes"][0]["choices"][0]
        assert choice["choiceId"] == "choice_START_0"
        assert choice["targetNode"] == "END"
        assert choice["test"] == "Volonté+Adaptabilité:12"

    def test_normalizes_lowercase_consequences_flag(self) -> None:
        """Régression : flags LLM en camelCase/minuscules → SCREAMING_SNAKE_CASE."""
        from tests.fixtures.unity_post_generation import RAW_POST_GENERATION_NODE

        doc = {
            "schemaVersion": "1.2.0",
            "nodes": [
                {
                    "id": "START",
                    "line": "Rencontre",
                    "consequences": dict(RAW_POST_GENERATION_NODE["consequences"]),
                }
            ],
        }
        result = validate_unity_export_document(doc)
        assert result.is_valid is True, result.errors
        assert doc["nodes"][0]["consequences"]["flag"] == "FLAG_RENCONTRE_VALKAZER_INIT"

    def test_removes_empty_visibility_conditions_blocks(self) -> None:
        """Régression : formulaire graphe sans condition ne persiste pas un bloc vide."""
        doc = {
            "schemaVersion": "1.2.0",
            "nodes": [
                {
                    "id": "START",
                    "line": "Hello",
                    "visibilityConditions": {"items": []},
                    "choices": [
                        {
                            "choiceId": "go",
                            "text": "Go",
                            "targetNode": "END",
                            "visibilityConditions": {"items": []},
                        }
                    ],
                }
            ],
        }
        result = validate_unity_export_document(doc)
        assert result.is_valid is True, result.errors
        node = doc["nodes"][0]
        assert "visibilityConditions" not in node
        assert "visibilityConditions" not in node["choices"][0]

    def test_choices_within_limit_passes_without_cutscene(self) -> None:
        """Régression : 5 choix hors cutscene ne doit pas être rejeté (max 8)."""
        doc = {
            "schemaVersion": "1.2.0",
            "nodes": [
                {
                    "id": "START",
                    "line": "Hello",
                    "choices": [
                        {
                            "choiceId": f"choice_START_{idx}",
                            "text": f"Choice {idx}",
                            "targetNode": "END",
                        }
                        for idx in range(5)
                    ],
                }
            ],
        }
        valid, errors = validate_unity_json_structured(doc)
        assert valid is True
        assert errors == []

    def test_choices_too_long_in_cutscene_is_actionable(self) -> None:
        """Régression UX : maxItems cutscene ne doit pas dumper tout le tableau JSON."""
        doc = {
            "schemaVersion": "1.2.0",
            "nodes": [
                {
                    "id": "START",
                    "line": "Hello",
                    "cutsceneMode": True,
                    "choices": [
                        {
                            "choiceId": f"choice_START_{idx}",
                            "text": f"Choice {idx}",
                            "targetNode": "END",
                        }
                        for idx in range(5)
                    ],
                }
            ],
        }
        valid, errors = validate_unity_json_structured(doc)
        assert valid is False
        assert errors[0]["code"] == "schema_max_items"
        assert errors[0]["path"] == "nodes.0.choices"
        assert errors[0]["message"] == "Trop de choix : maximum 4 choix autorisés en mode cutscene."
        assert "choice_START_0" not in errors[0]["message"]

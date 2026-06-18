"""Tests Story 5.3 — pipeline validation export unifié (FR51)."""
from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app
from services.batch_export_service import export_persisted_document
from services.graph_conversion_service import GraphConversionService
from services.unity_dialogue_export_service import write_unity_dialogue_to_file
from services.unity_export_validation_service import validate_unity_export_document
from unittest.mock import MagicMock

client = TestClient(app)

_VALID_NODE = {
    "id": "node-a1b2c3d4e5f6789012345678abcdef01",
    "line": "Bonjour",
    "speaker": "PNJ",
    "choices": [{"choiceId": "c1", "text": "OK", "targetNode": "END"}],
}


def _minimal_document(**extra: Any) -> Dict[str, Any]:
    doc: Dict[str, Any] = {
        "schemaVersion": "1.2.0",
        "nodes": [_VALID_NODE, {"id": "END", "line": ""}],
    }
    doc.update(extra)
    return doc


@pytest.mark.unit
class TestRepPalierBlockingValidation:
    """AC #1 — RepPalier dans dialogueFlags bloque la validation."""

    def test_rep_palier_flag_makes_document_invalid(self):
        doc = _minimal_document(
            dialogueFlags=[
                {"flagId": "RepPalierHostilite", "type": "enum", "initialValue": "neutre"}
            ]
        )
        result = validate_unity_export_document(doc)
        assert result.is_valid is False
        codes = [e["code"] for e in result.errors_structured]
        assert "reputation_palier_runtime_only" in codes


@pytest.mark.unit
class TestFrenchSchemaErrorMessages:
    """AC #2 — messages utilisateur en français pour erreurs schéma."""

    def test_missing_choice_id_message_is_french(self):
        doc = {
            "schemaVersion": "1.2.0",
            "nodes": [
                {
                    "id": "node-b2c3d4e5f678901234567890abcdef12",
                    "line": "Choix sans id",
                    "speaker": "PNJ",
                    "choices": [{"text": "Accepter"}],
                },
                {"id": "END", "line": ""},
            ],
        }
        result = validate_unity_export_document(doc)
        assert result.is_valid is False
        assert result.errors
        first = result.errors[0]
        assert "Erreur schéma Unity" in first
        assert "choiceId" in first.lower() or "choiceid" in first.lower()


@pytest.mark.unit
class TestUnifiedValidationVerdict:
    """AC #1 — même verdict validate-schema, write et batch."""

    _INVALID_GRAPH = {
        "nodes": [
            {
                "id": "node-b2c3d4e5f678901234567890abcdef12",
                "type": "dialogueNode",
                "position": {"x": 0, "y": 0},
                "data": {
                    "stableId": "node-b2c3d4e5f678901234567890abcdef12",
                    "line": "Choix sans choiceId",
                    "speaker": "PNJ",
                    "choices": [{"text": "Accepter"}],
                },
            },
            {"id": "END", "type": "endNode", "position": {"x": 0, "y": 200}, "data": {"line": ""}},
        ],
        "edges": [
            {
                "id": "e1",
                "source": "node-b2c3d4e5f678901234567890abcdef12",
                "target": "END",
                "data": {"edgeType": "choice", "choiceIndex": 0},
            }
        ],
    }

    def test_validate_schema_write_and_service_same_verdict_invalid(self, tmp_path):
        unity_str = GraphConversionService.graph_to_unity_json(
            self._INVALID_GRAPH["nodes"], self._INVALID_GRAPH["edges"]
        )
        doc = json.loads(unity_str)

        service_result = validate_unity_export_document(doc)
        assert service_result.is_valid is False

        response = client.post(
            "/api/v1/unity-dialogues/graph/validate-schema",
            json={"nodes": self._INVALID_GRAPH["nodes"], "edges": self._INVALID_GRAPH["edges"]},
        )
        assert response.status_code == 200
        api_valid = response.json()["is_valid"]
        assert api_valid is False

        mock_config = MagicMock()
        mock_config.get_unity_dialogues_path.return_value = str(tmp_path)
        from api.exceptions import ValidationException

        with pytest.raises(ValidationException):
            write_unity_dialogue_to_file(
                config_service=mock_config,
                json_content=unity_str,
                filename="blocked.json",
            )


@pytest.mark.unit
class TestGddThresholdWarnings:
    """AC #5 — avertissements non bloquants seuils GDD."""

    def test_validation_warns_when_flag_count_exceeds_gdd_threshold(self):
        flags: List[Dict[str, Any]] = [
            {"flagId": f"flag_conv_{i}", "type": "bool", "initialValue": False}
            for i in range(11)
        ]
        doc = _minimal_document(dialogueFlags=flags)
        result = validate_unity_export_document(doc)
        assert result.is_valid is True
        assert result.warnings
        assert any("10" in w["message"] or "conversationnel" in w["message"].lower() for w in result.warnings)

    def test_validation_warns_when_counter_count_exceeds_gdd_threshold(self):
        flags = [
            {"flagId": f"ctr_{i}", "type": "compteur", "initialValue": 0}
            for i in range(4)
        ]
        doc = _minimal_document(dialogueFlags=flags)
        result = validate_unity_export_document(doc)
        assert result.is_valid is True
        assert any("compteur" in w["message"].lower() for w in result.warnings)

    def test_validation_warns_when_node_count_exceeds_maintainability_threshold(self):
        nodes = [_VALID_NODE]
        nodes.extend(
            {"id": f"node-extra-{i:04d}", "line": f"L{i}", "nextNode": "END"}
            for i in range(1000)
        )
        nodes.append({"id": "END", "line": ""})
        doc = {"schemaVersion": "1.2.0", "nodes": nodes}
        result = validate_unity_export_document(doc)
        assert result.is_valid is True
        assert any("1000" in w["message"] for w in result.warnings)


@pytest.mark.unit
class TestGraphValidateSchemaWithDialogueFlags:
    """AC #1 — validate-schema graphe inclut dialogueFlags GDD."""

    _VALID_GRAPH = {
        "nodes": [
            {
                "id": "node-a1b2c3d4e5f6789012345678abcdef01",
                "type": "dialogueNode",
                "position": {"x": 0, "y": 0},
                "data": {
                    "stableId": "node-a1b2c3d4e5f6789012345678abcdef01",
                    "line": "Hello",
                    "speaker": "NPC",
                    "choices": [{"choiceId": "c1", "text": "Go", "targetNode": "END"}],
                },
            },
            {"id": "END", "type": "endNode", "position": {"x": 0, "y": 200}, "data": {"line": ""}},
        ],
        "edges": [
            {
                "id": "e1",
                "source": "node-a1b2c3d4e5f6789012345678abcdef01",
                "target": "END",
                "data": {"edgeType": "choice", "choiceIndex": 0},
            }
        ],
    }

    def test_rep_palier_in_dialogue_flags_invalidates_graph_validate_schema(self):
        payload = {
            **self._VALID_GRAPH,
            "dialogue_flags": [
                {"flagId": "RepPalierHostilite", "type": "enum", "initialValue": "neutre"}
            ],
        }
        response = client.post("/api/v1/unity-dialogues/graph/validate-schema", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] is False
        codes = [e["code"] for e in data["structured_errors"]]
        assert "reputation_palier_runtime_only" in codes

    def test_flag_threshold_warning_on_graph_validate_schema(self):
        flags = [
            {"flagId": f"flag_conv_{i}", "type": "bool", "initialValue": False}
            for i in range(11)
        ]
        payload = {**self._VALID_GRAPH, "dialogue_flags": flags}
        response = client.post("/api/v1/unity-dialogues/graph/validate-schema", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] is True
        assert data["warnings"]
    """AC #5 — batch export autorisé avec warnings seuls."""

    def test_batch_export_writes_file_when_only_warnings(self, tmp_path):
        flags = [
            {"flagId": f"flag_conv_{i}", "type": "bool", "initialValue": False}
            for i in range(11)
        ]
        doc = _minimal_document(dialogueFlags=flags)
        doc_path = tmp_path / "warn_doc.json"
        doc_path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

        mock_config = MagicMock()
        mock_config.get_unity_dialogues_path.return_value = str(tmp_path)
        path, filename = export_persisted_document(
            mock_config, "warn_doc", skip_validation=False
        )
        assert path.exists()
        assert filename == "warn_doc.json"

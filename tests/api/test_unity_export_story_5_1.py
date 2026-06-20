"""Tests Story 5.1 — export Unity single dialogue (FR49)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app
from api.utils.unity_schema_validator import validate_unity_json
from services.graph_conversion_service import GraphConversionService
from services.unity_dialogue_export_service import write_unity_dialogue_to_file
from services.unity_export_validation_service import validate_unity_export_document

client = TestClient(app)

_VALID_NODE_ID = "node-a1b2c3d4e5f6789012345678abcdef01"

_VALID_GRAPH = {
    "nodes": [
        {
            "id": _VALID_NODE_ID,
            "type": "dialogueNode",
            "position": {"x": 0, "y": 0},
            "data": {
                "stableId": _VALID_NODE_ID,
                "displayName": "Ouverture",
                "line": "Bonjour aventurier !",
                "speaker": "PNJ",
                "choices": [{"choiceId": "choice_reply", "text": "Répondre"}],
            },
        },
        {
            "id": "END",
            "type": "endNode",
            "position": {"x": 0, "y": 200},
            "data": {"line": ""},
        },
    ],
    "edges": [
        {
            "id": "e1",
            "source": _VALID_NODE_ID,
            "target": "END",
            "data": {"edgeType": "choice", "choiceIndex": 0},
        }
    ],
    "metadata": {"title": "Export Test", "node_count": 2, "edge_count": 1},
}

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
    "metadata": {"title": "Invalid", "node_count": 2, "edge_count": 1},
}


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
class TestUnityExportPathUnavailable:
    """AC #4 — chemin Unity non configuré bloque l'export."""

    def test_save_and_write_rejects_when_unity_path_null(self):
        mock_config = MagicMock()
        mock_config.get_unity_dialogues_path.return_value = None
        app.dependency_overrides[get_config_service] = lambda: mock_config
        try:
            response = client.post(
                "/api/v1/unity-dialogues/graph/save-and-write",
                json=_VALID_GRAPH,
            )
            assert response.status_code == 422
            body = response.json()
            assert body["error"]["details"]["field"] == "unity_dialogues_path"
        finally:
            app.dependency_overrides.pop(get_config_service, None)


@pytest.mark.api
class TestUnityExportBlockedOnInvalidSchema:
    """AC #2 — export bloqué si validation schéma échoue."""

    def test_save_and_write_rejects_invalid_graph_no_file(self, unity_tmp_path: Path):
        """Graphe invalide → 422, aucun fichier écrit."""
        response = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write",
            json=_INVALID_GRAPH,
        )
        assert response.status_code == 422
        assert not any(unity_tmp_path.glob("*.json"))


@pytest.mark.api
class TestUnityExportSuccess:
    """AC #1, #3 — export réussi écrit le JSON Unity."""

    def test_save_and_write_writes_valid_graph(self, unity_tmp_path: Path):
        response = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write",
            json=_VALID_GRAPH,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["filename"] == "Export_Test.json"
        written = unity_tmp_path / "Export_Test.json"
        assert written.exists()
        content = json.loads(written.read_text(encoding="utf-8"))
        assert content.get("schemaVersion") == "1.1.0"
        assert len(content["nodes"]) == 2

    def test_new_wired_dialogue_two_nodes_passes_schema_and_export(
        self, unity_tmp_path: Path
    ) -> None:
        """Parcours neuf : graphe câblé (2 répliques + END) → validation 0 erreur → écriture."""
        node_a = "node-a1b2c3d4e5f6789012345678abcdef01"
        node_b = "node-b2c3d4e5f678901234567890abcdef12"
        graph = {
            "nodes": [
                {
                    "id": node_a,
                    "type": "dialogueNode",
                    "position": {"x": 0, "y": 0},
                    "data": {
                        "stableId": node_a,
                        "displayName": "Ouverture",
                        "line": "Bienvenue, voyageur.",
                        "speaker": "Aubergiste",
                        "choices": [{"choiceId": "go_on", "text": "Continuer"}],
                    },
                },
                {
                    "id": node_b,
                    "type": "dialogueNode",
                    "position": {"x": 0, "y": 150},
                    "data": {
                        "stableId": node_b,
                        "displayName": "Suite",
                        "line": "La nuit tombe.",
                        "speaker": "Aubergiste",
                        "choices": [{"choiceId": "leave", "text": "Partir"}],
                    },
                },
                {
                    "id": "END",
                    "type": "endNode",
                    "position": {"x": 0, "y": 300},
                    "data": {"line": ""},
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": node_a,
                    "target": node_b,
                    "data": {"edgeType": "choice", "choiceIndex": 0},
                },
                {
                    "id": "e2",
                    "source": node_b,
                    "target": "END",
                    "data": {"edgeType": "choice", "choiceIndex": 0},
                },
            ],
            "metadata": {
                "title": "Retro Golden Path",
                "node_count": 3,
                "edge_count": 2,
            },
        }
        unity_doc = json.loads(
            GraphConversionService.graph_to_unity_json(graph["nodes"], graph["edges"])
        )
        validation = validate_unity_export_document(unity_doc)
        assert validation.is_valid, validation.errors

        response = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write",
            json=graph,
        )
        assert response.status_code == 200
        written = unity_tmp_path / "Retro_Golden_Path.json"
        assert written.exists()
        on_disk = json.loads(written.read_text(encoding="utf-8"))
        assert validate_unity_export_document(on_disk).is_valid
        choice = on_disk["nodes"][0]["choices"][0]
        assert choice["targetNode"] == node_b


@pytest.mark.api
class TestExportPreservesGddFields:
    """AC #5 — champs GDD survivent à graph_to_unity_json."""

    def test_export_preserves_visibility_conditions(self):
        nodes = [
            {
                "id": _VALID_NODE_ID,
                "type": "dialogueNode",
                "position": {"x": 0, "y": 0},
                "data": {
                    "stableId": _VALID_NODE_ID,
                    "displayName": "N1",
                    "line": "Hello",
                    "speaker": "NPC",
                    "visibilityConditions": {
                        "combine": "all",
                        "items": [
                            {
                                "kind": "flag_bool",
                                "flagId": "flag_test",
                                "operator": "eq",
                                "value": True,
                            }
                        ],
                    },
                    "choices": [{"choiceId": "c1", "text": "Go"}],
                },
            },
            {"id": "END", "type": "endNode", "position": {"x": 0, "y": 200}, "data": {"line": ""}},
        ]
        edges = [
            {
                "id": "e1",
                "source": _VALID_NODE_ID,
                "target": "END",
                "data": {"edgeType": "choice", "choiceIndex": 0},
            }
        ]
        unity_json = GraphConversionService.graph_to_unity_json(nodes, edges)
        doc = json.loads(unity_json)
        node = doc["nodes"][0]
        assert node.get("visibilityConditions") == nodes[0]["data"]["visibilityConditions"]

    def test_export_preserves_reputation_fr94_and_skill_check_on_choice(self):
        rep_block = {
            "combine": "all",
            "items": [
                {
                    "kind": "reputation_fr94",
                    "axisId": "axis_rep",
                    "operator": "gte",
                    "value": 3,
                }
            ],
        }
        skill_check = {
            "attributeId": "volonte",
            "skillId": "persuasion",
            "difficulty": 8,
        }
        nodes = [
            {
                "id": _VALID_NODE_ID,
                "type": "dialogueNode",
                "position": {"x": 0, "y": 0},
                "data": {
                    "stableId": _VALID_NODE_ID,
                    "displayName": "N1",
                    "line": "Hello",
                    "speaker": "NPC",
                    "choices": [
                        {
                            "choiceId": "c1",
                            "text": "Persuader",
                            "skillCheck": skill_check,
                            "visibilityConditions": rep_block,
                        }
                    ],
                },
            },
            {"id": "END", "type": "endNode", "position": {"x": 0, "y": 200}, "data": {"line": ""}},
        ]
        edges = [
            {
                "id": "e1",
                "source": _VALID_NODE_ID,
                "target": "END",
                "data": {"edgeType": "choice", "choiceIndex": 0},
            }
        ]
        unity_json = GraphConversionService.graph_to_unity_json(nodes, edges)
        choice = json.loads(unity_json)["nodes"][0]["choices"][0]
        assert choice.get("skillCheck") == skill_check
        assert choice.get("visibilityConditions") == rep_block

    def test_export_preserves_choice_effects(self) -> None:
        """Review 5.1 — choiceEffects survivent à la conversion."""
        effects = [
            {
                "kind": "flag_bool",
                "flagId": "FLAG_TEST",
                "operator": "set",
                "value": True,
            }
        ]
        nodes = [
            {
                "id": _VALID_NODE_ID,
                "type": "dialogueNode",
                "position": {"x": 0, "y": 0},
                "data": {
                    "stableId": _VALID_NODE_ID,
                    "displayName": "N1",
                    "line": "Hello",
                    "speaker": "NPC",
                    "choices": [
                        {
                            "choiceId": "c1",
                            "text": "Act",
                            "choiceEffects": effects,
                        }
                    ],
                },
            },
            {"id": "END", "type": "endNode", "position": {"x": 0, "y": 200}, "data": {"line": ""}},
        ]
        edges = [
            {
                "id": "e1",
                "source": _VALID_NODE_ID,
                "target": "END",
                "data": {"edgeType": "choice", "choiceIndex": 0},
            }
        ]
        choice = json.loads(GraphConversionService.graph_to_unity_json(nodes, edges))["nodes"][0][
            "choices"
        ][0]
        assert choice.get("choiceEffects") == effects

    def test_export_preserves_node_type(self) -> None:
        """Review 5.1 — nodeType spécial exporté."""
        nodes = [
            {
                "id": _VALID_NODE_ID,
                "type": "dialogueNode",
                "position": {"x": 0, "y": 0},
                "data": {
                    "stableId": _VALID_NODE_ID,
                    "displayName": "Cut",
                    "line": "…",
                    "speaker": "NPC",
                    "nodeType": "cutscene",
                },
            },
            {"id": "END", "type": "endNode", "position": {"x": 0, "y": 200}, "data": {"line": ""}},
        ]
        edges = [
            {
                "id": "e1",
                "source": _VALID_NODE_ID,
                "target": "END",
                "data": {"edgeType": "next", "choiceIndex": None},
            }
        ]
        exported = json.loads(GraphConversionService.graph_to_unity_json(nodes, edges))["nodes"][0]
        assert exported.get("nodeType") == "cutscene"

    def test_graph_export_excludes_test_nodes(self) -> None:
        """Review 5.1 — testNode absent du JSON Unity."""
        nodes = [
            {
                "id": _VALID_NODE_ID,
                "type": "dialogueNode",
                "position": {"x": 0, "y": 0},
                "data": {
                    "stableId": _VALID_NODE_ID,
                    "displayName": "N1",
                    "line": "Hello",
                    "speaker": "NPC",
                    "choices": [{"choiceId": "c1", "text": "Go"}],
                },
            },
            {
                "id": "test-node-1",
                "type": "testNode",
                "position": {"x": 0, "y": 100},
                "data": {"id": "test-node-1", "line": "Test"},
            },
            {"id": "END", "type": "endNode", "position": {"x": 0, "y": 200}, "data": {"line": ""}},
        ]
        edges = [
            {
                "id": "e1",
                "source": _VALID_NODE_ID,
                "target": "END",
                "data": {"edgeType": "choice", "choiceIndex": 0},
            }
        ]
        doc = json.loads(GraphConversionService.graph_to_unity_json(nodes, edges))
        ids = {n["id"] for n in doc["nodes"]}
        assert "test-node-1" not in ids
        assert _VALID_NODE_ID in ids


@pytest.mark.api
class TestUnityExportPerformance:
    """NFR-P3 — latence export API (Epic 5 retro A1)."""

    def test_save_and_write_under_200ms_small_graph(self, unity_tmp_path: Path) -> None:
        start = time.perf_counter()
        response = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write",
            json=_VALID_GRAPH,
        )
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert response.status_code == 200
        assert elapsed_ms < 200, f"export took {elapsed_ms:.1f} ms (NFR-P3)"


@pytest.mark.api
class TestValidatorAlignmentExportValidateSchema:
    """AC #1 Task 4 — validate-schema et write_unity_dialogue_to_file même verdict."""

    def test_validate_schema_and_write_use_same_verdict_valid(self, unity_tmp_path: Path):
        unity_str = GraphConversionService.graph_to_unity_json(
            _VALID_GRAPH["nodes"], _VALID_GRAPH["edges"]
        )
        doc = json.loads(unity_str)
        is_valid_schema, _ = validate_unity_json(doc)
        assert is_valid_schema is True

        mock_config = MagicMock()
        mock_config.get_unity_dialogues_path.return_value = str(unity_tmp_path)
        path, _ = write_unity_dialogue_to_file(
            config_service=mock_config,
            json_content=unity_str,
            filename="aligned.json",
        )
        assert path.exists()

    def test_validate_schema_and_write_use_same_verdict_invalid(self, unity_tmp_path: Path):
        unity_str = GraphConversionService.graph_to_unity_json(
            _INVALID_GRAPH["nodes"], _INVALID_GRAPH["edges"]
        )
        doc = json.loads(unity_str)
        is_valid_schema, schema_errors = validate_unity_json(doc)
        assert is_valid_schema is False
        assert len(schema_errors) >= 1

        mock_config = MagicMock()
        mock_config.get_unity_dialogues_path.return_value = str(unity_tmp_path)
        from api.exceptions import ValidationException

        with pytest.raises(ValidationException):
            write_unity_dialogue_to_file(
                config_service=mock_config,
                json_content=unity_str,
                filename="blocked.json",
            )
        assert not (unity_tmp_path / "blocked.json").exists()

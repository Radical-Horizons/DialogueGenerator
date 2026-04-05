"""Tests pour GraphValidationService."""
import time

import pytest

from services.graph_validation_service import GraphValidationService, ValidationResult


class TestValidateCycles:
    """Tests pour la détection de cycles avec chemin complet."""
    
    def test_detect_single_cycle_with_full_path(self):
        """Test: Détecte un cycle simple et retourne le chemin complet."""
        nodes = [
            {"id": "A", "data": {"label": "Node A"}},
            {"id": "B", "data": {"label": "Node B"}},
            {"id": "C", "data": {"label": "Node C"}},
        ]
        edges = [
            {"id": "e1", "source": "A", "target": "B"},
            {"id": "e2", "source": "B", "target": "C"},
            {"id": "e3", "source": "C", "target": "A"},  # Cycle: A → B → C → A
        ]
        
        result = ValidationResult()
        GraphValidationService._validate_cycles(nodes, edges, result)
        
        assert len(result.warnings) == 1
        warning = result.warnings[0]
        assert warning.type == "cycle_detected"
        assert warning.cycle_path == "A → B → C → A"
        assert set(warning.cycle_nodes) == {"A", "B", "C"}
        assert warning.cycle_id is not None
        assert warning.cycle_id.startswith("cycle_")
    
    def test_detect_multiple_cycles_with_paths(self):
        """Test: Détecte plusieurs cycles distincts avec leurs chemins."""
        nodes = [
            {"id": "A", "data": {"label": "Node A"}},
            {"id": "B", "data": {"label": "Node B"}},
            {"id": "C", "data": {"label": "Node C"}},
            {"id": "D", "data": {"label": "Node D"}},
            {"id": "E", "data": {"label": "Node E"}},
        ]
        edges = [
            {"id": "e1", "source": "A", "target": "B"},
            {"id": "e2", "source": "B", "target": "A"},  # Cycle 1: A → B → A
            {"id": "e3", "source": "C", "target": "D"},
            {"id": "e4", "source": "D", "target": "E"},
            {"id": "e5", "source": "E", "target": "C"},  # Cycle 2: C → D → E → C
        ]
        
        result = ValidationResult()
        GraphValidationService._validate_cycles(nodes, edges, result)
        
        assert len(result.warnings) == 2
        
        # Vérifier que chaque cycle a un ID unique
        cycle_ids = [w.cycle_id for w in result.warnings]
        assert len(set(cycle_ids)) == 2
        
        # Vérifier les chemins
        paths = [w.cycle_path for w in result.warnings]
        assert "A → B → A" in paths or "B → A → B" in paths
        assert "C → D → E → C" in paths or "D → E → C → D" in paths or "E → C → D → E" in paths
    
    def test_no_cycles_no_warnings(self):
        """Test: Graphe sans cycles ne génère pas de warnings."""
        nodes = [
            {"id": "A", "data": {"label": "Node A"}},
            {"id": "B", "data": {"label": "Node B"}},
            {"id": "C", "data": {"label": "Node C"}},
        ]
        edges = [
            {"id": "e1", "source": "A", "target": "B"},
            {"id": "e2", "source": "B", "target": "C"},
            # Pas de cycle
        ]
        
        result = ValidationResult()
        GraphValidationService._validate_cycles(nodes, edges, result)
        
        assert len(result.warnings) == 0
    
    def test_cycle_id_stable_for_same_nodes(self):
        """Test: Le cycle_id est stable pour le même ensemble de nœuds."""
        nodes = [
            {"id": "A", "data": {"label": "Node A"}},
            {"id": "B", "data": {"label": "Node B"}},
            {"id": "C", "data": {"label": "Node C"}},
        ]
        edges = [
            {"id": "e1", "source": "A", "target": "B"},
            {"id": "e2", "source": "B", "target": "C"},
            {"id": "e3", "source": "C", "target": "A"},
        ]
        
        result1 = ValidationResult()
        GraphValidationService._validate_cycles(nodes, edges, result1)
        
        result2 = ValidationResult()
        GraphValidationService._validate_cycles(nodes, edges, result2)
        
        assert result1.warnings[0].cycle_id == result2.warnings[0].cycle_id


class TestUnityDialogueStructureFr36:
    """Validation structurelle DisplayName, stableID (data.id), texte dialogue."""

    def test_missing_display_name_dialogue_node(self):
        nodes = [
            {
                "id": "D1",
                "type": "dialogueNode",
                "data": {
                    "id": "D1",
                    "line": "Hello",
                },
            }
        ]
        result = GraphValidationService.validate_graph(nodes, [])
        types = [e.type for e in result.errors]
        assert "missing_display_name" in types
        assert any(e.node_id == "D1" for e in result.errors if e.type == "missing_display_name")

    def test_missing_dialogue_text(self):
        nodes = [
            {
                "id": "D1",
                "type": "dialogueNode",
                "data": {
                    "id": "D1",
                    "title": "Titre",
                },
            }
        ]
        result = GraphValidationService.validate_graph(nodes, [])
        types = [e.type for e in result.errors]
        assert "missing_dialogue_text" in types

    def test_choices_without_text_not_exploitable(self):
        """Liste choices non vide mais sans texte utile → même règle que sans choices (FR36)."""
        nodes = [
            {
                "id": "D1",
                "type": "dialogueNode",
                "data": {
                    "id": "D1",
                    "displayName": "X",
                    "choices": [{}, {"text": "  "}, {"text": None}],
                },
            }
        ]
        result = GraphValidationService.validate_graph(nodes, [])
        assert any(e.type == "missing_dialogue_text" for e in result.errors)

    def test_missing_stable_id_index(self):
        nodes = [
            {
                "type": "dialogueNode",
                "data": {"title": "X", "line": "y"},
            }
        ]
        result = GraphValidationService.validate_graph(nodes, [])
        assert any(e.type == "missing_stable_id" and e.node_id is None for e in result.errors)

    def test_data_id_mismatch(self):
        nodes = [
            {
                "id": "ROOT",
                "type": "dialogueNode",
                "data": {
                    "id": "OTHER",
                    "title": "OK",
                    "line": "text",
                },
            }
        ]
        result = GraphValidationService.validate_graph(nodes, [])
        assert any(
            e.type == "missing_stable_id" and "incohérent" in e.message for e in result.errors
        )

    def test_valid_dialogue_node_no_structural_errors(self):
        nodes = [
            {
                "id": "D1",
                "type": "dialogueNode",
                "data": {
                    "id": "D1",
                    "displayName": "Scene",
                    "line": "Hello",
                },
            }
        ]
        result = GraphValidationService.validate_graph(nodes, [])
        structural = {
            "missing_display_name",
            "missing_dialogue_text",
        }
        bad = [e for e in result.errors if e.type in structural]
        assert bad == []

    def test_start_skips_display_and_text_rules(self):
        nodes = [
            {
                "id": "START",
                "type": "dialogueNode",
                "data": {"id": "START"},
            }
        ]
        result = GraphValidationService.validate_graph(nodes, [])
        assert not any(e.type == "missing_display_name" for e in result.errors)
        assert not any(e.type == "missing_dialogue_text" for e in result.errors)


class TestFindOrphanNodesNodeId:
    """Régression : find_orphan_nodes aligné sur _node_id (id racine ou data.id)."""

    def test_orphan_when_id_only_in_data(self):
        nodes = [{"data": {"id": "onlyInData", "type": "dialogueNode"}}]
        edges: list[dict] = []
        orphans = GraphValidationService.find_orphan_nodes(nodes, edges)
        assert "onlyInData" in orphans


@pytest.mark.slow
class TestGraphValidationPerformance:
    """NFR-P3 : budget temps sur graphe de référence (exécuté en T3 / hors `not slow`)."""

    def test_validate_graph_linear_200_nodes_under_200ms(self):
        nodes = [
            {"id": "START", "type": "dialogueNode", "data": {"id": "START"}},
        ]
        edges = []
        prev = "START"
        for i in range(200):
            nid = f"n{i:03d}"
            nodes.append(
                {
                    "id": nid,
                    "type": "dialogueNode",
                    "data": {"id": nid, "displayName": f"D{i}", "line": "L"},
                }
            )
            edges.append({"id": f"e{i}", "source": prev, "target": nid})
            prev = nid
        t0 = time.perf_counter()
        GraphValidationService.validate_graph(nodes, edges)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        assert elapsed_ms < 200.0, (
            f"validate_graph({len(nodes)} nœuds) a pris {elapsed_ms:.1f} ms, cible NFR-P3 < 200 ms"
        )

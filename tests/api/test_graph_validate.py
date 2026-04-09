"""Tests pour l'endpoint /api/v1/graph/validate."""
import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


class TestGraphValidateCycles:
    """Tests pour la validation de cycles avec chemin complet."""
    
    def test_validate_graph_with_cycle_returns_cycle_path(self):
        """Test: Validation retourne cycle_path et cycle_nodes pour un cycle."""
        nodes = [
            {"id": "START", "type": "startNode", "data": {"label": "Start"}},
            {
                "id": "A",
                "type": "dialogueNode",
                "data": {"id": "A", "label": "Node A", "line": "Hello"},
            },
            {
                "id": "B",
                "type": "dialogueNode",
                "data": {"id": "B", "label": "Node B", "line": "World"},
            },
            {
                "id": "C",
                "type": "dialogueNode",
                "data": {"id": "C", "label": "Node C", "line": "Test"},
            },
        ]
        edges = [
            {"id": "e0", "source": "START", "target": "A"},
            {"id": "e1", "source": "A", "target": "B"},
            {"id": "e2", "source": "B", "target": "C"},
            {"id": "e3", "source": "C", "target": "A"},  # Cycle: A → B → C → A
        ]
        
        response = client.post(
            "/api/v1/unity-dialogues/graph/validate",
            json={"nodes": nodes, "edges": edges}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Vérifier qu'il y a un warning de cycle
        cycle_warnings = [w for w in data["warnings"] if w["type"] == "cycle_detected"]
        assert len(cycle_warnings) >= 1
        
        warning = cycle_warnings[0]
        # Vérifier que les champs cycle_* sont présents
        assert "cycle_path" in warning
        assert "cycle_nodes" in warning
        assert "cycle_id" in warning
        assert warning["cycle_path"] is not None
        assert warning["cycle_nodes"] is not None
        assert len(warning["cycle_nodes"]) > 0
        assert warning["cycle_id"] is not None
        assert warning["cycle_id"].startswith("cycle_")
    
    def test_validate_graph_with_multiple_cycles_returns_all_paths(self):
        """Test: Validation retourne tous les cycles avec leurs chemins."""
        nodes = [
            {"id": "START", "type": "startNode", "data": {"label": "Start"}},
            {
                "id": "A",
                "type": "dialogueNode",
                "data": {"id": "A", "label": "Node A", "line": "Hello"},
            },
            {
                "id": "B",
                "type": "dialogueNode",
                "data": {"id": "B", "label": "Node B", "line": "World"},
            },
            {
                "id": "C",
                "type": "dialogueNode",
                "data": {"id": "C", "label": "Node C", "line": "Test1"},
            },
            {
                "id": "D",
                "type": "dialogueNode",
                "data": {"id": "D", "label": "Node D", "line": "Test2"},
            },
        ]
        edges = [
            {"id": "e0", "source": "START", "target": "A"},
            {"id": "e1", "source": "A", "target": "B"},
            {"id": "e2", "source": "B", "target": "A"},  # Cycle 1: A → B → A
            {"id": "e3", "source": "C", "target": "D"},
            {"id": "e4", "source": "D", "target": "C"},  # Cycle 2: C → D → C
        ]
        
        response = client.post(
            "/api/v1/unity-dialogues/graph/validate",
            json={"nodes": nodes, "edges": edges}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        cycle_warnings = [w for w in data["warnings"] if w["type"] == "cycle_detected"]
        assert len(cycle_warnings) >= 2
        
        # Vérifier que chaque cycle a un ID unique
        cycle_ids = [w["cycle_id"] for w in cycle_warnings]
        assert len(set(cycle_ids)) >= 2
        
        # Vérifier que chaque cycle a un chemin
        for warning in cycle_warnings:
            assert "cycle_path" in warning
            assert "cycle_nodes" in warning
            assert "cycle_id" in warning
            assert warning["cycle_path"] is not None
            assert warning["cycle_nodes"] is not None
            assert len(warning["cycle_nodes"]) > 0
    
    def test_validate_graph_without_cycles_no_cycle_fields(self):
        """Test: Graphe sans cycles ne retourne pas de champs cycle_*."""
        nodes = [
            {"id": "START", "type": "startNode", "data": {"label": "Start"}},
            {
                "id": "A",
                "type": "dialogueNode",
                "data": {"id": "A", "label": "Node A", "line": "Hello"},
            },
            {
                "id": "B",
                "type": "dialogueNode",
                "data": {"id": "B", "label": "Node B", "line": "World"},
            },
            {
                "id": "C",
                "type": "dialogueNode",
                "data": {"id": "C", "label": "Node C", "line": "Test"},
            },
        ]
        edges = [
            {"id": "e0", "source": "START", "target": "A"},
            {"id": "e1", "source": "A", "target": "B"},
            {"id": "e2", "source": "B", "target": "C"},
            # Pas de cycle
        ]
        
        response = client.post(
            "/api/v1/unity-dialogues/graph/validate",
            json={"nodes": nodes, "edges": edges}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Vérifier qu'il n'y a pas de warnings de cycle
        cycle_warnings = [w for w in data["warnings"] if w["type"] == "cycle_detected"]
        assert len(cycle_warnings) == 0
        
        # Vérifier que les autres warnings n'ont pas de champs cycle_* (ou sont None)
        for warning in data["warnings"]:
            if warning["type"] != "cycle_detected":
                # Les champs cycle_* peuvent être absents ou None
                if "cycle_path" in warning:
                    assert warning["cycle_path"] is None
                if "cycle_nodes" in warning:
                    assert warning["cycle_nodes"] is None
                if "cycle_id" in warning:
                    assert warning["cycle_id"] is None


class TestSimulateFlowEndpoint:
    """Tests pour POST /api/v1/unity-dialogues/graph/simulate-flow (FR46 / Story 4.11)."""

    _START = {"id": "START", "type": "startNode", "data": {}}
    _END = {"id": "END", "type": "endNode", "data": {}}

    def _node(self, nid: str) -> dict:
        return {"id": nid, "type": "dialogueNode", "data": {"id": nid}}

    def test_unreachable_node_is_reported_as_dead_end(self):
        """Nœud inatteignable → dead_end_node error dans la réponse HTTP 200."""
        nodes = [self._START, self._node("A"), self._node("B")]
        edges = [{"id": "e1", "source": "START", "target": "A"}]

        response = client.post(
            "/api/v1/unity-dialogues/graph/simulate-flow",
            json={"nodes": nodes, "edges": edges},
        )

        assert response.status_code == 200
        data = response.json()
        dead_end_ids = {e["node_id"] for e in data["dead_ends"]}
        assert "B" in dead_end_ids
        assert "A" not in dead_end_ids

    def test_reachable_node_all_edges_to_end_is_cul_de_sac(self):
        """Nœud atteignable dont toutes les sorties vont vers END → cul_de_sac_node warning."""
        nodes = [self._START, self._END, self._node("A")]
        edges = [
            {"id": "e1", "source": "START", "target": "A"},
            {"id": "e2", "source": "A", "target": "END"},
        ]

        response = client.post(
            "/api/v1/unity-dialogues/graph/simulate-flow",
            json={"nodes": nodes, "edges": edges},
        )

        assert response.status_code == 200
        data = response.json()
        cul_de_sac_ids = {w["node_id"] for w in data["cul_de_sacs"]}
        assert "A" in cul_de_sac_ids

    def test_valid_graph_returns_empty_lists(self):
        """Graphe sans dead end ni cul-de-sac → listes vides, HTTP 200.

        A et B forment un cycle : tous deux atteignables et avec des sorties non-END.
        """
        nodes = [self._START, self._node("A"), self._node("B")]
        edges = [
            {"id": "e1", "source": "START", "target": "A"},
            {"id": "e2", "source": "A", "target": "B"},
            {"id": "e3", "source": "B", "target": "A"},  # cycle intentionnel, pas de cul-de-sac
        ]

        response = client.post(
            "/api/v1/unity-dialogues/graph/simulate-flow",
            json={"nodes": nodes, "edges": edges},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["dead_ends"] == []
        assert data["cul_de_sacs"] == []

    def test_multiple_dead_ends_all_returned(self):
        """Plusieurs dead ends → tous retournés dans la réponse."""
        nodes = [self._START, self._node("A"), self._node("B"), self._node("C")]
        edges = [{"id": "e1", "source": "START", "target": "A"}]

        response = client.post(
            "/api/v1/unity-dialogues/graph/simulate-flow",
            json={"nodes": nodes, "edges": edges},
        )

        assert response.status_code == 200
        data = response.json()
        dead_end_ids = {e["node_id"] for e in data["dead_ends"]}
        assert {"B", "C"} == dead_end_ids

    def test_dead_end_items_have_correct_fields(self):
        """Items dead_end_node ont type, node_id, severity=error et message."""
        nodes = [self._START, self._node("A"), self._node("B")]
        edges = [{"id": "e1", "source": "START", "target": "A"}]

        response = client.post(
            "/api/v1/unity-dialogues/graph/simulate-flow",
            json={"nodes": nodes, "edges": edges},
        )

        data = response.json()
        dead_end = next(e for e in data["dead_ends"] if e["node_id"] == "B")
        assert dead_end["type"] == "dead_end_node"
        assert dead_end["severity"] == "error"
        assert "B" in dead_end["message"]

    def test_cul_de_sac_items_have_correct_fields(self):
        """Items cul_de_sac_node ont type, node_id, severity=warning et message."""
        nodes = [self._START, self._END, self._node("A")]
        edges = [
            {"id": "e1", "source": "START", "target": "A"},
            {"id": "e2", "source": "A", "target": "END"},
        ]

        response = client.post(
            "/api/v1/unity-dialogues/graph/simulate-flow",
            json={"nodes": nodes, "edges": edges},
        )

        data = response.json()
        cul_de_sac = next(w for w in data["cul_de_sacs"] if w["node_id"] == "A")
        assert cul_de_sac["type"] == "cul_de_sac_node"
        assert cul_de_sac["severity"] == "warning"
        assert "A" in cul_de_sac["message"]

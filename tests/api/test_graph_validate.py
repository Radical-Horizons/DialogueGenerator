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

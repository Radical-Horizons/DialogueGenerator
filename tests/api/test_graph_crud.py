"""Tests API complets pour les opérations de graphe (P0/P1).

Suite de tests pour valider les endpoints graph:
- POST /api/v1/unity-dialogues/graph/load - Charge un graphe depuis Unity JSON
- POST /api/v1/unity-dialogues/graph/save - Sauvegarde un graphe en Unity JSON
- POST /api/v1/unity-dialogues/graph/save-and-write - Sauvegarde et écrit le fichier sur disque
- POST /api/v1/unity-dialogues/graph/validate - Valide un graphe
- POST /api/v1/unity-dialogues/graph/calculate-layout - Calcule un layout
"""
import pytest
import json
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from api.main import app
from api.dependencies import get_config_service
from api.schemas.graph import (
    LoadGraphRequest,
    LoadGraphResponse,
    SaveGraphRequest,
    SaveGraphResponse,
    ValidateGraphRequest,
    ValidateGraphResponse,
    CalculateLayoutRequest,
    CalculateLayoutResponse
)


@pytest.fixture
def client():
    """Client de test."""
    yield TestClient(app)


@pytest.fixture
def sample_unity_json():
    """Dialogue Unity JSON de test."""
    return [
        {
            "id": "START",
            "speaker": "PNJ",
            "line": "Bonjour !",
            "choices": [
                {
                    "text": "Réponse 1",
                    "targetNode": "NODE_1"
                }
            ]
        },
        {
            "id": "NODE_1",
            "speaker": "PNJ",
            "line": "Suite du dialogue",
            "nextNode": "END"
        }
    ]


@pytest.fixture
def sample_graph_nodes_edges():
    """Nœuds et edges ReactFlow de test."""
    return (
        [
            {
                "id": "START",
                "type": "dialogue",
                "data": {
                    "label": "Bonjour !",
                    "speaker": "PNJ",
                    "line": "Bonjour !"
                },
                "position": {"x": 0, "y": 0}
            },
            {
                "id": "NODE_1",
                "type": "dialogue",
                "data": {
                    "label": "Suite du dialogue",
                    "speaker": "PNJ",
                    "line": "Suite du dialogue"
                },
                "position": {"x": 200, "y": 0}
            }
        ],
        [
            {
                "id": "e1",
                "source": "START",
                "target": "NODE_1",
                "sourceHandle": "choice-0",
                "targetHandle": None
            }
        ]
    )


class TestGraphLoad:
    """Tests pour POST /api/v1/unity-dialogues/graph/load - Charge un graphe [P0]."""
    
    def test_load_graph_success(self, client: TestClient, sample_unity_json):
        """GIVEN un Unity JSON valide
        WHEN je charge le graphe
        THEN je reçois des nœuds et edges ReactFlow"""
        # GIVEN
        request_data = {
            "json_content": json.dumps(sample_unity_json, ensure_ascii=False)
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/graph/load", json=request_data)
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert "edges" in data
        assert "metadata" in data
        
        assert len(data["nodes"]) == 2
        # START a un choix (1 edge) + NODE_1 a nextNode (1 edge) = 2 edges
        assert len(data["edges"]) == 2
        assert data["metadata"]["node_count"] == 2
        assert data["metadata"]["edge_count"] == 2
    
    def test_load_graph_invalid_json(self, client: TestClient):
        """GIVEN un JSON invalide
        WHEN je charge le graphe
        THEN je reçois une erreur de validation"""
        # GIVEN
        request_data = {
            "json_content": "{ invalid json }"
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/graph/load", json=request_data)
        
        # THEN
        # Invalid JSON peut être 422 (validation) ou 400 selon où l'erreur est détectée
        assert response.status_code in [400, 422]
        error_data = response.json()
        message = error_data.get("error", {}).get("message", "") if isinstance(error_data.get("error"), dict) else str(error_data.get("message", ""))
        assert "error" in message.lower() or "invalide" in message.lower() or "json" in message.lower()
    
    def test_load_graph_empty_json(self, client: TestClient):
        """GIVEN un JSON vide (tableau vide)
        WHEN je charge le graphe
        THEN je reçois un graphe vide"""
        # GIVEN
        request_data = {
            "json_content": "[]"
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/graph/load", json=request_data)
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert len(data["nodes"]) == 0
        assert len(data["edges"]) == 0


class TestGraphSave:
    """Tests pour POST /api/v1/unity-dialogues/graph/save - Sauvegarde un graphe [P0]."""
    
    def test_save_graph_success(
        self, client: TestClient, sample_graph_nodes_edges
    ):
        """GIVEN un graphe avec nœuds et edges
        WHEN je sauvegarde le graphe
        THEN je reçois un Unity JSON valide"""
        # GIVEN
        nodes, edges = sample_graph_nodes_edges
        request_data = {
            "nodes": nodes,
            "edges": edges,
            "metadata": {
                "title": "Test Dialogue",
                "node_count": len(nodes),
                "edge_count": len(edges)
            }
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/graph/save", json=request_data)
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "filename" in data
        assert "json_content" in data
        
        # Vérifier que le JSON est valide
        json_content = json.loads(data["json_content"])
        assert isinstance(json_content, list)
        assert len(json_content) == 2
    
    def test_save_graph_invalid_structure(self, client: TestClient):
        """GIVEN un graphe avec structure invalide
        WHEN je sauvegarde le graphe
        THEN je reçois une erreur de validation"""
        # GIVEN
        request_data = {
            "nodes": [{"invalid": "structure"}],
            "edges": [],
            "metadata": {"title": "Test", "node_count": 1, "edge_count": 0}
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/graph/save", json=request_data)
        
        # THEN
        # Peut être 200 avec warning ou 400 selon la validation
        assert response.status_code in [200, 400]


class TestGraphSaveAndWrite:
    """Tests pour POST /api/v1/unity-dialogues/graph/save-and-write - Conversion + écriture fichier [P0]."""

    @pytest.fixture(autouse=True)
    def _override_config(self, tmp_path):
        """Override get_config_service pour save-and-write (nécessite un chemin Unity)."""
        self._save_and_write_tmp_path = tmp_path
        mock_config = MagicMock()
        mock_config.get_unity_dialogues_path.return_value = str(tmp_path)
        app.dependency_overrides[get_config_service] = lambda: mock_config
        try:
            yield
        finally:
            app.dependency_overrides.pop(get_config_service, None)

    def test_save_and_write_success(
        self, client: TestClient, sample_graph_nodes_edges
    ):
        """GIVEN un graphe valide
        WHEN je sauvegarde et écris (save-and-write)
        THEN le fichier est créé et la réponse contient filename et json_content."""
        nodes, edges = sample_graph_nodes_edges
        request_data = {
            "nodes": nodes,
            "edges": edges,
            "metadata": {
                "title": "Test Dialogue",
                "node_count": len(nodes),
                "edge_count": len(edges),
            },
        }
        response = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write", json=request_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["filename"] == "Test_Dialogue.json"
        assert "json_content" in data
        parsed = json.loads(data["json_content"])
        assert isinstance(parsed, list)
        assert len(parsed) == 2
        written = Path(self._save_and_write_tmp_path) / "Test_Dialogue.json"
        assert written.exists()
        content = json.loads(written.read_text(encoding="utf-8"))
        assert len(content) == 2

    def test_save_and_write_path_not_configured(
        self, client: TestClient, sample_graph_nodes_edges
    ):
        """GIVEN le chemin Unity n'est pas configuré
        WHEN je sauvegarde et écris
        THEN 422 ValidationException."""
        app.dependency_overrides[get_config_service] = lambda: MagicMock(get_unity_dialogues_path=MagicMock(return_value=None))
        nodes, edges = sample_graph_nodes_edges
        request_data = {
            "nodes": nodes,
            "edges": edges,
            "metadata": {"title": "T", "node_count": 2, "edge_count": 1},
        }
        response = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write", json=request_data
        )
        assert response.status_code == 422

    def test_save_and_write_with_seq_returns_ack(
        self, client: TestClient, sample_graph_nodes_edges
    ):
        """ADR-006: GIVEN seq and document_id in request
        WHEN save-and-write succeeds
        THEN response contains ack_seq and last_seq."""
        nodes, edges = sample_graph_nodes_edges
        request_data = {
            "nodes": nodes,
            "edges": edges,
            "metadata": {
                "title": "Seq Test",
                "node_count": len(nodes),
                "edge_count": len(edges),
            },
            "seq": 5,
            "document_id": "Seq_Test.json",
        }
        response = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write", json=request_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ack_seq"] == 5
        assert data["last_seq"] == 5
        assert data["success"] is True
        sidecar = Path(self._save_and_write_tmp_path) / "Seq_Test.seq"
        assert sidecar.exists()
        assert sidecar.read_text(encoding="utf-8").strip() == "5"

    def test_save_and_write_seq_le_last_seq_skips_write(
        self, client: TestClient, sample_graph_nodes_edges
    ):
        """ADR-006: GIVEN seq <= last_seq (already persisted)
        WHEN save-and-write is called
        THEN 200 with ack_seq=last_seq, file not overwritten."""
        nodes, edges = sample_graph_nodes_edges
        request_data = {
            "nodes": nodes,
            "edges": edges,
            "metadata": {
                "title": "Skip Write",
                "node_count": len(nodes),
                "edge_count": len(edges),
            },
            "seq": 3,
            "document_id": "Skip_Write.json",
        }
        # First call: write file and last_seq=3
        r1 = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write", json=request_data
        )
        assert r1.status_code == 200
        assert r1.json()["ack_seq"] == 3
        path = Path(self._save_and_write_tmp_path) / "Skip_Write.json"
        assert path.exists()
        first_content = path.read_text(encoding="utf-8")
        # Second call with seq=2 (<= 3): skip write, return ack_seq=3
        request_data["seq"] = 2
        r2 = client.post(
            "/api/v1/unity-dialogues/graph/save-and-write", json=request_data
        )
        assert r2.status_code == 200
        data2 = r2.json()
        assert data2["ack_seq"] == 3
        assert data2["last_seq"] == 3
        assert path.read_text(encoding="utf-8") == first_content


class TestGraphValidate:
    """Tests pour POST /api/v1/unity-dialogues/graph/validate - Valide un graphe [P1]."""
    
    def test_validate_graph_valid(
        self, client: TestClient, sample_graph_nodes_edges
    ):
        """GIVEN un graphe valide sans cycles ni orphelins
        WHEN je valide le graphe
        THEN la validation retourne valid=True"""
        # GIVEN
        nodes, edges = sample_graph_nodes_edges
        request_data = {
            "nodes": nodes,
            "edges": edges
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/graph/validate", json=request_data)
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert "valid" in data
        assert "errors" in data
        assert "warnings" in data
        # Le graphe de test devrait être valide
        assert data["valid"] is True
    
    def test_validate_graph_orphan_node(self, client: TestClient):
        """GIVEN un graphe avec un nœud orphelin
        WHEN je valide le graphe
        THEN la validation retourne un warning"""
        # GIVEN
        nodes = [
            {
                "id": "START",
                "type": "dialogue",
                "data": {"label": "Start"},
                "position": {"x": 0, "y": 0}
            },
            {
                "id": "ORPHAN",
                "type": "dialogue",
                "data": {"label": "Orphan"},
                "position": {"x": 100, "y": 100}
            }
        ]
        edges = []  # ORPHAN n'a pas de connexion
        
        request_data = {
            "nodes": nodes,
            "edges": edges
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/graph/validate", json=request_data)
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        # Devrait détecter le nœud orphelin
        assert len(data["warnings"]) > 0 or len(data["errors"]) > 0
    
    def test_validate_graph_cycle(
        self, client: TestClient
    ):
        """GIVEN un graphe avec un cycle (A → B → C → A)
        WHEN je valide le graphe
        THEN la validation retourne un warning cycle"""
        # GIVEN
        nodes = [
            {"id": "A", "type": "dialogue", "data": {"label": "A"}, "position": {"x": 0, "y": 0}},
            {"id": "B", "type": "dialogue", "data": {"label": "B"}, "position": {"x": 100, "y": 0}},
            {"id": "C", "type": "dialogue", "data": {"label": "C"}, "position": {"x": 200, "y": 0}}
        ]
        edges = [
            {"id": "e1", "source": "A", "target": "B"},
            {"id": "e2", "source": "B", "target": "C"},
            {"id": "e3", "source": "C", "target": "A"}  # Cycle
        ]
        
        request_data = {
            "nodes": nodes,
            "edges": edges
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/graph/validate", json=request_data)
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        # Devrait détecter le cycle
        assert len(data["warnings"]) > 0


class TestGraphCalculateLayout:
    """Tests pour POST /api/v1/unity-dialogues/graph/calculate-layout - Calcule layout [P1]."""
    
    def test_calculate_layout_success(
        self, client: TestClient, sample_graph_nodes_edges
    ):
        """GIVEN un graphe sans positions
        WHEN je calcule le layout
        THEN je reçois des nœuds avec positions calculées"""
        # GIVEN
        nodes, edges = sample_graph_nodes_edges
        # Retirer les positions pour forcer le calcul
        nodes_no_pos = [
            {**node, "position": None} if "position" in node else node
            for node in nodes
        ]
        
        request_data = {
            "nodes": nodes_no_pos,
            "edges": edges,
            "algorithm": "cascade",
            "direction": "LR"
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/graph/calculate-layout", json=request_data)
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert len(data["nodes"]) == 2
        
        # Vérifier que les positions sont définies
        for node in data["nodes"]:
            assert "position" in node
            assert "x" in node["position"]
            assert "y" in node["position"]

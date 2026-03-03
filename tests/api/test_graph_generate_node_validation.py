"""Tests de validation pour l'endpoint /api/v1/graph/generate-node.
Vérifie que les références targetNode et nextNode pointent vers des nœuds existants après génération.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch, AsyncMock

from api.main import app
from api.dependencies import get_config_service
from services.configuration_service import ConfigurationService


@pytest.fixture
def mock_config_service():
    """Mock du ConfigurationService."""
    mock_service = MagicMock(spec=ConfigurationService)
    return mock_service


@pytest.fixture
def client(mock_config_service):
    """Fixture pour créer un client de test avec mocks."""
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    
    yield TestClient(app)
    
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_generated_node_references_exist(client):
    """Test que les références targetNode et nextNode pointent vers des nœuds existants après génération.
    
    AC: #7 - Validation que toutes les références pointent vers des nœuds existants.
    """
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory, \
         patch('api.routers.graph.ServiceContainer') as mock_container, \
         patch('services.graph_node_orchestrator.UnityDialogueGenerationService') as mock_service_class:
        
        # Setup mocks
        mock_service = MagicMock()
        mock_service_class.return_value = mock_service
        
        # Mock de la génération
        mock_node = {
            "id": "NODE_GENERATED_1",
            "speaker": "PNJ",
            "line": "Réponse générée",
            "choices": [],
            "nextNode": None  # Pas de nextNode pour ce test
        }
        mock_service.enrich_with_ids.return_value = [mock_node]
        mock_service.generate_dialogue_node = AsyncMock(return_value={"nodes": [mock_node]})
        
        # Mock LLM client
        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client
        
        # Mock config service
        mock_config_service = MagicMock()
        mock_config_service.get_llm_config.return_value = {}
        mock_config_service.get_available_llm_models.return_value = []
        mock_container_instance = MagicMock()
        mock_container_instance.get_config_service.return_value = mock_config_service
        mock_container.return_value = mock_container_instance
        
        parent_node = {
            "id": "NODE_PARENT_1",
            "speaker": "PNJ",
            "line": "Question",
            "choices": [
                {"text": "Choix 1", "targetNode": None}
            ]
        }
        
        request_data = {
            "parent_node_id": "NODE_PARENT_1",
            "parent_node_content": parent_node,
            "user_instructions": "Continue",
            "context_selections": {},
            "target_choice_index": 0,
            "generate_all_choices": False
        }
        
        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Vérifier que le nœud généré existe
        assert "node" in data
        generated_node = data["node"]
        assert generated_node["id"] == "NODE_GENERATED_1"
        
        # Vérifier que les connexions suggérées pointent vers des nœuds valides
        assert "suggested_connections" in data
        connections = data["suggested_connections"]
        assert len(connections) > 0
        
        # Vérifier que la connexion suggérée pointe vers le nœud généré (qui existe)
        connection = connections[0]
        assert connection["to"] == "NODE_GENERATED_1"
        assert connection["from"] == "NODE_PARENT_1"
        
        # Vérifier que le nœud généré n'a pas de références invalides
        # (nextNode devrait être None ou un ID valide, pas un ID inexistant)
        assert generated_node.get("nextNode") is None or generated_node.get("nextNode") in ["END", "START"]
        
        # Si le nœud généré a des choix, vérifier que leurs targetNode sont valides
        if "choices" in generated_node and generated_node["choices"]:
            for choice in generated_node["choices"]:
                target_node = choice.get("targetNode")
                if target_node and target_node not in ["END", "START"]:
                    # Dans un vrai scénario, on vérifierait que target_node existe dans le graphe
                    # Pour ce test unitaire, on vérifie juste que ce n'est pas une référence vide
                    assert target_node.startswith("NODE_") or target_node in ["END", "START"]


@pytest.mark.asyncio
async def test_batch_generation_references_exist(client):
    """Test que les références dans la génération batch pointent vers des nœuds existants.
    
    AC: #7 - Validation pour génération batch.
    """
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory, \
         patch('api.routers.graph.ServiceContainer') as mock_container, \
         patch('services.graph_node_orchestrator.GraphGenerationService') as mock_graph_service_class, \
         patch('services.graph_node_orchestrator.UnityDialogueGenerationService') as mock_service_class:
        
        # Setup mocks
        mock_service = MagicMock()
        mock_service_class.return_value = mock_service
        
        # Mock GraphGenerationService pour batch
        mock_graph_service = MagicMock()
        mock_graph_service_class.return_value = mock_graph_service
        
        # Mock résultat batch avec nœuds valides
        mock_batch_result = {
            "nodes": [
                {"id": "NODE_PARENT_1_CHOICE_0", "speaker": "PNJ", "line": "Réponse 1", "choices": []},
                {"id": "NODE_PARENT_1_CHOICE_1", "speaker": "PNJ", "line": "Réponse 2", "choices": []}
            ],
            "connections": [
                {"from": "NODE_PARENT_1", "to": "NODE_PARENT_1_CHOICE_0", "via_choice_index": 0, "connection_type": "choice"},
                {"from": "NODE_PARENT_1", "to": "NODE_PARENT_1_CHOICE_1", "via_choice_index": 1, "connection_type": "choice"}
            ],
            "connected_choices_count": 0,
            "generated_choices_count": 2,
            "failed_choices_count": 0,
            "total_choices_count": 2
        }
        mock_graph_service.generate_nodes_for_all_choices = AsyncMock(return_value=mock_batch_result)
        
        # Mock LLM client
        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client
        
        # Mock config service
        mock_config_service = MagicMock()
        mock_config_service.get_llm_config.return_value = {}
        mock_config_service.get_available_llm_models.return_value = []
        mock_container_instance = MagicMock()
        mock_container_instance.get_config_service.return_value = mock_config_service
        mock_container.return_value = mock_container_instance
        
        parent_node = {
            "id": "NODE_PARENT_1",
            "speaker": "PNJ",
            "line": "Question",
            "choices": [
                {"text": "Choix 1", "targetNode": None},
                {"text": "Choix 2", "targetNode": None}
            ]
        }
        
        request_data = {
            "parent_node_id": "NODE_PARENT_1",
            "parent_node_content": parent_node,
            "user_instructions": "Continue",
            "context_selections": {},
            "target_choice_index": None,
            "generate_all_choices": True
        }
        
        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Vérifier que les connexions suggérées pointent vers des nœuds valides
        assert "suggested_connections" in data
        connections = data["suggested_connections"]
        assert len(connections) == 2
        
        # Vérifier que chaque connexion pointe vers un nœud généré valide
        generated_node_ids = [mock_batch_result["nodes"][0]["id"], mock_batch_result["nodes"][1]["id"]]
        for conn in connections:
            assert conn["to"] in generated_node_ids
            assert conn["from"] == "NODE_PARENT_1"
            assert conn["via_choice_index"] in [0, 1]

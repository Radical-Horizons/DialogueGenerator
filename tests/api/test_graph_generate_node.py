"""Tests pour l'endpoint /api/v1/graph/generate-node."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch, AsyncMock

from api.main import app
from api.dependencies import get_config_service, get_graph_node_orchestrator
from services.configuration_service import ConfigurationService
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.unity_dialogue_generation_service import UnityDialogueGenerationService


@pytest.fixture
def mock_config_service():
    """Mock du ConfigurationService."""
    mock_service = MagicMock(spec=ConfigurationService)
    mock_service.get_llm_config.return_value = {}
    mock_service.get_available_llm_models.return_value = []
    return mock_service


@pytest.fixture
def mock_generation_service():
    """Mock du UnityDialogueGenerationService."""
    return MagicMock(spec=UnityDialogueGenerationService)


@pytest.fixture
def mock_orchestrator(mock_generation_service):
    """GraphNodeOrchestrator réel avec generation_service mocké."""
    return GraphNodeOrchestrator(generation_service=mock_generation_service)


@pytest.fixture
def client(mock_config_service, mock_orchestrator):
    """Fixture pour créer un client de test avec mocks via dependency_overrides."""
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    app.dependency_overrides[get_graph_node_orchestrator] = lambda: mock_orchestrator

    yield TestClient(app)

    app.dependency_overrides.clear()


@pytest.fixture
def sample_parent_node_with_choices():
    """Nœud parent avec choix pour les tests."""
    return {
        "id": "NODE_PARENT_1",
        "speaker": "PNJ",
        "line": "Bonjour, comment allez-vous ?",
        "choices": [
            {"text": "Je vais bien", "targetNode": None},
            {"text": "Pas très bien", "targetNode": None},
            {"text": "Je ne sais pas", "targetNode": "END"}
        ]
    }


@pytest.fixture
def sample_parent_node_without_choices():
    """Nœud parent sans choix (navigation linéaire)."""
    return {
        "id": "NODE_PARENT_2",
        "speaker": "PNJ",
        "line": "Voici une information importante.",
        "nextNode": None
    }


@pytest.mark.asyncio
async def test_generate_node_with_target_choice_index(
    client, mock_generation_service, sample_parent_node_with_choices
):
    """Test génération nœud pour choix spécifique (target_choice_index).
    
    AC: #1 - Génération pour choix spécifique depuis éditeur de graphe.
    """
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory:
        mock_node = {
            "id": "NODE_PARENT_1_CHOICE_0",
            "speaker": "PNJ",
            "line": "Je suis content de l'entendre !",
            "choices": []
        }
        mock_generation_service.enrich_with_ids.return_value = [mock_node]
        mock_generation_service.generate_dialogue_node = AsyncMock(return_value={"nodes": [mock_node]})

        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client

        request_data = {
            "parent_node_id": "NODE_PARENT_1",
            "parent_node_content": sample_parent_node_with_choices,
            "user_instructions": "Continue la conversation",
            "context_selections": {},
            "target_choice_index": 0,
            "generate_all_choices": False
        }

        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)

        assert response.status_code == 200
        data = response.json()
        assert "node" in data
        assert data["node"]["id"] == "NODE_PARENT_1_CHOICE_0"
        assert "suggested_connections" in data
        assert len(data["suggested_connections"]) > 0
        assert data["suggested_connections"][0]["via_choice_index"] == 0


@pytest.mark.asyncio
async def test_generate_node_with_generate_all_choices(
    client, mock_generation_service, sample_parent_node_with_choices
):
    """Test génération batch pour tous les choix (generate_all_choices=True).
    
    AC: #3 - Génération batch pour tous les choix depuis éditeur de graphe.
    """
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory, \
         patch('services.graph_node_orchestrator.GraphGenerationService') as mock_graph_service_class:

        mock_graph_service = MagicMock()
        mock_graph_service_class.return_value = mock_graph_service

        mock_batch_result = {
            "nodes": [
                {"id": "NODE_PARENT_1_CHOICE_0", "speaker": "PNJ", "line": "Réponse 1", "choices": []},
                {"id": "NODE_PARENT_1_CHOICE_1", "speaker": "PNJ", "line": "Réponse 2", "choices": []}
            ],
            "connections": [
                {"from": "NODE_PARENT_1", "to": "NODE_PARENT_1_CHOICE_0", "via_choice_index": 0, "connection_type": "choice"},
                {"from": "NODE_PARENT_1", "to": "NODE_PARENT_1_CHOICE_1", "via_choice_index": 1, "connection_type": "choice"}
            ],
            "connected_choices_count": 1,
            "generated_choices_count": 2,
            "failed_choices_count": 0,
            "total_choices_count": 3
        }
        mock_graph_service.generate_nodes_for_all_choices = AsyncMock(return_value=mock_batch_result)

        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client

        request_data = {
            "parent_node_id": "NODE_PARENT_1",
            "parent_node_content": sample_parent_node_with_choices,
            "user_instructions": "Continue la conversation",
            "context_selections": {},
            "target_choice_index": None,
            "generate_all_choices": True
        }

        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)

        assert response.status_code == 200
        data = response.json()
        mock_graph_service.generate_nodes_for_all_choices.assert_called_once()
        assert "nodes" in data
        assert len(data["nodes"]) == 2
        assert data["nodes"][0]["id"] == "NODE_PARENT_1_CHOICE_0"
        assert data["nodes"][1]["id"] == "NODE_PARENT_1_CHOICE_1"
        assert "node" in data
        assert data["node"]["id"] == "NODE_PARENT_1_CHOICE_0"
        assert "batch_count" in data
        assert data["batch_count"] == 2
        assert "generated_choices_count" in data
        assert data["generated_choices_count"] == 2
        assert "connected_choices_count" in data
        assert data["connected_choices_count"] == 1
        assert "failed_choices_count" in data
        assert data["failed_choices_count"] == 0
        assert "total_choices_count" in data
        assert data["total_choices_count"] == 3
        assert len(data["suggested_connections"]) == 2


@pytest.mark.asyncio
async def test_generate_node_nextnode_linear(
    client, mock_generation_service, sample_parent_node_without_choices
):
    """Test génération nextNode pour navigation linéaire.
    
    AC: #5 - Génération nextNode depuis éditeur de graphe.
    """
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory:
        mock_node = {
            "id": "NODE_PARENT_2_CHILD",
            "speaker": "PNJ",
            "line": "Suite de la conversation",
            "nextNode": None
        }
        mock_generation_service.enrich_with_ids.return_value = [mock_node]
        mock_generation_service.generate_dialogue_node = AsyncMock(return_value={"nodes": [mock_node]})

        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client

        request_data = {
            "parent_node_id": "NODE_PARENT_2",
            "parent_node_content": sample_parent_node_without_choices,
            "user_instructions": "Continue la conversation",
            "context_selections": {},
            "target_choice_index": None,
            "generate_all_choices": False
        }

        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)

        assert response.status_code == 200
        data = response.json()
        assert "node" in data
        assert "suggested_connections" in data
        assert len(data["suggested_connections"]) > 0
        assert data["suggested_connections"][0]["connection_type"] == "nextNode"


@pytest.mark.asyncio
async def test_generate_node_id_normalization_no_double_prefix(
    client, mock_generation_service, sample_parent_node_with_choices
):
    """Test que la normalisation des IDs évite les doubles préfixes NODE_.
    
    Si parent_node_id est déjà "NODE_XXX", on ne doit pas générer "NODE_NODE_XXX_CHOICE_0".
    """
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory:
        parent_with_prefix = {
            "id": "NODE_ALREADY_PREFIXED",
            "speaker": "PNJ",
            "line": "Test",
            "choices": [{"text": "Choix 1", "targetNode": None}]
        }

        mock_node = {
            "id": "NODE_ALREADY_PREFIXED_CHOICE_0",
            "speaker": "PNJ",
            "line": "Réponse",
            "choices": []
        }
        mock_generation_service.enrich_with_ids.return_value = [mock_node]
        mock_generation_service.generate_dialogue_node = AsyncMock(return_value={"nodes": [mock_node]})

        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client

        request_data = {
            "parent_node_id": "NODE_ALREADY_PREFIXED",
            "parent_node_content": parent_with_prefix,
            "user_instructions": "Test",
            "context_selections": {},
            "target_choice_index": 0,
            "generate_all_choices": False
        }

        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)

        assert response.status_code == 200
        data = response.json()
        assert data["node"]["id"] == "NODE_ALREADY_PREFIXED_CHOICE_0"
        assert not data["node"]["id"].startswith("NODE_NODE_")


@pytest.mark.asyncio
async def test_generate_node_id_normalization_adds_prefix(
    client, mock_generation_service, sample_parent_node_with_choices
):
    """Test que la normalisation ajoute le préfixe NODE_ si absent.
    
    Si parent_node_id est "XXX" (sans préfixe), on doit générer "NODE_XXX_CHOICE_0".
    """
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory:
        parent_no_prefix = {
            "id": "PARENT_NO_PREFIX",
            "speaker": "PNJ",
            "line": "Test",
            "choices": [{"text": "Choix 1", "targetNode": None}]
        }

        mock_node = {
            "id": "NODE_PARENT_NO_PREFIX_CHOICE_0",
            "speaker": "PNJ",
            "line": "Réponse",
            "choices": []
        }
        mock_generation_service.enrich_with_ids.return_value = [mock_node]
        mock_generation_service.generate_dialogue_node = AsyncMock(return_value={"nodes": [mock_node]})

        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client

        request_data = {
            "parent_node_id": "PARENT_NO_PREFIX",
            "parent_node_content": parent_no_prefix,
            "user_instructions": "Test",
            "context_selections": {},
            "target_choice_index": 0,
            "generate_all_choices": False
        }

        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)

        assert response.status_code == 200
        data = response.json()
        assert data["node"]["id"] == "NODE_PARENT_NO_PREFIX_CHOICE_0"
        assert data["node"]["id"].startswith("NODE_")


@pytest.mark.asyncio
async def test_generate_node_validation_invalid_target_choice_index(
    client, sample_parent_node_with_choices
):
    """Test que target_choice_index invalide retourne ValidationException.
    
    AC: Validation stricte de target_choice_index.
    """
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory:
        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client

        request_data = {
            "parent_node_id": "NODE_PARENT_1",
            "parent_node_content": sample_parent_node_with_choices,
            "user_instructions": "Test",
            "context_selections": {},
            "target_choice_index": 999,
            "generate_all_choices": False
        }

        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)

        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert "message" in data["error"]
        assert "Index de choix invalide" in data["error"]["message"] or "invalide" in data["error"]["message"].lower()


@pytest.mark.asyncio
async def test_generate_node_validation_target_choice_index_no_choices(
    client, sample_parent_node_without_choices
):
    """Test que target_choice_index avec un parent sans choix retourne ValidationException.
    
    AC: Validation stricte de target_choice_index.
    """
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory:
        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client

        request_data = {
            "parent_node_id": "NODE_PARENT_2",
            "parent_node_content": sample_parent_node_without_choices,
            "user_instructions": "Test",
            "context_selections": {},
            "target_choice_index": 0,
            "generate_all_choices": False
        }

        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)

        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert "message" in data["error"]
        assert "Aucun choix disponible" in data["error"]["message"]


@pytest.mark.asyncio
async def test_generate_node_validation_generate_all_choices_no_choices(
    client, sample_parent_node_without_choices
):
    """Test que generate_all_choices avec un parent sans choix retourne ValidationException."""
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory:
        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client

        request_data = {
            "parent_node_id": "NODE_PARENT_2",
            "parent_node_content": sample_parent_node_without_choices,
            "user_instructions": "Test",
            "context_selections": {},
            "target_choice_index": None,
            "generate_all_choices": True
        }

        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)

        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert "message" in data["error"]
        assert "Aucun choix disponible" in data["error"]["message"]


@pytest.mark.asyncio
async def test_generate_node_batch_returns_choice_counts(
    client, mock_generation_service, sample_parent_node_with_choices
):
    """Test que la génération batch retourne les compteurs de choix.
    
    AC: #8 - Message "X connectés / Y générés" nécessite ces compteurs.
    """
    with patch('factories.llm_factory.LLMClientFactory') as mock_factory, \
         patch('services.graph_node_orchestrator.GraphGenerationService') as mock_graph_service_class:

        mock_graph_service = MagicMock()
        mock_graph_service_class.return_value = mock_graph_service

        mock_batch_result = {
            "nodes": [
                {"id": "NODE_PARENT_1_CHOICE_0", "speaker": "PNJ", "line": "Réponse 1", "choices": []},
                {"id": "NODE_PARENT_1_CHOICE_1", "speaker": "PNJ", "line": "Réponse 2", "choices": []}
            ],
            "connections": [
                {"from": "NODE_PARENT_1", "to": "NODE_PARENT_1_CHOICE_0", "via_choice_index": 0, "connection_type": "choice"},
                {"from": "NODE_PARENT_1", "to": "NODE_PARENT_1_CHOICE_1", "via_choice_index": 1, "connection_type": "choice"}
            ],
            "connected_choices_count": 1,
            "generated_choices_count": 2,
            "failed_choices_count": 0,
            "total_choices_count": 3
        }
        mock_graph_service.generate_nodes_for_all_choices = AsyncMock(return_value=mock_batch_result)

        mock_llm_client = MagicMock()
        mock_factory.create_client.return_value = mock_llm_client

        request_data = {
            "parent_node_id": "NODE_PARENT_1",
            "parent_node_content": sample_parent_node_with_choices,
            "user_instructions": "Test",
            "context_selections": {},
            "target_choice_index": None,
            "generate_all_choices": True
        }

        response = client.post("/api/v1/unity-dialogues/graph/generate-node", json=request_data)

        assert response.status_code == 200
        data = response.json()
        assert "generated_choices_count" in data
        assert data["generated_choices_count"] == 2
        assert "connected_choices_count" in data
        assert data["connected_choices_count"] == 1
        assert "failed_choices_count" in data
        assert data["failed_choices_count"] == 0
        assert "total_choices_count" in data
        assert data["total_choices_count"] == 3

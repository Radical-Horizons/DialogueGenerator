"""Tests unitaires pour GraphGenerationService."""
import pytest
from unittest.mock import Mock, AsyncMock, MagicMock
from typing import Dict, Any, List

from services.graph_generation_service import GraphGenerationService
from services.unity_dialogue_generation_service import UnityDialogueGenerationService
from core.llm.llm_client import ILLMClient


@pytest.fixture
def mock_llm_client():
    """Mock du client LLM."""
    client = MagicMock(spec=ILLMClient)
    return client


@pytest.fixture
def mock_generation_service():
    """Mock du UnityDialogueGenerationService."""
    service = MagicMock(spec=UnityDialogueGenerationService)
    return service


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
def sample_parent_node_with_connected_choices():
    """Nœud parent avec certains choix déjà connectés."""
    return {
        "id": "NODE_PARENT_2",
        "speaker": "PNJ",
        "line": "Choisissez votre chemin",
        "choices": [
            {"text": "Chemin A", "targetNode": "NODE_EXISTING_1"},
            {"text": "Chemin B", "targetNode": None},
            {"text": "Chemin C", "targetNode": "END"}
        ]
    }


@pytest.mark.asyncio
async def test_generate_nodes_for_all_choices_basic(mock_llm_client, mock_generation_service, sample_parent_node_with_choices):
    """Test génération batch pour tous les choix sans targetNode.
    
    AC: #3 - Génération batch pour tous les choix.
    """
    service = GraphGenerationService(mock_generation_service)
    
    # Mock de la génération pour chaque choix (3 choix: 2 avec None, 1 avec "END")
    from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse, UnityDialogueNodeContent
    
    mock_nodes_content = [
        UnityDialogueNodeContent(speaker="PNJ", line="Réponse au choix 1", choices=None),
        UnityDialogueNodeContent(speaker="PNJ", line="Réponse au choix 2", choices=None),
        UnityDialogueNodeContent(speaker="PNJ", line="Réponse au choix 3", choices=None)
    ]
    
    mock_responses = [
        UnityDialogueGenerationResponse(title="Dialogue 1", node=mock_nodes_content[0]),
        UnityDialogueGenerationResponse(title="Dialogue 2", node=mock_nodes_content[1]),
        UnityDialogueGenerationResponse(title="Dialogue 3", node=mock_nodes_content[2])
    ]
    
    mock_enriched_nodes = [
        [{"id": "NODE_PARENT_1_CHOICE_0", "speaker": "PNJ", "line": "Réponse au choix 1", "choices": []}],
        [{"id": "NODE_PARENT_1_CHOICE_1", "speaker": "PNJ", "line": "Réponse au choix 2", "choices": []}],
        [{"id": "NODE_PARENT_1_CHOICE_2", "speaker": "PNJ", "line": "Réponse au choix 3", "choices": []}]
    ]
    
    # Mock generate_dialogue_node pour retourner les réponses
    mock_generation_service.generate_dialogue_node = AsyncMock(side_effect=mock_responses)
    
    # Mock enrich_with_ids pour retourner les nœuds enrichis
    mock_generation_service.enrich_with_ids.side_effect = mock_enriched_nodes
    
    instructions = "Continue la conversation"
    context = {}
    
    result = await service.generate_nodes_for_all_choices(
        parent_node=sample_parent_node_with_choices,
        instructions=instructions,
        context=context,
        llm_client=mock_llm_client,
        system_prompt_override=None,
        max_choices=None
    )
    
    # Vérifier résultat (3 choix: 2 avec None, 1 avec "END" - tous doivent être générés)
    assert "nodes" in result
    assert "connections" in result
    assert len(result["nodes"]) == 3  # 3 choix: 2 avec None, 1 avec "END"
    
    # Vérifier IDs
    assert result["nodes"][0]["id"] == "NODE_PARENT_1_CHOICE_0"
    assert result["nodes"][1]["id"] == "NODE_PARENT_1_CHOICE_1"
    assert result["nodes"][2]["id"] == "NODE_PARENT_1_CHOICE_2"
    
    # Vérifier connexions
    assert len(result["connections"]) == 3
    assert result["connections"][0]["from"] == "NODE_PARENT_1"
    assert result["connections"][0]["to"] == "NODE_PARENT_1_CHOICE_0"
    assert result["connections"][0]["via_choice_index"] == 0
    assert result["connections"][1]["via_choice_index"] == 1
    assert result["connections"][2]["via_choice_index"] == 2
    
    # Vérifier compteurs batch
    assert "connected_choices_count" in result
    assert result["connected_choices_count"] == 0  # Aucun choix connecté dans sample_parent_node_with_choices
    assert "generated_choices_count" in result
    assert result["generated_choices_count"] == 3
    assert "failed_choices_count" in result
    assert result["failed_choices_count"] == 0
    assert "total_choices_count" in result
    assert result["total_choices_count"] == 3


@pytest.mark.asyncio
async def test_generate_nodes_for_all_choices_filters_connected(mock_llm_client, mock_generation_service, 
                                                                 sample_parent_node_with_connected_choices):
    """Test filtrage des choix déjà connectés.
    
    AC: #8 - Seuls les choix sans targetNode (ou avec "END") génèrent de nouveaux nœuds.
    """
    service = GraphGenerationService(mock_generation_service)
    
    # Mock de la génération pour le seul choix sans targetNode (index 1)
    from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse, UnityDialogueNodeContent
    
    mock_node_content = UnityDialogueNodeContent(speaker="PNJ", line="Réponse au chemin B", choices=None)
    mock_response = UnityDialogueGenerationResponse(title="Dialogue chemin B", node=mock_node_content)
    
    # 2 choix à générer (index 1 avec None, index 2 avec "END")
    mock_node_content_2 = UnityDialogueNodeContent(speaker="PNJ", line="Réponse au chemin C", choices=None)
    mock_response_2 = UnityDialogueGenerationResponse(title="Dialogue chemin C", node=mock_node_content_2)
    
    mock_enriched_nodes = [
        [{"id": "NODE_PARENT_2_CHOICE_1", "speaker": "PNJ", "line": "Réponse au chemin B", "choices": []}],
        [{"id": "NODE_PARENT_2_CHOICE_2", "speaker": "PNJ", "line": "Réponse au chemin C", "choices": []}]
    ]
    
    mock_generation_service.enrich_with_ids.side_effect = mock_enriched_nodes
    mock_generation_service.generate_dialogue_node = AsyncMock(side_effect=[mock_response, mock_response_2])
    
    instructions = "Continue la conversation"
    context = {}
    
    result = await service.generate_nodes_for_all_choices(
        parent_node=sample_parent_node_with_connected_choices,
        instructions=instructions,
        context=context,
        llm_client=mock_llm_client,
        system_prompt_override=None,
        max_choices=None
    )
    
    # Vérifier que 2 nœuds ont été générés (choix index 1 avec None et choix index 2 avec "END")
    # Le choix index 0 a targetNode="NODE_EXISTING_1" donc est déjà connecté (skip)
    assert len(result["nodes"]) == 2
    assert result["nodes"][0]["id"] == "NODE_PARENT_2_CHOICE_1"
    assert result["nodes"][1]["id"] == "NODE_PARENT_2_CHOICE_2"
    
    # Vérifier que 2 connexions ont été créées
    assert len(result["connections"]) == 2
    assert result["connections"][0]["via_choice_index"] == 1
    assert result["connections"][1]["via_choice_index"] == 2
    
    # Vérifier compteurs batch (1 choix connecté, 2 générés)
    assert "connected_choices_count" in result
    assert result["connected_choices_count"] == 1  # Index 0 avec targetNode="NODE_EXISTING_1"
    assert "generated_choices_count" in result
    assert result["generated_choices_count"] == 2
    assert "failed_choices_count" in result
    assert result["failed_choices_count"] == 0
    assert "total_choices_count" in result
    assert result["total_choices_count"] == 3
    
    # Vérifier que generate_dialogue_node a été appelé 2 fois
    assert mock_generation_service.generate_dialogue_node.call_count == 2


@pytest.mark.asyncio
async def test_generate_nodes_for_all_choices_id_format(mock_llm_client, mock_generation_service, 
                                                         sample_parent_node_with_choices):
    """Test format des IDs générés.
    
    AC: #7 - Format ID: NODE_{parent_id}_CHOICE_{index}
    """
    service = GraphGenerationService(mock_generation_service)
    
    from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse, UnityDialogueNodeContent
    
    # 3 choix à générer (2 avec None, 1 avec "END")
    mock_nodes_content = [
        UnityDialogueNodeContent(speaker="PNJ", line="Réponse 1", choices=None),
        UnityDialogueNodeContent(speaker="PNJ", line="Réponse 2", choices=None),
        UnityDialogueNodeContent(speaker="PNJ", line="Réponse 3", choices=None)
    ]
    
    mock_responses = [
        UnityDialogueGenerationResponse(title="Dialogue 1", node=mock_nodes_content[0]),
        UnityDialogueGenerationResponse(title="Dialogue 2", node=mock_nodes_content[1]),
        UnityDialogueGenerationResponse(title="Dialogue 3", node=mock_nodes_content[2])
    ]
    
    mock_enriched_nodes = [
        [{"id": "NODE_PARENT_1_CHOICE_0", "speaker": "PNJ", "line": "Réponse 1", "choices": []}],
        [{"id": "NODE_PARENT_1_CHOICE_1", "speaker": "PNJ", "line": "Réponse 2", "choices": []}],
        [{"id": "NODE_PARENT_1_CHOICE_2", "speaker": "PNJ", "line": "Réponse 3", "choices": []}]
    ]
    
    mock_generation_service.enrich_with_ids.side_effect = mock_enriched_nodes
    mock_generation_service.generate_dialogue_node = AsyncMock(side_effect=mock_responses)
    
    result = await service.generate_nodes_for_all_choices(
        parent_node=sample_parent_node_with_choices,
        instructions="Test",
        context={},
        llm_client=mock_llm_client,
        system_prompt_override=None,
        max_choices=None
    )
    
    # Vérifier format IDs (3 choix: 2 avec None, 1 avec "END" - tous générés)
    assert len(result["nodes"]) == 3
    assert result["nodes"][0]["id"] == "NODE_PARENT_1_CHOICE_0"
    assert result["nodes"][1]["id"] == "NODE_PARENT_1_CHOICE_1"
    assert result["nodes"][2]["id"] == "NODE_PARENT_1_CHOICE_2"
    
    # Vérifier que enrich_with_ids a été appelé avec le bon format (arguments nommés)
    calls = mock_generation_service.enrich_with_ids.call_args_list
    assert len(calls) == 3
    # enrich_with_ids est appelé avec content=response, start_id=start_id (arguments nommés)
    assert calls[0].kwargs["start_id"] == "NODE_PARENT_1_CHOICE_0"  # start_id pour premier choix
    assert calls[1].kwargs["start_id"] == "NODE_PARENT_1_CHOICE_1"  # start_id pour deuxième choix
    assert calls[2].kwargs["start_id"] == "NODE_PARENT_1_CHOICE_2"  # start_id pour troisième choix
    
    # Vérifier compteurs batch
    assert "connected_choices_count" in result
    assert result["connected_choices_count"] == 0
    assert "generated_choices_count" in result
    assert result["generated_choices_count"] == 3
    assert "failed_choices_count" in result
    assert result["failed_choices_count"] == 0
    assert "total_choices_count" in result
    assert result["total_choices_count"] == 3


@pytest.mark.asyncio
async def test_generate_nodes_for_all_choices_empty_choices(mock_llm_client, mock_generation_service):
    """Test avec nœud parent sans choix (navigation linéaire).
    
    Doit retourner liste vide.
    """
    service = GraphGenerationService(mock_generation_service)
    
    parent_node = {
        "id": "NODE_PARENT_3",
        "speaker": "PNJ",
        "line": "Navigation linéaire",
        "nextNode": None
    }
    
    result = await service.generate_nodes_for_all_choices(
        parent_node=parent_node,
        instructions="Test",
        context={},
        llm_client=mock_llm_client,
        system_prompt_override=None,
        max_choices=None
    )
    
    # Vérifier résultat vide
    assert len(result["nodes"]) == 0
    assert len(result["connections"]) == 0
    
    # Vérifier compteurs batch (aucun choix à générer)
    assert "connected_choices_count" in result
    assert result["connected_choices_count"] == 0
    assert "generated_choices_count" in result
    assert result["generated_choices_count"] == 0
    assert "failed_choices_count" in result
    assert result["failed_choices_count"] == 0
    assert "total_choices_count" in result
    assert result["total_choices_count"] == 0
    
    # Vérifier que generate_dialogue_node n'a pas été appelé
    mock_generation_service.generate_dialogue_node.assert_not_called()


@pytest.mark.asyncio
async def test_generate_nodes_for_all_choices_partial_failure(
    mock_llm_client, mock_generation_service, sample_parent_node_with_choices
):
    """Test génération batch avec N choix : K succès, N-K échecs.

    AC: #3 (batch) — Lorsqu'un choix échoue (LLM ou enrichissement), les autres sont
    tout de même retournés et les échecs sont exposés (failed_choices, failed_choices_count).
    Story 1.2 — Traçabilité Epic 1.
    """
    from models.dialogue_structure.unity_dialogue_node import (
        UnityDialogueGenerationResponse,
        UnityDialogueNodeContent,
    )

    service = GraphGenerationService(mock_generation_service)

    mock_ok = [
        UnityDialogueGenerationResponse(
            title="Dialogue 1",
            node=UnityDialogueNodeContent(speaker="PNJ", line="Réponse 1", choices=None),
        ),
        UnityDialogueGenerationResponse(
            title="Dialogue 3",
            node=UnityDialogueNodeContent(speaker="PNJ", line="Réponse 3", choices=None),
        ),
    ]
    # 1er appel OK, 2e échec, 3e OK
    def generate_side_effect(*args, **kwargs):
        generate_side_effect.call_count += 1
        if generate_side_effect.call_count == 2:
            raise Exception("LLM error")
        return mock_ok[0] if generate_side_effect.call_count == 1 else mock_ok[1]

    generate_side_effect.call_count = 0
    mock_generation_service.generate_dialogue_node = AsyncMock(side_effect=generate_side_effect)

    enriched_0 = [{"id": "NODE_PARENT_1_CHOICE_0", "speaker": "PNJ", "line": "Réponse 1", "choices": []}]
    enriched_2 = [{"id": "NODE_PARENT_1_CHOICE_2", "speaker": "PNJ", "line": "Réponse 3", "choices": []}]
    mock_generation_service.enrich_with_ids.side_effect = [enriched_0, enriched_2]

    result = await service.generate_nodes_for_all_choices(
        parent_node=sample_parent_node_with_choices,
        instructions="Test",
        context={},
        llm_client=mock_llm_client,
        system_prompt_override=None,
        max_choices=None,
    )

    assert result["generated_choices_count"] == 2
    assert result["failed_choices_count"] == 1
    assert result["total_choices_count"] == 3
    assert len(result["nodes"]) == 2
    assert len(result["failed_choices"]) == 1
    assert "error" in result["failed_choices"][0]
    assert "choice_index" in result["failed_choices"][0]
    assert "LLM error" in result["failed_choices"][0]["error"]

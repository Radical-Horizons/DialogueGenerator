"""Tests pour UnityDialogueGenerationService avec 4 résultats de test."""
import pytest
from unittest.mock import MagicMock, AsyncMock

from services.unity_dialogue_generation_service import UnityDialogueGenerationService
from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueGenerationResponse,
    UnityDialogueNodeContent,
    UnityDialogueChoiceContent
)


@pytest.fixture
def unity_service() -> UnityDialogueGenerationService:
    """Fixture pour créer un UnityDialogueGenerationService."""
    return UnityDialogueGenerationService()


@pytest.fixture
def mock_llm_client():
    """Fixture pour créer un mock LLM client."""
    client = MagicMock()
    return client


@pytest.mark.asyncio
async def test_generate_nodes_for_choice_with_test_creates_4_nodes(unity_service: UnityDialogueGenerationService, mock_llm_client):
    """Test que generate_nodes_for_choice_with_test crée 4 nœuds pour un choix avec test.
    
    AC: #1, #3 - Génération de 4 nœuds pour un choix avec test.
    """
    # Mock LLM pour générer 4 réponses
    mock_responses = [
        UnityDialogueGenerationResponse(
            title="Échec critique",
            node=UnityDialogueNodeContent(
                speaker="TEST_NPC",
                line="Réponse échec critique"
            )
        ),
        UnityDialogueGenerationResponse(
            title="Échec",
            node=UnityDialogueNodeContent(
                speaker="TEST_NPC",
                line="Réponse échec"
            )
        ),
        UnityDialogueGenerationResponse(
            title="Réussite",
            node=UnityDialogueNodeContent(
                speaker="TEST_NPC",
                line="Réponse réussite"
            )
        ),
        UnityDialogueGenerationResponse(
            title="Réussite critique",
            node=UnityDialogueNodeContent(
                speaker="TEST_NPC",
                line="Réponse réussite critique"
            )
        ),
    ]
    
    mock_llm_client.generate_variants = AsyncMock(side_effect=[
        [mock_responses[0]],  # critical-failure
        [mock_responses[1]],  # failure
        [mock_responses[2]],  # success
        [mock_responses[3]],  # critical-success
    ])
    
    # Créer un choix avec test
    choice_content = UnityDialogueChoiceContent(
        text="Tenter de convaincre",
        test="Raison+Diplomatie:8"
    )
    
    parent_node_id = "START"
    choice_index = 0
    instructions = "Continue la conversation"
    
    # Générer les 4 nœuds pour le choix avec test
    result = await unity_service.generate_nodes_for_choice_with_test(
        llm_client=mock_llm_client,
        choice_content=choice_content,
        parent_node_id=parent_node_id,
        choice_index=choice_index,
        instructions=instructions,
        parent_speaker="TEST_NPC",
        parent_line="Test dialogue line"
    )
    
    # Devrait retourner 4 nœuds enrichis
    assert len(result["nodes"]) == 4
    
    node_ids = [node["id"] for node in result["nodes"]]
    assert len(set(node_ids)) == 4
    for node_id in node_ids:
        assert node_id.startswith("node-") and len(node_id) == 37
    titles = [node.get("title") for node in result["nodes"]]
    assert "Échec critique" in titles
    assert "Échec" in titles
    assert "Réussite" in titles
    assert "Réussite critique" in titles
    
    # Vérifier que les connexions sont correctes
    assert "connections" in result
    assert len(result["connections"]) == 1  # Une connexion depuis le choix
    
    connection = result["connections"][0]
    assert connection["from"] == parent_node_id
    assert connection["choice_index"] == choice_index
    assert connection["testCriticalFailureNode"] in node_ids
    assert connection["testFailureNode"] in node_ids
    assert connection["testSuccessNode"] in node_ids
    assert connection["testCriticalSuccessNode"] in node_ids


@pytest.mark.asyncio
async def test_enrich_with_ids_choice_with_test_sets_4_connections(unity_service: UnityDialogueGenerationService):
    """Test que enrich_with_ids établit les 4 connexions dans le choix quand test est présent.
    
    Note: Ce test vérifie que enrich_with_ids détecte les choix avec test et établit
    les connexions. La génération des nœuds est faite séparément.
    """
    # Créer une réponse avec un choix contenant un test
    # Les 4 nœuds de résultat doivent déjà exister (générés séparément)
    response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line",
            choices=[
                UnityDialogueChoiceContent(
                    text="Tenter de convaincre",
                    test="Raison+Diplomatie:8"
                )
            ]
        )
    )
    
    # IDs des 4 nœuds de résultat (simulés comme déjà générés)
    test_node_ids = {
        "critical-failure": "NODE_START_CHOICE_0_CRITICAL_FAILURE",
        "failure": "NODE_START_CHOICE_0_FAILURE",
        "success": "NODE_START_CHOICE_0_SUCCESS",
        "critical-success": "NODE_START_CHOICE_0_CRITICAL_SUCCESS"
    }
    
    # Enrichir avec IDs - devrait détecter le test et établir les connexions
    enriched_nodes = unity_service.enrich_with_ids(
        content=response,
        start_id="START",
        test_result_node_ids=test_node_ids  # Passer les IDs des nœuds de résultat
    )
    
    # Devrait y avoir 1 nœud : START (les 4 nœuds de résultat sont créés séparément)
    assert len(enriched_nodes) == 1
    
    # Vérifier le nœud START
    start_node = enriched_nodes[0]
    assert start_node["id"] == "START"
    assert "choices" in start_node
    assert len(start_node["choices"]) == 1
    
    # Vérifier que le choix a les 4 champs de connexion
    choice = start_node["choices"][0]
    assert choice["test"] == "Raison+Diplomatie:8"
    assert choice["testCriticalFailureNode"] == test_node_ids["critical-failure"]
    assert choice["testFailureNode"] == test_node_ids["failure"]
    assert choice["testSuccessNode"] == test_node_ids["success"]
    assert choice["testCriticalSuccessNode"] == test_node_ids["critical-success"]

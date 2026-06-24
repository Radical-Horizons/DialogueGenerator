"""Tests pour UnityDialogueGenerationService."""
import pytest
from unittest.mock import MagicMock, AsyncMock

from services.unity_dialogue_generation_service import UnityDialogueGenerationService
from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueGenerationResponse,
    UnityDialogueNodeContent,
    UnityDialogueChoiceContent,
    UnityDialogueConsequencesContent,
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
async def test_generate_dialogue_node_single_node(unity_service: UnityDialogueGenerationService, mock_llm_client):
    """Test que generate_dialogue_node génère un seul nœud."""
    # Créer un mock de réponse avec un seul nœud
    mock_response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line",
            choices=[
                UnityDialogueChoiceContent(
                    text="Choice 1"
                ),
                UnityDialogueChoiceContent(
                    text="Choice 2"
                )
            ]
        )
    )
    
    mock_llm_client.generate_variants = AsyncMock(return_value=[mock_response])
    
    result = await unity_service.generate_dialogue_node(
        llm_client=mock_llm_client,
        prompt="Test prompt",
        max_choices=2
    )
    
    assert isinstance(result, UnityDialogueGenerationResponse)
    assert result.title == "Test Dialogue"
    assert result.node.speaker == "TEST_NPC"
    assert result.node.line == "Test dialogue line"
    assert result.node.choices is not None
    assert len(result.node.choices) == 2


@pytest.mark.asyncio
async def test_enrich_with_ids_single_node(unity_service: UnityDialogueGenerationService):
    """Test que enrich_with_ids fonctionne avec un seul nœud (END n'est pas créé car Unity le gère implicitement)."""
    response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line",
            choices=[
                UnityDialogueChoiceContent(
                    text="Choice 1"
                )
            ]
        )
    )
    
    enriched_nodes = unity_service.enrich_with_ids(response, start_id="START")
    
    # Devrait y avoir 1 seul nœud : START (END n'est pas créé car Unity le gère implicitement)
    assert len(enriched_nodes) == 1
    
    # Vérifier le nœud START
    start_node = enriched_nodes[0]
    assert start_node["id"] == "START"
    assert start_node["speaker"] == "TEST_NPC"
    assert start_node["line"] == "Test dialogue line"
    assert "choices" in start_node
    assert len(start_node["choices"]) == 1
    assert start_node["choices"][0]["text"] == "Choice 1"
    assert start_node["choices"][0]["targetNode"] == "END"  # "END" est un marqueur de fin, pas un vrai nœud
    assert start_node["choices"][0]["choiceId"] == "choice_START_0"


def test_enrich_with_ids_normalizes_llm_consequences_flag(
    unity_service: UnityDialogueGenerationService,
):
    """Régression : flag LLM minuscules normalisé dès enrich_with_ids (graphe + streaming)."""
    response = UnityDialogueGenerationResponse(
        title="Rencontre",
        node=UnityDialogueNodeContent(
            line="Rencontre",
            consequences=UnityDialogueConsequencesContent(
                flag="FLAG_rencontre_valkazer_init",
                description="Première rencontre",
            ),
        ),
    )

    enriched_nodes = unity_service.enrich_with_ids(response, start_id="START")

    assert enriched_nodes[0]["consequences"]["flag"] == "FLAG_RENCONTRE_VALKAZER_INIT"


def test_enrich_with_ids_no_choices(unity_service: UnityDialogueGenerationService):
    """Test enrich_with_ids avec un nœud sans choix."""
    response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line"
        )
    )
    
    enriched_nodes = unity_service.enrich_with_ids(response, start_id="START")
    
    assert len(enriched_nodes) == 1
    node = enriched_nodes[0]
    assert node["id"] == "START"
    assert node["speaker"] == "TEST_NPC"
    assert node["line"] == "Test dialogue line"
    assert "choices" not in node
    # Note: nextNode, successNode, failureNode sont des champs techniques
    # qui ne sont pas générés par l'IA et ne sont pas ajoutés automatiquement


@pytest.mark.asyncio
async def test_max_choices_none_valid_2_choices(unity_service: UnityDialogueGenerationService, mock_llm_client):
    """Test que quand max_choices est None (libre), un nœud avec 2 choix est valide."""
    mock_response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line",
            choices=[
                UnityDialogueChoiceContent(text="Choice 1"),
                UnityDialogueChoiceContent(text="Choice 2")
            ]
        )
    )
    
    mock_llm_client.generate_variants = AsyncMock(return_value=[mock_response])
    
    result = await unity_service.generate_dialogue_node(
        llm_client=mock_llm_client,
        prompt="Test prompt",
        max_choices=None
    )
    
    assert result.node.choices is not None
    assert len(result.node.choices) == 2


@pytest.mark.asyncio
async def test_max_choices_none_valid_5_choices(unity_service: UnityDialogueGenerationService, mock_llm_client):
    """Test que quand max_choices est None (libre), un nœud avec 5 choix est valide."""
    mock_response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line",
            choices=[
                UnityDialogueChoiceContent(text=f"Choice {i}")
                for i in range(1, 6)
            ]
        )
    )
    
    mock_llm_client.generate_variants = AsyncMock(return_value=[mock_response])
    
    result = await unity_service.generate_dialogue_node(
        llm_client=mock_llm_client,
        prompt="Test prompt",
        max_choices=None
    )
    
    assert result.node.choices is not None
    assert len(result.node.choices) == 5


@pytest.mark.asyncio
async def test_max_choices_none_valid_8_choices(unity_service: UnityDialogueGenerationService, mock_llm_client):
    """Test que quand max_choices est None (libre), un nœud avec 8 choix est valide."""
    mock_response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line",
            choices=[
                UnityDialogueChoiceContent(text=f"Choice {i}")
                for i in range(1, 9)
            ]
        )
    )
    
    mock_llm_client.generate_variants = AsyncMock(return_value=[mock_response])
    
    result = await unity_service.generate_dialogue_node(
        llm_client=mock_llm_client,
        prompt="Test prompt",
        max_choices=None
    )
    
    assert result.node.choices is not None
    assert len(result.node.choices) == 8


@pytest.mark.asyncio
async def test_max_choices_none_truncates_to_8(unity_service: UnityDialogueGenerationService, mock_llm_client):
    """Test que quand max_choices est None (libre), un nœud avec plus de 8 choix est tronqué à 8."""
    mock_response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line",
            choices=[
                UnityDialogueChoiceContent(text=f"Choice {i}")
                for i in range(1, 12)
            ]
        )
    )
    
    mock_llm_client.generate_variants = AsyncMock(return_value=[mock_response])
    
    result = await unity_service.generate_dialogue_node(
        llm_client=mock_llm_client,
        prompt="Test prompt",
        max_choices=None
    )
    
    assert result.node.choices is not None
    assert len(result.node.choices) == 8


@pytest.mark.asyncio
async def test_max_choices_none_rejects_0_choices(unity_service: UnityDialogueGenerationService, mock_llm_client):
    """Test que quand max_choices est None (libre), un nœud avec 0 choix lève une erreur."""
    mock_response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line",
            choices=[]  # Liste vide
        )
    )
    
    mock_llm_client.generate_variants = AsyncMock(return_value=[mock_response])
    
    with pytest.raises(ValueError, match="doit avoir entre 2 et 8 choix"):
        await unity_service.generate_dialogue_node(
            llm_client=mock_llm_client,
            prompt="Test prompt",
            max_choices=None
        )


@pytest.mark.asyncio
async def test_max_choices_none_rejects_1_choice(unity_service: UnityDialogueGenerationService, mock_llm_client):
    """Test que quand max_choices est None (libre), un nœud avec 1 seul choix lève une erreur."""
    mock_response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line",
            choices=[
                UnityDialogueChoiceContent(text="Choice 1")
            ]
        )
    )
    
    mock_llm_client.generate_variants = AsyncMock(return_value=[mock_response])
    
    with pytest.raises(ValueError, match="doit avoir entre 2 et 8 choix"):
        await unity_service.generate_dialogue_node(
            llm_client=mock_llm_client,
            prompt="Test prompt",
            max_choices=None
        )


@pytest.mark.asyncio
async def test_max_choices_none_allows_end_node(unity_service: UnityDialogueGenerationService, mock_llm_client):
    """Test que quand max_choices est None (libre), un nœud de fin (sans choix mais avec line) est valide."""
    mock_response = UnityDialogueGenerationResponse(
        title="Test Dialogue",
        node=UnityDialogueNodeContent(
            speaker="TEST_NPC",
            line="Test dialogue line"
            # Pas de choices = nœud de fin valide
        )
    )
    
    mock_llm_client.generate_variants = AsyncMock(return_value=[mock_response])
    
    result = await unity_service.generate_dialogue_node(
        llm_client=mock_llm_client,
        prompt="Test prompt",
        max_choices=None
    )
    
    # Un nœud de fin (sans choix) est valide même quand max_choices est libre
    assert result.node.choices is None
    assert result.node.line == "Test dialogue line"


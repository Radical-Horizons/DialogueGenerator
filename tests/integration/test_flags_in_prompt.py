"""Tests d'intégration pour l'injection des flags in-game dans le prompt."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from api.main import app
from services.prompt_builder import PromptBuilder
from core.prompt.prompt_engine import PromptInput
import xml.etree.ElementTree as ET


@pytest.fixture
def mock_services():
    """Mock des services pour tests d'intégration."""
    from api.dependencies import (
        get_dialogue_generation_service,
        get_prompt_engine,
        get_skill_catalog_service,
        get_trait_catalog_service
    )
    from services.dialogue_generation_service import DialogueGenerationService
    
    # Mock DialogueGenerationService
    mock_dialogue_service = MagicMock(spec=DialogueGenerationService)
    mock_dialogue_service.context_builder = MagicMock()
    mock_dialogue_service.context_builder.build_context_json = MagicMock(return_value={})
    mock_dialogue_service.context_builder.serialize_context_to_text = MagicMock(return_value="Test context")
    mock_dialogue_service.context_builder._context_serializer.serialize_to_xml = MagicMock(return_value=ET.Element("context"))
    mock_dialogue_service.context_builder._count_tokens = MagicMock(return_value=100)
    
    # Mock PromptEngine
    mock_prompt_engine = MagicMock()
    mock_prompt_engine.build_prompt = MagicMock()
    
    # Mock SkillCatalogService
    mock_skill_service = MagicMock()
    mock_skill_service.load_skills = MagicMock(return_value=["Force", "Social", "Raison"])
    
    # Mock TraitCatalogService
    mock_trait_service = MagicMock()
    mock_trait_service.get_trait_labels = MagicMock(return_value=["Courageux", "Intelligent"])
    
    app.dependency_overrides[get_dialogue_generation_service] = lambda: mock_dialogue_service
    app.dependency_overrides[get_prompt_engine] = lambda: mock_prompt_engine
    app.dependency_overrides[get_skill_catalog_service] = lambda: mock_skill_service
    app.dependency_overrides[get_trait_catalog_service] = lambda: mock_trait_service
    
    yield {
        "dialogue_service": mock_dialogue_service,
        "prompt_engine": mock_prompt_engine,
        "skill_service": mock_skill_service,
        "trait_service": mock_trait_service
    }
    
    # Nettoyer après le test
    app.dependency_overrides.clear()


def test_injection_flags_in_prompt_xml():
    """Test que les flags sont injectés dans le XML du prompt."""
    from services.prompt_builder import PromptBuilder
    from core.context.context_builder import ContextBuilder
    
    prompt_builder = PromptBuilder(context_builder=ContextBuilder())
    
    # Créer un contexte XML de test
    context_root = ET.Element("context")
    context_root.text = "Test context"
    
    # Créer un PromptInput avec flags
    flags = [
        {"id": "PLAYER_KILLED_BOSS", "value": True, "category": "Event"},
        {"id": "CURRENT_EFFORT", "value": 5, "category": "Stat"}
    ]
    
    prompt_input = PromptInput(
        user_instructions="Test instructions",
        npc_speaker_id="TEST_NPC",
        in_game_flags=flags
    )
    
    # Construire l'élément flags
    flags_elem = prompt_builder._build_in_game_flags_element(flags)
    
    assert flags_elem is not None
    assert flags_elem.tag == "in_game_flags"
    assert flags_elem.text is not None
    assert "[FLAGS IN-GAME]" in flags_elem.text
    assert "PLAYER_KILLED_BOSS=true" in flags_elem.text
    assert "CURRENT_EFFORT=5" in flags_elem.text


def test_injection_flags_empty_list():
    """Test que pas d'injection si liste de flags vide."""
    from services.prompt_builder import PromptBuilder
    
    prompt_builder = PromptBuilder()
    
    # Liste vide
    flags = []
    
    flags_elem = prompt_builder._build_in_game_flags_element(flags)
    
    assert flags_elem is None


def test_injection_flags_format():
    """Test que le format d'injection est correct [FLAGS IN-GAME] key=value."""
    from services.prompt_builder import PromptBuilder
    
    prompt_builder = PromptBuilder()
    
    flags = [
        {"id": "FLAG_BOOL", "value": True},
        {"id": "FLAG_INT", "value": 10},
        {"id": "FLAG_FLOAT", "value": 2.5},
        {"id": "FLAG_STRING", "value": "test"}
    ]
    
    flags_elem = prompt_builder._build_in_game_flags_element(flags)
    
    assert flags_elem is not None
    flags_text = flags_elem.text
    
    # Vérifier le format
    assert flags_text.startswith("[FLAGS IN-GAME]")
    assert "FLAG_BOOL=true" in flags_text
    assert "FLAG_INT=10" in flags_text
    assert "FLAG_FLOAT=2.5" in flags_text
    assert "FLAG_STRING=test" in flags_text


def test_flags_in_context_section():
    """Test que les flags sont injectés dans la section <context>."""
    from services.prompt_builder import PromptBuilder
    from core.context.context_builder import ContextBuilder
    import xml.etree.ElementTree as ET
    
    prompt_builder = PromptBuilder(context_builder=ContextBuilder())
    
    # Créer un contexte structuré simulé
    context_root = ET.Element("context")
    context_root.text = "Test context"
    
    # Créer un PromptInput avec flags
    flags = [
        {"id": "PLAYER_KILLED_BOSS", "value": True, "category": "Event"}
    ]
    
    prompt_input = PromptInput(
        user_instructions="Test",
        npc_speaker_id="TEST_NPC",
        structured_context={"sections": []},  # Simuler un contexte structuré
        in_game_flags=flags
    )
    
    # Mock serialize_to_xml pour retourner notre contexte
    def mock_serialize_to_xml(context):
        return context_root
    
    prompt_builder._context_builder._context_serializer.serialize_to_xml = mock_serialize_to_xml
    
    # Construire la section context
    context_elem = prompt_builder._build_context_section(prompt_input)
    
    assert context_elem is not None
    assert context_elem.tag == "context"
    
    # Vérifier que les flags sont en première position
    children = list(context_elem)
    assert len(children) > 0
    first_child = children[0]
    assert first_child.tag == "in_game_flags"
    assert "[FLAGS IN-GAME]" in first_child.text


def test_flags_not_in_prompt_if_none():
    """Test que pas d'injection si in_game_flags est None."""
    from services.prompt_builder import PromptBuilder
    
    prompt_builder = PromptBuilder()
    
    # Pas de flags
    flags = None
    
    flags_elem = prompt_builder._build_in_game_flags_element(flags)
    
    assert flags_elem is None


def test_flags_bool_value_formatting():
    """Test que les valeurs bool sont formatées correctement."""
    from services.prompt_builder import PromptBuilder
    
    prompt_builder = PromptBuilder()
    
    flags = [
        {"id": "FLAG_TRUE", "value": True},
        {"id": "FLAG_FALSE", "value": False}
    ]
    
    flags_elem = prompt_builder._build_in_game_flags_element(flags)
    
    assert flags_elem is not None
    flags_text = flags_elem.text
    
    assert "FLAG_TRUE=true" in flags_text
    assert "FLAG_FALSE=false" in flags_text
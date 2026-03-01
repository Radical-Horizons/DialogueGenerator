"""Tests pour la structure JSON du prompt."""
import pytest
from core.context.context_builder import ContextBuilder
from models.prompt_structure import PromptStructure, PromptSection, ContextCategory, ContextItem


@pytest.fixture
def context_builder():
    """Fixture pour créer un ContextBuilder avec données de test."""
    builder = ContextBuilder()
    builder.load_gdd_files()
    return builder


def test_build_context_json_basic(context_builder):
    """Test de base pour build_context_json()."""
    selected_elements = {
        "characters": context_builder.get_characters_names()[:1] if context_builder.get_characters_names() else [],
    }
    
    if not selected_elements["characters"]:
        pytest.skip("Aucun personnage disponible pour le test")
    
    result = context_builder.build_context_json(
        selected_elements=selected_elements,
        scene_instruction="Test scene",
        organization_mode="narrative",
        max_tokens=10000
    )
    
    assert isinstance(result, PromptStructure)
    assert result.sections is not None
    assert len(result.sections) > 0
    assert result.metadata is not None
    assert result.metadata.totalTokens > 0


def test_build_context_json_with_categories(context_builder):
    """Test que build_context_json() crée des catégories correctement."""
    selected_elements = {
        "characters": context_builder.get_characters_names()[:1] if context_builder.get_characters_names() else [],
        "locations": context_builder.get_locations_names()[:1] if context_builder.get_locations_names() else [],
    }
    
    if not selected_elements["characters"] and not selected_elements["locations"]:
        pytest.skip("Aucun élément disponible pour le test")
    
    result = context_builder.build_context_json(
        selected_elements=selected_elements,
        scene_instruction="Test scene",
        organization_mode="narrative",
        max_tokens=10000
    )
    
    # Vérifier qu'on a au moins une section de contexte
    context_sections = [s for s in result.sections if s.type == "context"]
    assert len(context_sections) > 0
    
    # Vérifier qu'on a des catégories
    for section in context_sections:
        if section.categories:
            assert len(section.categories) > 0
            for category in section.categories:
                assert category.type in ["characters", "locations", "items", "species", "communities", "quests"]
                assert category.title is not None
                assert len(category.items) > 0
                
                # Vérifier les items
                for item in category.items:
                    assert item.id is not None
                    assert item.name is not None
                    assert len(item.sections) > 0
                    assert item.tokenCount is not None


def test_serialize_context_to_text(context_builder):
    """Test que serialize_context_to_text() convertit correctement JSON → texte."""
    selected_elements = {
        "characters": context_builder.get_characters_names()[:1] if context_builder.get_characters_names() else [],
    }
    
    if not selected_elements["characters"]:
        pytest.skip("Aucun personnage disponible pour le test")
    
    # Construire la structure JSON
    prompt_structure = context_builder.build_context_json(
        selected_elements=selected_elements,
        scene_instruction="Test scene",
        organization_mode="narrative",
        max_tokens=10000
    )
    
    # Sérialiser en texte
    text = context_builder.serialize_context_to_text(prompt_structure)
    
    assert isinstance(text, str)
    assert len(text) > 0
    
    # Vérifier que les marqueurs sont présents
    assert "---" in text
    assert "CHARACTERS" in text or "PERSONNAGES" in text


def test_serialize_context_to_text_preserves_structure(context_builder):
    """Test que la sérialisation préserve la structure hiérarchique."""
    selected_elements = {
        "characters": context_builder.get_characters_names()[:1] if context_builder.get_characters_names() else [],
    }
    
    if not selected_elements["characters"]:
        pytest.skip("Aucun personnage disponible pour le test")
    
    prompt_structure = context_builder.build_context_json(
        selected_elements=selected_elements,
        scene_instruction="Test scene",
        organization_mode="narrative",
        max_tokens=10000
    )
    
    text = context_builder.serialize_context_to_text(prompt_structure)
    
    # Vérifier que les sections sont présentes dans le texte
    for section in prompt_structure.sections:
        if section.categories:
            for category in section.categories:
                # Le titre de catégorie doit être dans le texte
                assert category.title in text
                
                for item in category.items:
                    # Le nom de l'item doit être dans le texte
                    assert item.name in text
                    
                    # Les sections de l'item doivent être dans le texte
                    for item_section in item.sections:
                        assert item_section.title in text
                        assert item_section.content in text


def test_build_context_json_with_field_configs(context_builder):
    """Test build_context_json() avec field_configs personnalisés."""
    selected_elements = {
        "characters": context_builder.get_characters_names()[:1] if context_builder.get_characters_names() else [],
    }
    
    if not selected_elements["characters"]:
        pytest.skip("Aucun personnage disponible pour le test")
    
    field_configs = {
        "character": ["Nom", "Introduction.Résumé de la fiche"]
    }
    
    result = context_builder.build_context_json(
        selected_elements=selected_elements,
        scene_instruction="Test scene",
        field_configs=field_configs,
        organization_mode="narrative",
        max_tokens=10000
    )
    
    assert isinstance(result, PromptStructure)
    # Vérifier que les items contiennent les champs demandés
    for section in result.sections:
        if section.categories:
            for category in section.categories:
                if category.type == "characters":
                    for item in category.items:
                        # Vérifier qu'on a des sections (champs)
                        assert len(item.sections) > 0

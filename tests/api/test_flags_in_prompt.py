"""Tests d'intégration pour l'injection des flags in-game dans les prompts."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from api.main import app


@pytest.fixture
def mock_dialogue_service():
    """Mock du DialogueGenerationService."""
    mock_service = MagicMock()
    mock_service.context_builder = MagicMock()
    mock_service.context_builder._count_tokens = MagicMock(return_value=100)
    
    # Mock d'un structured_context (simple MagicMock suffit pour les tests)
    mock_structured_context = MagicMock()
    
    mock_service.context_builder.build_context_json = MagicMock(return_value=mock_structured_context)
    mock_service.context_builder.serialize_context_to_text = MagicMock(return_value="context text")
    
    # Mock de serialize_to_xml pour retourner un élément XML <context>
    import xml.etree.ElementTree as ET
    mock_context_elem = ET.Element("context")
    ET.SubElement(mock_context_elem, "test_content").text = "Mocked context"
    mock_service.context_builder._context_serializer.serialize_to_xml = MagicMock(return_value=mock_context_elem)
    
    mock_service.context_builder.set_previous_dialogue_context = MagicMock()
    return mock_service


@pytest.fixture
def client(mock_dialogue_service, monkeypatch):
    """Fixture pour créer un client de test avec mocks."""
    from api.dependencies import (
        get_dialogue_generation_service,
        get_config_service
    )
    
    # Mock du config service
    mock_config_service = MagicMock()
    mock_config_service.get_llm_config = MagicMock(return_value={
        "api_key_env_var": "OPENAI_API_KEY"
    })
    mock_config_service.get_available_llm_models = MagicMock(return_value=[
        {
            "api_identifier": "gpt-5.2-mini",
            "display_name": "GPT-4o Mini",
            "client_type": "openai"
        }
    ])
    
    # Mock SkillCatalogService et TraitCatalogService
    mock_skill_service = MagicMock()
    mock_skill_service.load_skills = MagicMock(return_value=["Skill1", "Skill2"])
    mock_trait_service = MagicMock()
    mock_trait_service.get_trait_labels = MagicMock(return_value=["Trait1", "Trait2"])
    
    monkeypatch.setattr("api.routers.dialogues.SkillCatalogService", lambda: mock_skill_service)
    monkeypatch.setattr("api.routers.dialogues.TraitCatalogService", lambda: mock_trait_service)
    
    # Override les dépendances
    app.dependency_overrides[get_dialogue_generation_service] = lambda: mock_dialogue_service
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    
    yield TestClient(app)
    
    # Nettoyer
    app.dependency_overrides.clear()


def test_preview_prompt_with_flags(client, mock_dialogue_service):
    """Test que les flags in-game sont injectés dans le prompt."""
    
    request_data = {
        "user_instructions": "Test scene with flags",
        "context_selections": {
            "characters_full": ["Test Character"],
            "locations_full": [],
            "items_full": [],
            "species_full": [],
            "communities_full": []
        },
        "max_context_tokens": 100000,
        "in_game_flags": [
            {"id": "PLAYER_KILLED_BOSS", "value": True, "category": "Event"},
            {"id": "CURRENT_EFFORT", "value": 2, "category": "Stat"}
        ]
    }
    
    response = client.post("/api/v1/dialogues/preview-prompt", json=request_data)
    
    assert response.status_code == 200
    data = response.json()
    assert "raw_prompt" in data
    
    # Vérifier que le prompt contient la ligne [FLAGS IN-GAME]
    raw_prompt = data["raw_prompt"]
    assert "[FLAGS IN-GAME]" in raw_prompt
    assert "PLAYER_KILLED_BOSS=true" in raw_prompt
    assert "CURRENT_EFFORT=2" in raw_prompt


def test_preview_prompt_without_flags(client, mock_dialogue_service):
    """Test que le prompt sans flags ne contient pas de section flags."""
    
    request_data = {
        "user_instructions": "Test scene without flags",
        "context_selections": {
            "characters_full": ["Test Character"],
            "locations_full": [],
            "items_full": [],
            "species_full": [],
            "communities_full": []
        },
        "max_context_tokens": 10000
    }
    
    response = client.post("/api/v1/dialogues/preview-prompt", json=request_data)
    
    assert response.status_code == 200
    data = response.json()
    raw_prompt = data["raw_prompt"]
    
    # Vérifier que le prompt ne contient PAS la ligne [FLAGS IN-GAME]
    assert "[FLAGS IN-GAME]" not in raw_prompt


def test_estimate_tokens_with_flags(client, mock_dialogue_service):
    """Test de l'estimation de tokens avec flags."""
    
    request_data = {
        "user_instructions": "Test with flags",
        "context_selections": {
            "characters_full": ["Test Character"],
            "locations_full": [],
            "items_full": [],
            "species_full": [],
            "communities_full": []
        },
        "max_context_tokens": 100000,
        "in_game_flags": [
            {"id": "PLAYER_KILLED_BOSS", "value": True}
        ]
    }
    
    response = client.post("/api/v1/dialogues/estimate-tokens", json=request_data)
    
    assert response.status_code == 200
    data = response.json()
    assert "raw_prompt" in data
    
    # Vérifier la présence des flags
    raw_prompt = data["raw_prompt"]
    assert "[FLAGS IN-GAME]" in raw_prompt
    assert "PLAYER_KILLED_BOSS=true" in raw_prompt


def test_flags_instruction_in_technical_section(client, mock_dialogue_service):
    """Test que l'instruction de réactivité aux flags est ajoutée dans la section technique."""
    
    request_data = {
        "user_instructions": "Test with flags instruction",
        "context_selections": {
            "characters_full": ["Test Character"],
            "locations_full": [],
            "items_full": [],
            "species_full": [],
            "communities_full": []
        },
        "max_context_tokens": 100000,
        "in_game_flags": [
            {"id": "PLAYER_KILLED_BOSS", "value": True}
        ]
    }
    
    response = client.post("/api/v1/dialogues/preview-prompt", json=request_data)
    
    assert response.status_code == 200
    data = response.json()
    raw_prompt = data["raw_prompt"]
    
    # Vérifier que l'instruction de réactivité est présente
    assert "Le PNJ doit réagir/mentionner explicitement au moins 1 flag in-game" in raw_prompt or "réagir/mentionner" in raw_prompt.lower()


def test_multiple_flags_serialization(client, mock_dialogue_service):
    """Test de la sérialisation de plusieurs flags avec différents types."""
    
    request_data = {
        "user_instructions": "Test multiple flags",
        "context_selections": {
            "characters_full": ["Test Character"],
            "locations_full": [],
            "items_full": [],
            "species_full": [],
            "communities_full": []
        },
        "max_context_tokens": 100000,
        "in_game_flags": [
            {"id": "PLAYER_KILLED_BOSS", "value": True},
            {"id": "ALLIED_WITH_CULTE", "value": False},
            {"id": "CURRENT_EFFORT", "value": 2}
        ]
    }
    
    response = client.post("/api/v1/dialogues/preview-prompt", json=request_data)
    
    assert response.status_code == 200
    data = response.json()
    raw_prompt = data["raw_prompt"]
    
    # Vérifier que tous les flags sont présents
    assert "PLAYER_KILLED_BOSS=true" in raw_prompt
    assert "ALLIED_WITH_CULTE=false" in raw_prompt
    assert "CURRENT_EFFORT=2" in raw_prompt
    
    # Vérifier le format (séparés par des virgules)
    assert "[FLAGS IN-GAME]" in raw_prompt

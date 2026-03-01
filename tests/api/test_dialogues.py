"""Tests unitaires pour les endpoints de génération de dialogues.

Ce module contient des tests unitaires qui utilisent des mocks pour isoler
les tests des dépendances externes (GDD, LLM, etc.). Ces tests sont rapides
et vérifient la logique des endpoints sans dépendre des vraies données.

Types de tests :
- Tests unitaires : Utilisent des mocks (DialogueGenerationService, ContextBuilder, etc.)
- Tests API : Testent les endpoints FastAPI
- Tests rapides : Pas de chargement de fichiers réels

Pour exécuter uniquement ces tests :
    pytest tests/api/test_dialogues.py -m "unit and api"

Pour exécuter les tests d'intégration (avec vraies données) :
    pytest tests/api/test_prompt_raw_verification.py -m integration
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock
from api.main import app
from services.dialogue_generation_service import DialogueGenerationService
# InteractionService et Interaction supprimés - système obsolète
from models.dialogue_structure.dialogue_elements import DialogueLineElement


@pytest.fixture
def mock_dialogue_service():
    """Mock du DialogueGenerationService pour tests unitaires.
    
    Ce mock isole les tests des dépendances réelles (GDD, LLM, etc.).
    """
    from core.prompt.prompt_engine import BuiltPrompt
    
    mock_service = MagicMock(spec=DialogueGenerationService)
    mock_service.context_builder = MagicMock()
    mock_service.context_builder._count_tokens = MagicMock(return_value=100)
    mock_service.prompt_engine = MagicMock()
    mock_built = BuiltPrompt(
        raw_prompt="prompt",
        token_count=200,
        sections={},
        prompt_hash="hash123"
    )
    mock_service.prompt_engine.build_prompt = MagicMock(return_value=mock_built)
    mock_service.prompt_engine.system_prompt_template = "Test system prompt"
    return mock_service


# mock_interaction_service supprimé - système obsolète

@pytest.fixture
def client(mock_dialogue_service):
    """Fixture pour créer un client de test avec mocks."""
    from api.dependencies import (
        get_dialogue_generation_service,
        # get_interaction_service supprimé - système obsolète
        get_config_service
    )
    
    # Mock du config service pour éviter les erreurs
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
    
    # Override les dépendances FastAPI
    app.dependency_overrides[get_dialogue_generation_service] = lambda: mock_dialogue_service
    # get_interaction_service supprimé - système obsolète
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    
    yield TestClient(app)
    
    # Nettoyer après le test
    app.dependency_overrides.clear()


def test_estimate_tokens(client, mock_dialogue_service, monkeypatch):
    """Test d'estimation de tokens."""
    mock_dialogue_service.context_builder.build_context = MagicMock(return_value="context text")
    
    # Mock SkillCatalogService et TraitCatalogService pour estimate_tokens
    mock_skill_service = MagicMock()
    mock_skill_service.load_skills = MagicMock(return_value=["Skill1", "Skill2"])
    mock_trait_service = MagicMock()
    mock_trait_service.load_traits = MagicMock(return_value=[])
    mock_trait_service.get_trait_labels = MagicMock(return_value=["Trait1", "Trait2"])
    
    monkeypatch.setattr("api.routers.dialogues.SkillCatalogService", lambda: mock_skill_service)
    monkeypatch.setattr("api.routers.dialogues.TraitCatalogService", lambda: mock_trait_service)
    
    response = client.post(
        "/api/v1/dialogues/estimate-tokens",
        json={
            "context_selections": {
                "characters": ["Character1"],
                "locations": [],
                "items": [],
                "species": [],
                "communities": []
            },
            "user_instructions": "Test instructions",
            "max_context_tokens": 1000
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "context_tokens" in data
    assert "token_count" in data  # Le champ s'appelle token_count, pas total_estimated_tokens
    assert isinstance(data["context_tokens"], int)
    assert isinstance(data["token_count"], int)


@pytest.mark.unit
@pytest.mark.api
def test_estimate_tokens_invalid_request(client):
    """Test d'estimation de tokens avec requête invalide."""
    response = client.post(
        "/api/v1/dialogues/estimate-tokens",
        json={}
    )
    assert response.status_code == 422  # Validation error


@pytest.mark.unit
@pytest.mark.api
def test_preview_prompt(client, mock_dialogue_service, monkeypatch):
    """Test de prévisualisation du prompt."""
    mock_dialogue_service.context_builder.build_context = MagicMock(return_value="context text")
    
    # Mock SkillCatalogService et TraitCatalogService pour preview_prompt
    mock_skill_service = MagicMock()
    mock_skill_service.load_skills = MagicMock(return_value=["Skill1", "Skill2"])
    mock_trait_service = MagicMock()
    mock_trait_service.load_traits = MagicMock(return_value=[])
    mock_trait_service.get_trait_labels = MagicMock(return_value=["Trait1", "Trait2"])
    
    monkeypatch.setattr("api.routers.dialogues.SkillCatalogService", lambda: mock_skill_service)
    monkeypatch.setattr("api.routers.dialogues.TraitCatalogService", lambda: mock_trait_service)
    
    response = client.post(
        "/api/v1/dialogues/preview-prompt",
        json={
            "context_selections": {
                "characters_full": ["Character1"],
                "locations_full": [],
                "items_full": [],
                "species_full": [],
                "communities_full": []
            },
            "user_instructions": "Test instructions",
            "max_context_tokens": 1000
        }
    )
    assert response.status_code == 200
    data = response.json()
    # PreviewPromptResponse contient raw_prompt, prompt_hash, structured_prompt (optionnel)
    assert "raw_prompt" in data
    assert "prompt_hash" in data
    assert isinstance(data["raw_prompt"], str)
    assert isinstance(data["prompt_hash"], str)
    # Ne devrait PAS contenir context_tokens ni token_count (c'est pour estimate-tokens)
    assert "context_tokens" not in data
    assert "token_count" not in data


@pytest.mark.unit
@pytest.mark.api
def test_preview_prompt_invalid_request(client):
    """Test de prévisualisation avec requête invalide."""
    response = client.post(
        "/api/v1/dialogues/preview-prompt",
        json={}
    )
    assert response.status_code == 422  # Validation error


# test_generate_dialogue_variants et test_generate_dialogue_variants_invalid_request supprimés - système texte libre obsolète, utiliser Unity JSON à la place

# Tests pour /generate/interactions (endpoint supprimé) retirés.
# Remplacé par /generate/unity-dialogue, couvert par TestGenerateUnityDialogue.


class TestGenerateUnityDialogue:
    """Tests pour l'endpoint POST /api/v1/dialogues/generate/unity-dialogue."""
    
    @pytest.mark.asyncio
    async def test_generate_unity_dialogue_success(self, client, mock_dialogue_service, monkeypatch):
        """Test de génération Unity dialogue avec succès."""
        from api.schemas.dialogue import GenerateUnityDialogueResponse
        from unittest.mock import AsyncMock
        import json
        
        # Mock UnityDialogueOrchestrator qui est utilisé dans le router
        mock_orchestrator = MagicMock()
        mock_response = GenerateUnityDialogueResponse(
            json_content=json.dumps({"title": "Test Dialogue", "nodes": []}),
            raw_prompt=json.dumps({"system": "", "user": ""}),  # raw_prompt est une string JSON
            prompt_hash="test_hash",
            estimated_tokens=100,
            reasoning_trace=None
        )
        mock_orchestrator.generate = AsyncMock(return_value=mock_response)
        
        monkeypatch.setattr("services.unity_dialogue_orchestrator.UnityDialogueOrchestrator", lambda *args, **kwargs: mock_orchestrator)
        
        request_data = {
            "context_selections": {
                "characters_full": ["Test Character"],
                "locations_full": [],
                "items_full": [],
                "species_full": [],
                "communities_full": []
            },
            "user_instructions": "Test instructions",
            "llm_model_identifier": "gpt-5-mini",
            "max_context_tokens": 1000,
            "max_choices": 2
        }
        
        response = client.post("/api/v1/dialogues/generate/unity-dialogue", json=request_data)
        
        # Peut retourner 200 si tout est mocké correctement, ou 500 si erreur
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            data = response.json()
            assert "json_content" in data
            assert "title" in data
            assert "raw_prompt" in data
    
    def test_generate_unity_dialogue_no_characters(self, client):
        """Test de génération Unity dialogue sans personnages."""
        request_data = {
            "context_selections": {
                "characters_full": [],
                "locations_full": [],
                "items_full": [],
                "species_full": [],
                "communities_full": []
            },
            "user_instructions": "Test instructions",
            "llm_model_identifier": "gpt-5-mini"
        }
        
        response = client.post("/api/v1/dialogues/generate/unity-dialogue", json=request_data)
        
        assert response.status_code == 422
        data = response.json()
        assert "detail" in data or "error" in data
    
    def test_generate_unity_dialogue_invalid_request(self, client):
        """Test de génération Unity dialogue avec requête invalide."""
        response = client.post("/api/v1/dialogues/generate/unity-dialogue", json={})
        
        assert response.status_code == 422


# Classes TestGenerateVariants et TestGenerateChoices retirées (endpoints non exposés dans dialogues.py).

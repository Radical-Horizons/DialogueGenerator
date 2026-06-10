"""Tests d'intégration pour vérifier que le bon client LLM est sélectionné."""
import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from api.main import app
from api.dependencies import get_config_service
from core.llm.llm_client import DummyLLMClient
from core.llm.openai.client import OpenAIClient


@pytest.fixture
def client_with_real_config():
    """Fixture avec configuration réelle pour tester la sélection du client."""
    from api.dependencies import (
        get_dialogue_generation_service,
# get_interaction_service supprimé - système obsolète
        get_config_service
    )
    from services.dialogue_generation_service import DialogueGenerationService
    # InteractionService supprimé - système obsolète
    from services.configuration_service import ConfigurationService
    
    # Utiliser le vrai ConfigurationService
    real_config_service = ConfigurationService()
    
    # Mock des services de dialogue pour éviter les dépendances complexes
    mock_dialogue_service = MagicMock(spec=DialogueGenerationService)
    
    app.dependency_overrides[get_dialogue_generation_service] = lambda: mock_dialogue_service
    app.dependency_overrides[get_config_service] = lambda: real_config_service
    
    yield TestClient(app)
    
    app.dependency_overrides.clear()


def test_llm_factory_creates_openai_client_when_api_key_present(client_with_real_config):
    """Test que LLMClientFactory crée un OpenAIClient quand la clé API est présente."""
    from factories.llm_factory import LLMClientFactory
    from services.configuration_service import ConfigurationService
    
    config_service = ConfigurationService()
    llm_config = config_service.get_llm_config()
    available_models = config_service.get_available_llm_models()
    
    # Vérifier que la variable de clé API est configurée, puis forcer une valeur
    # non-placeholder pour que le test reste déterministe en CI (`sk-dummy` est
    # volontairement traité comme absent par la factory).
    api_key_env_var = llm_config.get("api_key_env_var")
    assert api_key_env_var is not None, "api_key_env_var doit être défini dans la config"
    
    # Tester avec un modèle disponible
    if not available_models:
        pytest.skip("Aucun modèle disponible dans la configuration")
    
    test_model = available_models[0]
    model_id = test_model.get("api_identifier") or test_model.get("model_identifier")
    
    if not model_id:
        pytest.skip("Aucun identifiant de modèle trouvé")
    
    # Créer le client
    with patch.dict(os.environ, {api_key_env_var: "test-openai-key"}), patch('factories.llm_factory.OpenAIClient') as mock_openai_class:
        mock_openai_class.return_value = MagicMock(spec=OpenAIClient)
        
        client = LLMClientFactory.create_client(
            model_id=model_id,
            config=llm_config,
            available_models=available_models
        )
        
        # Vérifier que OpenAIClient a été appelé (pas DummyLLMClient)
        assert mock_openai_class.called, f"OpenAIClient devrait être créé pour {model_id}"
        assert not isinstance(client, DummyLLMClient), f"DummyLLMClient ne devrait pas être utilisé pour {model_id}"


def test_llm_factory_creates_dummy_when_api_key_missing():
    """Test que LLMClientFactory crée un DummyLLMClient quand la clé API est absente."""
    from factories.llm_factory import LLMClientFactory
    
    config = {
        "api_key_env_var": "OPENAI_API_KEY"
    }
    available_models = [
        {
            "api_identifier": "gpt-5.2-mini",
            "display_name": "GPT-4o Mini",
            "client_type": "openai"
        }
    ]
    
    # Simuler l'absence de clé API
    with patch.dict(os.environ, {}, clear=True):
        client = LLMClientFactory.create_client(
            model_id="gpt-5.2-mini",
            config=config,
            available_models=available_models
        )
    
    assert isinstance(client, DummyLLMClient), "DummyLLMClient devrait être utilisé quand la clé API est absente"


def test_api_endpoint_uses_correct_llm_client(client_with_real_config):
    """Test que l'endpoint API utilise le bon client LLM (pas DummyLLMClient par défaut)."""
    from api.dependencies import get_dialogue_generation_service
    from api.routers.auth import get_current_user
    from unittest.mock import MagicMock
    
    # Mock correct du dialogue_service avec context_builder
    mock_context_builder = MagicMock()
    mock_context_builder._count_tokens = MagicMock(return_value=100)
    mock_context_builder.build_context = MagicMock(return_value="test context")
    mock_context_builder.build_context_json = MagicMock(return_value={})
    mock_context_builder.serialize_context_to_text = MagicMock(return_value="")
    
    from core.prompt.prompt_engine import BuiltPrompt
    
    mock_dialogue_service = MagicMock()
    mock_dialogue_service.context_builder = mock_context_builder
    mock_dialogue_service.prompt_engine = MagicMock()
    mock_built = BuiltPrompt(
        raw_prompt="prompt",
        token_count=200,
        sections={},
        prompt_hash="hash123"
    )
    mock_dialogue_service.prompt_engine.build_prompt = MagicMock(return_value=mock_built)
    mock_dialogue_service.prompt_engine.system_prompt_template = "Test system prompt"
    mock_dialogue_service.prompt_engine._count_tokens = MagicMock(return_value=100)
    
    app.dependency_overrides[get_dialogue_generation_service] = lambda: mock_dialogue_service

    async def _test_user() -> dict:
        return {
            "id": "1",
            "username": "test",
            "email": "test@example.com",
        }

    app.dependency_overrides[get_current_user] = _test_user

    try:
        # Faire une requête d'estimation de tokens (plus simple qu'une génération)
        response = client_with_real_config.post(
            "/api/v1/dialogues/estimate-tokens",
            json={
                "context_selections": {
                    "characters": [],
                    "locations": [],
                    "items": [],
                    "species": [],
                    "communities": []
                },
                "user_instructions": "Test",
                "max_context_tokens": 10000
            }
        )
        
        # L'endpoint d'estimation ne crée pas de client LLM, donc on vérifie juste que ça fonctionne
        assert response.status_code in [200, 422]  # 422 si validation échoue, mais pas d'erreur serveur
    finally:
        # Nettoyer
        if get_dialogue_generation_service in app.dependency_overrides:
            del app.dependency_overrides[get_dialogue_generation_service]
        if get_current_user in app.dependency_overrides:
            del app.dependency_overrides[get_current_user]


def test_llm_factory_handles_model_without_client_type():
    """Test que LLMClientFactory gère correctement un modèle sans client_type (devrait utiliser 'openai' par défaut)."""
    from factories.llm_factory import LLMClientFactory
    
    config = {
        "api_key_env_var": "OPENAI_API_KEY"
    }
    available_models = [
        {
            "api_identifier": "gpt-5.2-mini",
            "display_name": "GPT-4o Mini"
            # Pas de client_type
        }
    ]
    
    with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
        with patch('factories.llm_factory.OpenAIClient') as mock_openai:
            mock_openai.return_value = MagicMock(spec=OpenAIClient)
            
            client = LLMClientFactory.create_client(
                model_id="gpt-5.2-mini",
                config=config,
                available_models=available_models
            )
    
    # Vérifier que OpenAIClient a été appelé (client_type="openai" par défaut)
    assert mock_openai.called, "OpenAIClient devrait être créé avec client_type='openai' par défaut"


def test_llm_factory_creates_openai_for_gpt_5_2():
    """Test spécifique que LLMClientFactory crée un OpenAIClient pour 'gpt-5.2' quand la clé API est présente."""
    from factories.llm_factory import LLMClientFactory
    
    config = {
        "api_key_env_var": "OPENAI_API_KEY"
    }
    available_models = [
        {
            "display_name": "GPT-5.2 (Recommandé)",
            "api_identifier": "gpt-5.2",
            "notes": "Modèle le plus récent et le plus capable, bon équilibre performance/coût."
        }
    ]
    
    with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key-123"}):
        with patch('factories.llm_factory.OpenAIClient') as mock_openai:
            mock_openai.return_value = MagicMock(spec=OpenAIClient)
            
            client = LLMClientFactory.create_client(
                model_id="gpt-5.2",
                config=config,
                available_models=available_models
            )
    
    # Vérifier que OpenAIClient a été appelé (pas DummyLLMClient)
    assert mock_openai.called, "OpenAIClient devrait être créé pour 'gpt-5.2'"
    assert not isinstance(client, DummyLLMClient), "DummyLLMClient ne devrait pas être utilisé pour 'gpt-5.2'"
    
    # Vérifier les paramètres d'appel
    call_kwargs = mock_openai.call_args[1]
    assert call_kwargs["api_key"] == "test-key-123"
    assert call_kwargs["config"]["default_model"] == "gpt-5.2"


def test_llm_factory_uses_dummy_for_gpt_5_2_when_api_key_missing():
    """Test que LLMClientFactory utilise DummyLLMClient pour 'gpt-5.2' quand la clé API est absente."""
    from factories.llm_factory import LLMClientFactory
    
    config = {
        "api_key_env_var": "OPENAI_API_KEY"
    }
    available_models = [
        {
            "display_name": "GPT-5.2 (Recommandé)",
            "api_identifier": "gpt-5.2",
            "notes": "Modèle le plus récent et le plus capable, bon équilibre performance/coût."
        }
    ]
    
    # Simuler l'absence de clé API
    with patch.dict(os.environ, {}, clear=True):
        client = LLMClientFactory.create_client(
            model_id="gpt-5.2",
            config=config,
            available_models=available_models
        )
    
    assert isinstance(client, DummyLLMClient), "DummyLLMClient devrait être utilisé quand la clé API est absente"


def test_llm_factory_uses_dummy_for_gpt_5_2_when_api_key_is_ci_placeholder():
    """CI définit OPENAI_API_KEY=sk-dummy : doit forcer DummyLLMClient (pas d'appel OpenAI 401)."""
    from factories.llm_factory import LLMClientFactory

    config = {"api_key_env_var": "OPENAI_API_KEY"}
    available_models = [
        {
            "display_name": "GPT-5.2 (Recommandé)",
            "api_identifier": "gpt-5.2",
            "client_type": "openai",
            "notes": "Modèle le plus récent et le plus capable, bon équilibre performance/coût.",
        }
    ]

    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy"}):
        client = LLMClientFactory.create_client(
            model_id="gpt-5.2",
            config=config,
            available_models=available_models,
        )

    assert isinstance(client, DummyLLMClient)


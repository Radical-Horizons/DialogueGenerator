"""Tests unitaires pour la configuration LLM avec support Mistral."""
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from services.configuration_service import ConfigurationService


class TestLLMConfigMistral:
    """Tests pour la configuration LLM avec modèles Mistral."""

    @pytest.fixture
    def mock_llm_config_with_mistral(self):
        """Configuration LLM mock avec modèles Mistral."""
        return {
            "api_key_env_var": "OPENAI_API_KEY",
            "mistral_api_key_env_var": "MISTRAL_API_KEY",
            "default_model": "gpt-5.6-terra",
            "temperature": 0.7,
            "max_tokens": 2000,
            "available_models": [
                {
                    "api_identifier": "gpt-5.6-terra",
                    "display_name": "GPT-5.2",
                    "client_type": "openai",
                    "parameters": {
                        "default_temperature": 0.7,
                        "max_tokens": 4096
                    }
                },
                {
                    "api_identifier": "mistral-small-latest",
                    "display_name": "Mistral Small Creative",
                    "client_type": "mistral",
                    "parameters": {
                        "default_temperature": 0.7,
                        "max_tokens": 32000
                    }
                }
            ]
        }

    def test_llm_config_has_mistral_api_key_env_var(self, mock_llm_config_with_mistral):
        """Test que la configuration contient mistral_api_key_env_var."""
        assert "mistral_api_key_env_var" in mock_llm_config_with_mistral
        assert mock_llm_config_with_mistral["mistral_api_key_env_var"] == "MISTRAL_API_KEY"

    def test_llm_config_has_mistral_models(self, mock_llm_config_with_mistral):
        """Test que la configuration contient des modèles Mistral."""
        available_models = mock_llm_config_with_mistral["available_models"]
        mistral_models = [m for m in available_models if m.get("client_type") == "mistral"]
        
        assert len(mistral_models) > 0, "Aucun modèle Mistral trouvé dans available_models"
        
        mistral_model = mistral_models[0]
        assert mistral_model["api_identifier"] == "mistral-small-latest"
        assert mistral_model["display_name"] == "Mistral Small Creative"
        assert mistral_model["client_type"] == "mistral"

    def test_mistral_model_has_parameters(self, mock_llm_config_with_mistral):
        """Test que les modèles Mistral ont des paramètres."""
        available_models = mock_llm_config_with_mistral["available_models"]
        mistral_model = next(m for m in available_models if m.get("client_type") == "mistral")
        
        assert "parameters" in mistral_model
        assert "default_temperature" in mistral_model["parameters"]
        assert "max_tokens" in mistral_model["parameters"]
        assert mistral_model["parameters"]["max_tokens"] == 32000

    def test_configuration_service_returns_mistral_models(self, mock_llm_config_with_mistral):
        """Test que ConfigurationService retourne les modèles Mistral."""
        # Créer un service avec la config mockée
        with patch.object(ConfigurationService, '_load_json_file', return_value=mock_llm_config_with_mistral):
            config_service = ConfigurationService()
            available_models = config_service.get_available_llm_models()
            
            # Vérifier que available_models contient des modèles Mistral
            mistral_models = [m for m in available_models if m.get("client_type") == "mistral"]
            assert len(mistral_models) > 0
            assert mistral_models[0]["api_identifier"] == "mistral-small-latest"

    def test_llm_config_structure_compatibility(self, mock_llm_config_with_mistral):
        """Test que la structure de configuration est compatible avec l'existant."""
        # Vérifier que les champs OpenAI existants sont toujours présents
        assert "api_key_env_var" in mock_llm_config_with_mistral
        assert "default_model" in mock_llm_config_with_mistral
        assert "temperature" in mock_llm_config_with_mistral
        assert "max_tokens" in mock_llm_config_with_mistral
        assert "available_models" in mock_llm_config_with_mistral
        
        # Vérifier que les modèles OpenAI sont toujours présents
        available_models = mock_llm_config_with_mistral["available_models"]
        openai_models = [m for m in available_models if m.get("client_type") == "openai"]
        assert len(openai_models) > 0

    def test_available_models_is_list_of_objects(self, mock_llm_config_with_mistral):
        """Test que available_models est une liste d'objets (pas une liste de strings)."""
        available_models = mock_llm_config_with_mistral["available_models"]
        
        assert isinstance(available_models, list)
        assert len(available_models) > 0
        
        for model in available_models:
            assert isinstance(model, dict)
            assert "api_identifier" in model
            assert "display_name" in model
            assert "client_type" in model

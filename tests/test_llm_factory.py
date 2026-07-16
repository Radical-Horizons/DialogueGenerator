"""Tests unitaires pour LLMClientFactory."""
import os
import pytest
from unittest.mock import patch, MagicMock
from factories.llm_factory import LLMClientFactory
from core.llm.llm_client import DummyLLMClient
from core.llm.openai.client import OpenAIClient
from core.llm.mistral_client import MistralClient


class TestLLMClientFactory:
    """Tests pour LLMClientFactory."""
    
    def test_create_dummy_client_explicit(self):
        """Test la création explicite d'un DummyLLMClient."""
        config = {"api_key_env_var": "OPENAI_API_KEY"}
        available_models = []
        
        client = LLMClientFactory.create_client(
            model_id="dummy",
            config=config,
            available_models=available_models
        )
        
        assert isinstance(client, DummyLLMClient)
    
    def test_create_client_model_not_found(self):
        """Test qu'un DummyLLMClient est retourné si le modèle n'est pas trouvé."""
        config = {"api_key_env_var": "OPENAI_API_KEY"}
        available_models = [
            {"api_identifier": "gpt-5.6-terra", "display_name": "GPT-5.2"}
        ]
        
        client = LLMClientFactory.create_client(
            model_id="unknown-model",
            config=config,
            available_models=available_models
        )
        
        assert isinstance(client, DummyLLMClient)
    
    def test_create_client_no_api_key_env_var(self):
        """Test qu'un DummyLLMClient est retourné si api_key_env_var n'est pas défini."""
        config = {}  # Pas de api_key_env_var
        available_models = [
            {"api_identifier": "gpt-5.6-terra", "display_name": "GPT-5.2", "client_type": "openai"}
        ]
        
        client = LLMClientFactory.create_client(
            model_id="gpt-5.6-terra",
            config=config,
            available_models=available_models
        )
        
        assert isinstance(client, DummyLLMClient)
    
    def test_create_client_api_key_not_in_env(self):
        """Test qu'un DummyLLMClient est retourné si la clé API n'est pas dans l'environnement."""
        config = {"api_key_env_var": "OPENAI_API_KEY"}
        available_models = [
            {"api_identifier": "gpt-5.6-terra", "display_name": "GPT-5.2", "client_type": "openai"}
        ]
        
        with patch.dict(os.environ, {}, clear=True):
            client = LLMClientFactory.create_client(
                model_id="gpt-5.6-terra",
                config=config,
                available_models=available_models
            )
        
        assert isinstance(client, DummyLLMClient)
    
    @patch('factories.llm_factory.OpenAIClient')
    def test_create_openai_client_success(self, mock_openai_client_class):
        """Test la création réussie d'un OpenAIClient."""
        mock_client = MagicMock()
        mock_openai_client_class.return_value = mock_client
        
        config = {
            "api_key_env_var": "OPENAI_API_KEY",
            "temperature": 0.7,
            "max_tokens": 1500
        }
        available_models = [
            {
                "api_identifier": "gpt-5.6-luna",
                "display_name": "GPT-4o Mini",
                "client_type": "openai"
            }
        ]
        
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key-123"}):
            client = LLMClientFactory.create_client(
                model_id="gpt-5.6-luna",
                config=config,
                available_models=available_models
            )
        
        assert isinstance(client, MagicMock)  # Le mock retourné
        mock_openai_client_class.assert_called_once()
        call_kwargs = mock_openai_client_class.call_args[1]
        assert call_kwargs["api_key"] == "test-key-123"
        assert call_kwargs["config"]["default_model"] == "gpt-5.6-luna"
        assert call_kwargs["config"]["temperature"] == 0.7
    
    @patch('factories.llm_factory.OpenAIClient')
    def test_create_openai_client_with_model_parameters(self, mock_openai_client_class):
        """Test la création d'un OpenAIClient avec paramètres de modèle."""
        mock_client = MagicMock()
        mock_openai_client_class.return_value = mock_client
        
        config = {
            "api_key_env_var": "OPENAI_API_KEY",
            "temperature": 0.5,  # Sera écrasé par le paramètre du modèle
            "max_tokens": 2000
        }
        available_models = [
            {
                "api_identifier": "gpt-5.6-terra",
                "display_name": "GPT-4o",
                "client_type": "openai",
                "parameters": {
                    "default_temperature": 0.8,
                    "max_tokens": 3000
                }
            }
        ]
        
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key-456"}):
            client = LLMClientFactory.create_client(
                model_id="gpt-5.6-terra",
                config=config,
                available_models=available_models
            )
        
        call_kwargs = mock_openai_client_class.call_args[1]
        assert call_kwargs["config"]["default_model"] == "gpt-5.6-terra"
        assert call_kwargs["config"]["temperature"] == 0.8  # Du paramètre du modèle
        assert call_kwargs["config"]["max_tokens"] == 3000  # Du paramètre du modèle
    
    def test_create_client_uses_model_identifier_fallback(self):
        """Test que model_identifier est utilisé si api_identifier n'est pas présent."""
        config = {"api_key_env_var": "OPENAI_API_KEY"}
        available_models = [
            {
                "model_identifier": "gpt-5.6-luna",  # Pas d'api_identifier
                "display_name": "GPT-4o Mini",
                "client_type": "openai"
            }
        ]
        
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            with patch('factories.llm_factory.OpenAIClient') as mock_openai:
                mock_openai.return_value = MagicMock()
                client = LLMClientFactory.create_client(
                    model_id="gpt-5.6-luna",
                    config=config,
                    available_models=available_models
                )
        
        call_kwargs = mock_openai.call_args[1]
        assert call_kwargs["config"]["default_model"] == "gpt-5.6-luna"
    
    def test_create_client_default_client_type_openai(self):
        """Test que client_type par défaut est 'openai'."""
        config = {"api_key_env_var": "OPENAI_API_KEY"}
        available_models = [
            {
                "api_identifier": "gpt-5.6-luna",
                "display_name": "GPT-4o Mini"
                # Pas de client_type, devrait utiliser "openai" par défaut
            }
        ]
        
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            with patch('factories.llm_factory.OpenAIClient') as mock_openai:
                mock_openai.return_value = MagicMock()
                client = LLMClientFactory.create_client(
                    model_id="gpt-5.6-luna",
                    config=config,
                    available_models=available_models
                )
        
        # Si on arrive ici sans exception, c'est que client_type="openai" a été utilisé
        assert mock_openai.called
    
    @patch('factories.llm_factory.OpenAIClient')
    def test_create_client_openai_exception_falls_back_to_dummy(self, mock_openai_client_class):
        """Test qu'une exception lors de la création d'OpenAIClient retourne DummyLLMClient."""
        mock_openai_client_class.side_effect = ValueError("Test error")
        
        config = {"api_key_env_var": "OPENAI_API_KEY"}
        available_models = [
            {
                "api_identifier": "gpt-5.6-luna",
                "display_name": "GPT-4o Mini",
                "client_type": "openai"
            }
        ]
        
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            client = LLMClientFactory.create_client(
                model_id="gpt-5.6-luna",
                config=config,
                available_models=available_models
            )
        
        assert isinstance(client, DummyLLMClient)
    
    def test_create_client_unknown_client_type(self):
        """Test qu'un DummyLLMClient est retourné pour un type de client inconnu."""
        config = {"api_key_env_var": "OPENAI_API_KEY"}
        available_models = [
            {
                "api_identifier": "some-model",
                "display_name": "Some Model",
                "client_type": "unknown_type"
            }
        ]
        
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            client = LLMClientFactory.create_client(
                model_id="some-model",
                config=config,
                available_models=available_models
            )
        
        assert isinstance(client, DummyLLMClient)

    @patch('factories.llm_factory.MistralClient')
    def test_create_mistral_client_success(self, mock_mistral_client_class):
        """Test la création réussie d'un MistralClient."""
        mock_client = MagicMock()
        mock_mistral_client_class.return_value = mock_client
        
        config = {
            "mistral_api_key_env_var": "MISTRAL_API_KEY",
            "temperature": 0.7,
            "max_tokens": 32000
        }
        available_models = [
            {
                "api_identifier": "labs-mistral-small-creative",
                "display_name": "Mistral Small Creative",
                "client_type": "mistral"
            }
        ]
        
        with patch.dict(os.environ, {"MISTRAL_API_KEY": "test-mistral-key"}):
            client = LLMClientFactory.create_client(
                model_id="labs-mistral-small-creative",
                config=config,
                available_models=available_models
            )
        
        assert isinstance(client, MagicMock)  # Le mock retourné
        mock_mistral_client_class.assert_called_once()
        call_kwargs = mock_mistral_client_class.call_args[1]
        assert call_kwargs["api_key"] == "test-mistral-key"
        assert call_kwargs["config"]["default_model"] == "labs-mistral-small-creative"

    @patch('factories.llm_factory.MistralClient')
    def test_create_mistral_client_with_model_parameters(self, mock_mistral_client_class):
        """Test la création d'un MistralClient avec paramètres de modèle."""
        mock_client = MagicMock()
        mock_mistral_client_class.return_value = mock_client
        
        config = {
            "mistral_api_key_env_var": "MISTRAL_API_KEY",
            "temperature": 0.5,  # Sera écrasé par le paramètre du modèle
            "max_tokens": 10000
        }
        available_models = [
            {
                "api_identifier": "labs-mistral-small-creative",
                "display_name": "Mistral Small Creative",
                "client_type": "mistral",
                "parameters": {
                    "default_temperature": 0.7,
                    "max_tokens": 32000
                }
            }
        ]
        
        with patch.dict(os.environ, {"MISTRAL_API_KEY": "test-mistral-key-456"}):
            client = LLMClientFactory.create_client(
                model_id="labs-mistral-small-creative",
                config=config,
                available_models=available_models
            )
        
        call_kwargs = mock_mistral_client_class.call_args[1]
        assert call_kwargs["config"]["default_model"] == "labs-mistral-small-creative"
        assert call_kwargs["config"]["temperature"] == 0.7  # Du paramètre du modèle
        assert call_kwargs["config"]["max_tokens"] == 32000  # Du paramètre du modèle

    def test_create_mistral_client_no_api_key_env_var(self):
        """Test qu'un DummyLLMClient est retourné si mistral_api_key_env_var n'est pas défini."""
        config = {}  # Pas de mistral_api_key_env_var
        available_models = [
            {
                "api_identifier": "labs-mistral-small-creative",
                "display_name": "Mistral Small Creative",
                "client_type": "mistral"
            }
        ]
        
        client = LLMClientFactory.create_client(
            model_id="mistral-small-creative",
            config=config,
            available_models=available_models
        )
        
        assert isinstance(client, DummyLLMClient)

    def test_create_mistral_client_api_key_not_in_env(self):
        """Test qu'un DummyLLMClient est retourné si la clé API Mistral n'est pas dans l'environnement."""
        config = {"mistral_api_key_env_var": "MISTRAL_API_KEY"}
        available_models = [
            {
                "api_identifier": "labs-mistral-small-creative",
                "display_name": "Mistral Small Creative",
                "client_type": "mistral"
            }
        ]
        
        with patch.dict(os.environ, {}, clear=True):
            client = LLMClientFactory.create_client(
                model_id="labs-mistral-small-creative",
                config=config,
                available_models=available_models
            )
        
        assert isinstance(client, DummyLLMClient)

    @patch('factories.llm_factory.MistralClient')
    def test_create_mistral_client_exception_falls_back_to_dummy(self, mock_mistral_client_class):
        """Test qu'une exception lors de la création de MistralClient retourne DummyLLMClient."""
        mock_mistral_client_class.side_effect = ValueError("Test error")
        
        config = {"mistral_api_key_env_var": "MISTRAL_API_KEY"}
        available_models = [
            {
                "api_identifier": "labs-mistral-small-creative",
                "display_name": "Mistral Small Creative",
                "client_type": "mistral"
            }
        ]
        
        with patch.dict(os.environ, {"MISTRAL_API_KEY": "test-key"}):
            client = LLMClientFactory.create_client(
                model_id="labs-mistral-small-creative",
                config=config,
                available_models=available_models
            )
        
        assert isinstance(client, DummyLLMClient)






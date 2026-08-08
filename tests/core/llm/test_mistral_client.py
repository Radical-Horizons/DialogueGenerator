"""Tests unitaires pour MistralClient."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pydantic import BaseModel
from core.llm.mistral_client import MistralClient
from core.llm.llm_client import ILLMClient


class DummyResponseModel(BaseModel):
    """Modèle de réponse pour les tests."""
    title: str
    content: str


class TestMistralClient:
    """Tests pour MistralClient."""

    @pytest.fixture
    def mock_mistral_config(self):
        """Configuration mock pour les tests."""
        return {
            "default_model": "mistralai/mistral-medium-3-5",
            "temperature": 0.7,
            "max_tokens": 32000,
            "system_prompt_template": "Tu es un assistant expert."
        }

    @pytest.fixture
    def mistral_client(self, mock_mistral_config):
        """Crée un client Mistral mocké pour les tests."""
        with patch('core.llm.mistral_client.Mistral') as mock_mistral_class:
            mock_mistral_instance = MagicMock()
            mock_mistral_class.return_value = mock_mistral_instance
            
            client = MistralClient(
                api_key="test-mistral-key",
                config=mock_mistral_config
            )
            client.client = mock_mistral_instance
            return client

    def test_mistral_client_implements_illm_client(self, mistral_client):
        """Test que MistralClient implémente ILLMClient."""
        assert isinstance(mistral_client, ILLMClient)

    def test_mistral_client_initialization(self):
        """Test l'initialisation de MistralClient."""
        config = {
            "default_model": "mistralai/mistral-medium-3-5",
            "temperature": 0.7,
            "max_tokens": 32000
        }
        
        with patch('core.llm.mistral_client.Mistral') as mock_mistral_class:
            mock_mistral_instance = MagicMock()
            mock_mistral_class.return_value = mock_mistral_instance
            
            client = MistralClient(api_key="test-key", config=config)
            
            assert client.model_name == "mistralai/mistral-medium-3-5"
            assert client.temperature == 0.7
            assert client.max_tokens == 32000
            mock_mistral_class.assert_called_once_with(api_key="test-key")

    def test_mistral_client_missing_api_key(self):
        """Test que MistralClient lève une erreur si la clé API est manquante."""
        with patch.dict('os.environ', {}, clear=True):
            with pytest.raises(ValueError, match="Clé API Mistral non fournie"):
                MistralClient(api_key=None, config={})

    @pytest.mark.asyncio
    async def test_generate_variants_text_mode(self, mistral_client):
        """Test la génération de variantes en mode texte simple."""
        # Mock de la réponse Mistral (mode texte)
        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        mock_message.content = "Ceci est une variante de test générée par Mistral."
        mock_choice.message = mock_message
        mock_response.choices = [mock_choice]
        
        mistral_client.client.chat.complete_async = AsyncMock(return_value=mock_response)
        
        # Appel de la méthode
        results = await mistral_client.generate_variants(
            prompt="Test prompt",
            k=1,
            response_model=None
        )
        
        # Vérifications
        assert len(results) == 1
        assert results[0] == "Ceci est une variante de test générée par Mistral."
        mistral_client.client.chat.complete_async.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_variants_structured_output(self, mistral_client):
        """Test la génération de variantes avec structured output."""
        # Mock de la réponse Mistral (mode structured output)
        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        mock_tool_call = MagicMock()
        mock_function = MagicMock()
        mock_function.name = "generate_interaction"
        mock_function.arguments = '{"title": "Test Title", "content": "Test Content"}'
        mock_tool_call.function = mock_function
        mock_message.tool_calls = [mock_tool_call]
        mock_choice.message = mock_message
        mock_response.choices = [mock_choice]
        
        mistral_client.client.chat.complete_async = AsyncMock(return_value=mock_response)
        
        # Appel de la méthode
        results = await mistral_client.generate_variants(
            prompt="Test prompt structured",
            k=1,
            response_model=DummyResponseModel
        )
        
        # Vérifications
        assert len(results) == 1
        assert isinstance(results[0], DummyResponseModel)
        assert results[0].title == "Test Title"
        assert results[0].content == "Test Content"

    @pytest.mark.asyncio
    async def test_generate_variants_multiple(self, mistral_client):
        """Test la génération de plusieurs variantes."""
        # Mock pour retourner des réponses différentes à chaque appel
        mock_responses = []
        for i in range(3):
            mock_response = MagicMock()
            mock_choice = MagicMock()
            mock_message = MagicMock()
            mock_message.content = f"Variante {i+1}"
            mock_choice.message = mock_message
            mock_response.choices = [mock_choice]
            mock_responses.append(mock_response)
        
        mistral_client.client.chat.complete_async = AsyncMock(side_effect=mock_responses)
        
        # Appel de la méthode
        results = await mistral_client.generate_variants(
            prompt="Test prompt",
            k=3,
            response_model=None
        )
        
        # Vérifications
        assert len(results) == 3
        assert results[0] == "Variante 1"
        assert results[1] == "Variante 2"
        assert results[2] == "Variante 3"
        assert mistral_client.client.chat.complete_async.call_count == 3

    @pytest.mark.asyncio
    async def test_generate_variants_api_error(self, mistral_client):
        """Test la gestion des erreurs API Mistral."""
        try:
            from mistralai.client.errors import SDKError
        except ImportError:
            from mistralai.models import SDKError

        # Mock d'une erreur API (SDKError nécessite un raw_response)
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_error = SDKError(message="Mistral API unavailable", raw_response=mock_response)
        
        mistral_client.client.chat.complete_async = AsyncMock(
            side_effect=mock_error
        )
        
        # Appel de la méthode
        results = await mistral_client.generate_variants(
            prompt="Test prompt",
            k=1,
            response_model=None
        )
        
        # Vérifications: le client doit retourner un message d'erreur clair
        assert len(results) == 1
        assert "Mistral API unavailable" in str(results[0])

    @pytest.mark.asyncio
    async def test_generate_variants_with_streaming(self, mistral_client):
        """Test que le streaming fonctionne (compatible Story 0.2)."""
        # Mock de la réponse Mistral en mode streaming
        async def mock_stream():
            """Générateur async simulant un stream."""
            chunks = [
                MagicMock(choices=[MagicMock(delta=MagicMock(content="Ceci "))]),
                MagicMock(choices=[MagicMock(delta=MagicMock(content="est "))]),
                MagicMock(choices=[MagicMock(delta=MagicMock(content="un test."))]),
            ]
            for chunk in chunks:
                yield chunk
        
        mistral_client.client.chat.stream_async = AsyncMock(return_value=mock_stream())
        
        # Appel en mode streaming (param stream=True)
        results = await mistral_client.generate_variants(
            prompt="Test prompt",
            k=1,
            response_model=None,
            stream=True
        )
        
        # Vérifications: le client doit accumuler les chunks
        assert len(results) == 1
        assert results[0] == "Ceci est un test."

    def test_get_max_tokens(self, mistral_client):
        """Test que get_max_tokens retourne la limite correcte."""
        max_tokens = mistral_client.get_max_tokens()
        assert max_tokens == 32000  # Mistral Small Creative supporte 32k tokens

    @pytest.mark.asyncio
    async def test_close(self, mistral_client):
        """Test que close() ferme correctement le client."""
        mistral_client.client.close = MagicMock()
        
        await mistral_client.close()
        
        mistral_client.client.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_variants_with_context(self, mistral_client):
        """Test la génération avec contexte de dialogue précédent."""
        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        mock_message.content = "Réponse avec contexte"
        mock_choice.message = mock_message
        mock_response.choices = [mock_choice]
        
        mistral_client.client.chat.complete_async = AsyncMock(return_value=mock_response)
        
        # Appel avec contexte
        previous_context = [
            {"role": "user", "content": "Question précédente"},
            {"role": "assistant", "content": "Réponse précédente"}
        ]
        
        results = await mistral_client.generate_variants(
            prompt="Nouvelle question",
            k=1,
            response_model=None,
            previous_dialogue_context=previous_context
        )
        
        # Vérifications: le contexte doit être passé à l'API
        assert len(results) == 1
        call_args = mistral_client.client.chat.complete_async.call_args
        messages = call_args[1]["messages"]
        assert len(messages) >= 3  # system + contexte + nouveau message

    @pytest.mark.asyncio
    async def test_generate_variants_validation_error(self, mistral_client):
        """Test la gestion des erreurs de validation Pydantic."""
        # Mock d'une réponse avec JSON invalide
        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        mock_tool_call = MagicMock()
        mock_function = MagicMock()
        mock_function.name = "generate_interaction"
        mock_function.arguments = '{"invalid": "data"}'  # Ne correspond pas au modèle
        mock_tool_call.function = mock_function
        mock_message.tool_calls = [mock_tool_call]
        mock_choice.message = mock_message
        mock_response.choices = [mock_choice]
        
        mistral_client.client.chat.complete_async = AsyncMock(return_value=mock_response)
        
        # Appel de la méthode
        results = await mistral_client.generate_variants(
            prompt="Test prompt",
            k=1,
            response_model=DummyResponseModel
        )
        
        # Vérifications: doit retourner un message d'erreur
        assert len(results) == 1
        assert "Erreur de validation" in str(results[0])

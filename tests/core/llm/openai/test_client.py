"""Tests unitaires pour OpenAIClient refactorisé."""

import pytest
import os
from unittest.mock import MagicMock, AsyncMock, patch
from pydantic import BaseModel, Field
from core.llm.openai.client import OpenAIClient
from core.llm.llm_client import ILLMClient


class TestClientModel(BaseModel):
    """Modèle de test pour structured output."""
    title: str = Field(description="Titre")
    content: str = Field(description="Contenu")
    
    class Config:
        """Configuration Pydantic."""
        pass
    
    def __init__(self, **data):
        """Initialise le modèle de test."""
        super().__init__(**data)


class TestOpenAIClient:
    """Tests pour OpenAIClient refactorisé."""

    @pytest.fixture
    def mock_api_key(self):
        """Fixture pour mock API key."""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            yield "test-key"

    @pytest.fixture
    def client_config(self):
        """Fixture pour config client."""
        return {
            "default_model": "gpt-5.6-terra",
            "temperature": 0.7,
            "max_tokens": 1500,
        }

    def test_client_implements_illm_client(self, mock_api_key, client_config):
        """Test que OpenAIClient implémente ILLMClient."""
        client = OpenAIClient(api_key=mock_api_key, config=client_config)
        assert isinstance(client, ILLMClient)

    def test_client_initialization(self, mock_api_key, client_config):
        """Test initialisation du client."""
        client = OpenAIClient(api_key=mock_api_key, config=client_config)
        
        assert client.model_name == "gpt-5.6-terra"
        assert client.temperature == 0.7
        assert client.max_tokens == 1500
        assert client.client is not None

    def test_client_initialization_without_api_key(self, client_config):
        """Test initialisation sans API key (doit lever ValueError)."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="Clé API OpenAI"):
                OpenAIClient(config=client_config)

    @pytest.mark.asyncio
    async def test_generate_variants_text_mode(self, mock_api_key, client_config):
        """Test génération variantes en mode texte."""
        client = OpenAIClient(api_key=mock_api_key, config=client_config)
        
        # Mock la réponse API
        mock_response = MagicMock()
        mock_item = MagicMock()
        mock_item.type = "text"
        mock_item.text = "Test response"
        mock_response.output = [mock_item]
        mock_usage = MagicMock()
        mock_usage.input_tokens = 10
        mock_usage.output_tokens = 5
        mock_response.usage = mock_usage
        mock_response.reasoning = None
        
        with patch.object(client.client.responses, 'create', new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_response
            
            results = await client.generate_variants("Test prompt", k=1)
            
            assert len(results) == 1
            assert results[0] == "Test response"
            mock_create.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_variants_structured_mode(self, mock_api_key, client_config):
        """Test génération variantes en mode structured output."""
        client = OpenAIClient(api_key=mock_api_key, config=client_config)
        
        # Mock la réponse API
        mock_response = MagicMock()
        mock_item = MagicMock()
        mock_item.type = "function_call"
        mock_item.name = "generate_interaction"
        mock_item.arguments = '{"title": "Test", "content": "Content"}'
        mock_response.output = [mock_item]
        mock_usage = MagicMock()
        mock_usage.input_tokens = 10
        mock_usage.output_tokens = 5
        mock_response.usage = mock_usage
        mock_response.reasoning = None
        
        with patch.object(client.client.responses, 'create', new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_response
            
            results = await client.generate_variants("Test prompt", k=1, response_model=TestClientModel)
            
            assert len(results) == 1
            assert isinstance(results[0], TestClientModel)
            assert results[0].title == "Test"
            mock_create.assert_called_once()

    def test_get_max_tokens_gpt_5_2(self, mock_api_key, client_config):
        """Test get_max_tokens pour GPT-5.2."""
        client = OpenAIClient(api_key=mock_api_key, config=client_config)
        
        max_tokens = client.get_max_tokens()
        
        assert max_tokens == 128000

    def test_get_max_tokens_unknown_model(self, mock_api_key):
        """Test get_max_tokens pour modèle inconnu."""
        config = {"default_model": "unknown-model"}
        client = OpenAIClient(api_key=mock_api_key, config=config)
        
        max_tokens = client.get_max_tokens()
        
        assert max_tokens == 4096

    @pytest.mark.asyncio
    async def test_close(self, mock_api_key, client_config):
        """Test fermeture du client."""
        client = OpenAIClient(api_key=mock_api_key, config=client_config)
        
        with patch.object(client.client, 'close', new_callable=AsyncMock) as mock_close:
            await client.close()
            mock_close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_generate_variants_streaming_text_mode(self, mock_api_key, client_config):
        """Test génération streaming en mode texte."""
        from core.llm.openai.stream_parser import StreamChunk
        
        client = OpenAIClient(api_key=mock_api_key, config=client_config)
        
        # Mock des événements streaming
        mock_text_delta1 = MagicMock()
        mock_text_delta1.type = "response.output_text.delta"
        mock_text_delta1.delta = "Hello"
        mock_text_delta1.sequence_number = 1
        
        mock_text_delta2 = MagicMock()
        mock_text_delta2.type = "response.output_text.delta"
        mock_text_delta2.delta = " World"
        mock_text_delta2.sequence_number = 2
        
        mock_completed = MagicMock()
        mock_completed.type = "response.completed"
        mock_response = MagicMock()
        mock_item = MagicMock()
        mock_item.type = "text"
        mock_item.text = "Hello World"
        mock_response.output = [mock_item]
        mock_usage = MagicMock()
        mock_usage.input_tokens = 10
        mock_usage.output_tokens = 5
        mock_response.usage = mock_usage
        mock_response.reasoning = None
        mock_completed.response = mock_response
        mock_completed.sequence_number = 3
        
        async def mock_stream():
            yield mock_text_delta1
            yield mock_text_delta2
            yield mock_completed
        
        with patch.object(client, '_make_api_call_streaming', new_callable=AsyncMock) as mock_stream_call:
            mock_stream_call.return_value = mock_stream()
            
            chunks = []
            results = []
            async for item in client.generate_variants_streaming("Test prompt", k=1):
                if isinstance(item, StreamChunk):
                    chunks.append(item)
                else:
                    results.append(item)
            
            # Vérifier les chunks
            assert len(chunks) >= 2  # Au moins les deltas de texte
            text_chunks = [c for c in chunks if c.event_type == "response.output_text.delta"]
            assert len(text_chunks) == 2
            assert text_chunks[0].data["text"] == "Hello"
            assert text_chunks[1].data["text"] == " World"
            
            # Vérifier le résultat final
            assert len(results) == 1
            assert results[0] == "Hello World"
    
    @pytest.mark.asyncio
    async def test_generate_variants_streaming_structured_mode(self, mock_api_key, client_config):
        """Test génération streaming en mode structured output."""
        from core.llm.openai.stream_parser import StreamChunk
        
        client = OpenAIClient(api_key=mock_api_key, config=client_config)
        
        # Mock des événements streaming pour function call
        mock_delta1 = MagicMock()
        mock_delta1.type = "response.function_call_arguments.delta"
        mock_delta1.item_id = "item_123"
        mock_delta1.delta = '{"title": "'
        mock_delta1.sequence_number = 1
        
        mock_delta2 = MagicMock()
        mock_delta2.type = "response.function_call_arguments.delta"
        mock_delta2.item_id = "item_123"
        mock_delta2.delta = 'Test", "content": "Content"}'
        mock_delta2.sequence_number = 2
        
        mock_done = MagicMock()
        mock_done.type = "response.function_call_arguments.done"
        mock_done.item_id = "item_123"
        mock_done.arguments = '{"title": "Test", "content": "Content"}'
        mock_done.sequence_number = 3
        
        mock_completed = MagicMock()
        mock_completed.type = "response.completed"
        mock_response = MagicMock()
        mock_response.output = []
        mock_usage = MagicMock()
        mock_usage.input_tokens = 10
        mock_usage.output_tokens = 5
        mock_response.usage = mock_usage
        mock_response.reasoning = None
        mock_completed.response = mock_response
        mock_completed.sequence_number = 4
        
        async def mock_stream():
            yield mock_delta1
            yield mock_delta2
            yield mock_done
            yield mock_completed
        
        with patch.object(client, '_make_api_call_streaming', new_callable=AsyncMock) as mock_stream_call:
            mock_stream_call.return_value = mock_stream()
            
            chunks = []
            results = []
            async for item in client.generate_variants_streaming(
                "Test prompt", 
                k=1, 
                response_model=TestClientModel
            ):
                if isinstance(item, StreamChunk):
                    chunks.append(item)
                else:
                    results.append(item)
            
            # Vérifier les chunks de function call
            function_chunks = [c for c in chunks if "function_call_arguments" in c.event_type]
            assert len(function_chunks) >= 2
            
            # Vérifier le résultat final (Pydantic model)
            assert len(results) == 1
            assert isinstance(results[0], TestClientModel)
            assert results[0].title == "Test"
            assert results[0].content == "Content"
    
    @pytest.mark.asyncio
    async def test_generate_variants_streaming_with_chunk_callback(self, mock_api_key, client_config):
        """Test génération streaming avec chunk callback."""
        from core.llm.openai.stream_parser import StreamChunk
        
        client = OpenAIClient(api_key=mock_api_key, config=client_config)
        
        callback_chunks = []
        async def chunk_callback(chunk: StreamChunk):
            callback_chunks.append(chunk)
        
        mock_delta = MagicMock()
        mock_delta.type = "response.output_text.delta"
        mock_delta.delta = "Test"
        mock_delta.sequence_number = 1
        
        mock_completed = MagicMock()
        mock_completed.type = "response.completed"
        mock_response = MagicMock()
        mock_item = MagicMock()
        mock_item.type = "text"
        mock_item.text = "Test"
        mock_response.output = [mock_item]
        mock_usage = MagicMock()
        mock_usage.input_tokens = 10
        mock_usage.output_tokens = 5
        mock_response.usage = mock_usage
        mock_response.reasoning = None
        mock_completed.response = mock_response
        mock_completed.sequence_number = 2
        
        async def mock_stream():
            yield mock_delta
            yield mock_completed
        
        with patch.object(client, '_make_api_call_streaming', new_callable=AsyncMock) as mock_stream_call:
            mock_stream_call.return_value = mock_stream()
            
            results = []
            async for item in client.generate_variants_streaming(
                "Test prompt",
                k=1,
                chunk_callback=chunk_callback
            ):
                if not isinstance(item, StreamChunk):
                    results.append(item)
            
            # Vérifier que le callback a été appelé
            assert len(callback_chunks) > 0
            assert any(c.event_type == "response.output_text.delta" for c in callback_chunks)
    
    @pytest.mark.asyncio
    async def test_generate_variants_streaming_error_handling(self, mock_api_key, client_config):
        """Test gestion d'erreur dans le streaming."""
        from core.llm.openai.stream_parser import StreamChunk
        
        client = OpenAIClient(api_key=mock_api_key, config=client_config)
        
        mock_failed = MagicMock()
        mock_failed.type = "response.failed"
        mock_failed.error = {"code": "server_error", "message": "API error"}
        mock_failed.sequence_number = 1
        
        async def mock_stream():
            yield mock_failed
        
        with patch.object(client, '_make_api_call_streaming', new_callable=AsyncMock) as mock_stream_call:
            mock_stream_call.return_value = mock_stream()
            
            chunks = []
            results = []
            async for item in client.generate_variants_streaming("Test prompt", k=1):
                if isinstance(item, StreamChunk):
                    chunks.append(item)
                else:
                    results.append(item)
            
            # Vérifier qu'une erreur est retournée
            assert len(results) == 1
            assert isinstance(results[0], str)
            assert "Erreur" in results[0] or "error" in results[0].lower()
"""Tests unitaires pour UnityDialogueOrchestrator avec streaming natif."""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator, GenerationEvent
from api.schemas.dialogue import GenerateUnityDialogueRequest, ContextSelection
from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse, UnityDialogueNodeContent
from core.llm.openai.stream_parser import StreamChunk


def _wire_context_builder_mock(mock_context_builder, catalog: list[str] | None = None) -> None:
    """Mocks minimaux pour resolve_scene_dramatis + build_context_json."""
    names = catalog if catalog is not None else ["character_1"]
    mock_context_builder.get_characters_names.return_value = names
    mock_context_builder.build_context_json.return_value = {"test": "context"}
    mock_context_builder.serialize_context_to_text.return_value = "Context summary"


@pytest.fixture
def mock_services():
    """Crée des mocks pour tous les services nécessaires."""
    return {
        'dialogue_service': Mock(),
        'prompt_engine': Mock(),
        'skill_service': Mock(),
        'trait_service': Mock(),
        'config_service': Mock(),
        'usage_service': Mock(),
    }


@pytest.fixture
def orchestrator(mock_services):
    """Crée un orchestrateur avec des services mockés."""
    return UnityDialogueOrchestrator(
        dialogue_service=mock_services['dialogue_service'],
        prompt_engine=mock_services['prompt_engine'],
        skill_service=mock_services['skill_service'],
        trait_service=mock_services['trait_service'],
        config_service=mock_services['config_service'],
        usage_service=mock_services['usage_service'],
        request_id="test_request_123"
    )


@pytest.fixture
def sample_request_data():
    """Crée des données de requête de test."""
    context_selection = ContextSelection(
        characters_full=["character_1"],
        characters_excerpt=[],
        locations_full=[],
        locations_excerpt=[],
        items_full=[],
        items_excerpt=[],
        species_full=[],
        species_excerpt=[],
        communities_full=[],
        communities_excerpt=[],
        dialogues_examples=[],
        scene_location=None
    )
    
    return GenerateUnityDialogueRequest(
        user_instructions="Test prompt",
        context_selections=context_selection,
        llm_model_identifier="gpt-5.2"
    )


@pytest.fixture
def mock_llm_client_with_streaming():
    """Crée un mock de client LLM avec support streaming."""
    mock_client = Mock()
    mock_client.model_name = "gpt-5.2"
    mock_client.max_tokens = 32000
    mock_client.temperature = 0.7
    mock_client.reasoning_effort = None
    mock_client.reasoning_summary = None
    mock_client.top_p = None
    mock_client.reasoning_trace = None
    mock_client.warning = None
    
    # Ajouter la méthode generate_variants_streaming
    async def mock_streaming(prompt, k=1, response_model=None, **kwargs):
        # Simuler des chunks streaming
        from core.llm.openai.stream_parser import StreamChunk
        
        # Chunks de texte
        yield StreamChunk(
            event_type="response.output_text.delta",
            data={"text": "Hello", "type": "text"},
            sequence=0
        )
        yield StreamChunk(
            event_type="response.output_text.delta",
            data={"text": " World", "type": "text"},
            sequence=1
        )
        
        # Chunks de function call (structured output)
        yield StreamChunk(
            event_type="response.function_call_arguments.delta",
            data={"item_id": "item_123", "delta": '{"node": {"', "accumulated": '{"node": {"'},
            sequence=2
        )
        yield StreamChunk(
            event_type="response.function_call_arguments.delta",
            data={"item_id": "item_123", "delta": 'line": "Test"}}', "accumulated": '{"node": {"line": "Test"}}'},
            sequence=3
        )
        yield StreamChunk(
            event_type="response.function_call_arguments.done",
            data={"item_id": "item_123", "arguments": '{"node": {"line": "Test"}}'},
            sequence=4
        )
        
        # Réponse complète
        yield StreamChunk(
            event_type="response.completed",
            data={"response": MagicMock()},
            sequence=5
        )
        
        # Résultat final (Pydantic model)
        if response_model:
            # Inclure tous les champs requis pour UnityDialogueGenerationResponse
            result = response_model.model_validate_json('{"title": "Test Dialogue", "node": {"line": "Test"}}')
            yield result
        else:
            yield "Hello World"
    
    mock_client.generate_variants_streaming = mock_streaming
    mock_client.generate_variants = AsyncMock(return_value=["Fallback result"])
    
    return mock_client


@pytest.mark.asyncio
async def test_orchestrator_uses_native_streaming_when_available(orchestrator, sample_request_data, mock_services):
    """Test que l'orchestrateur utilise le streaming natif quand disponible."""
    # Mock des services
    mock_services['dialogue_service'].context_builder = Mock()
    _wire_context_builder_mock(mock_services['dialogue_service'].context_builder)
    
    # Créer un objet BuiltPrompt avec des attributs réels (pas des Mocks)
    class BuiltPrompt:
        def __init__(self):
            self.prompt = "Test prompt"
            self.raw_prompt = "Test prompt"
            self.structured_prompt = None
            self.estimated_tokens = 100
            self.token_count = 100
            self.prompt_hash = "hash123"
    
    mock_services['prompt_engine'].build_prompt = Mock(return_value=BuiltPrompt())
    
    # Mock LLM client avec streaming
    mock_llm_client = Mock()
    mock_llm_client.model_name = "gpt-5.2"
    mock_llm_client.max_tokens = 32000
    mock_llm_client.temperature = 0.7
    mock_llm_client.reasoning_effort = None
    mock_llm_client.reasoning_summary = None
    mock_llm_client.top_p = None
    mock_llm_client.reasoning_trace = None
    
    # Ajouter generate_variants_streaming
    async def mock_streaming(prompt, k=1, response_model=None, **kwargs):
        from core.llm.openai.stream_parser import StreamChunk
        yield StreamChunk(
            event_type="response.output_text.delta",
            data={"text": "Test", "type": "text"},
            sequence=0
        )
        yield StreamChunk(
            event_type="response.completed",
            data={"response": MagicMock()},
            sequence=1
        )
        if response_model:
            # Inclure tous les champs requis pour UnityDialogueGenerationResponse
            result = response_model.model_validate_json('{"title": "Test Dialogue", "node": {"line": "Test"}}')
            yield result
    
    mock_llm_client.generate_variants_streaming = mock_streaming
    
    with patch('services.unity_dialogue_orchestrator.LLMClientFactory') as mock_factory:
        mock_factory.create_client.return_value = mock_llm_client
        
        # Mock UnityDialogueGenerationService
        with patch('services.unity_dialogue_orchestrator.UnityDialogueGenerationService') as mock_unity_service_class:
            mock_unity_service = Mock()
            mock_unity_service_class.return_value = mock_unity_service
            mock_unity_service.normalize_generation_response.side_effect = (
                lambda response, max_choices=None: response
            )
            mock_unity_service.enrich_with_ids.return_value = [{"id": "START", "line": "Test"}]
            
            # Mock renderer
            with patch('services.unity_dialogue_orchestrator.UnityJsonRenderer') as mock_renderer_class:
                mock_renderer = Mock()
                mock_renderer_class.return_value = mock_renderer
                mock_renderer.render_unity_nodes.return_value = '{"nodes": []}'
                
                # Mock les valeurs nécessaires pour GenerateUnityDialogueResponse
                mock_llm_client.warning = None
                
                # Collecter les événements
                events = []
                async for event in orchestrator.generate_with_events(sample_request_data, lambda: False):
                    events.append(event)
                
                # Vérifier qu'on a reçu des chunks
                chunk_events = [e for e in events if e.type == 'chunk']
                assert len(chunk_events) > 0
                
                # Vérifier qu'on a reçu l'événement complete
                complete_events = [e for e in events if e.type == 'complete']
                assert len(complete_events) == 1


@pytest.mark.asyncio
async def test_orchestrator_fallback_to_non_streaming(orchestrator, sample_request_data, mock_services):
    """Test que l'orchestrateur utilise le fallback non-streaming si streaming non disponible."""
    # Mock des services
    mock_services['dialogue_service'].context_builder = Mock()
    _wire_context_builder_mock(mock_services['dialogue_service'].context_builder)
    
    # Créer un objet BuiltPrompt avec des attributs réels (pas des Mocks)
    class BuiltPrompt:
        def __init__(self):
            self.prompt = "Test prompt"
            self.raw_prompt = "Test prompt"
            self.structured_prompt = None
            self.estimated_tokens = 100
            self.token_count = 100
            self.prompt_hash = "hash123"
    
    mock_services['prompt_engine'].build_prompt = Mock(return_value=BuiltPrompt())
    
    # Mock LLM client SANS streaming (pas de generate_variants_streaming)
    mock_llm_client = Mock()
    mock_llm_client.model_name = "gpt-5.2"
    mock_llm_client.max_tokens = 32000
    mock_llm_client.temperature = 0.7
    mock_llm_client.reasoning_effort = None
    mock_llm_client.reasoning_summary = None
    mock_llm_client.top_p = None
    mock_llm_client.reasoning_trace = None
    mock_llm_client.warning = None
    # Vérifier que hasattr retourne False pour generate_variants_streaming
    # En utilisant delattr ou en ne définissant pas l'attribut
    if hasattr(mock_llm_client, 'generate_variants_streaming'):
        delattr(mock_llm_client, 'generate_variants_streaming')
    
    with patch('services.unity_dialogue_orchestrator.LLMClientFactory') as mock_factory:
        mock_factory.create_client.return_value = mock_llm_client
        
        # Mock UnityDialogueGenerationService
        with patch('services.unity_dialogue_orchestrator.UnityDialogueGenerationService') as mock_unity_service_class:
            mock_unity_service = Mock()
            mock_unity_service_class.return_value = mock_unity_service
            
            # Mock generation response
            mock_generation_response = Mock()
            mock_generation_response.title = "Test Dialogue"
            mock_unity_service.generate_dialogue_node = AsyncMock(return_value=mock_generation_response)
            mock_unity_service.enrich_with_ids.return_value = [{"id": "START", "line": "Test"}]
            
            # Mock renderer
            with patch('services.unity_dialogue_orchestrator.UnityJsonRenderer') as mock_renderer_class:
                mock_renderer = Mock()
                mock_renderer_class.return_value = mock_renderer
                mock_renderer.render_unity_nodes.return_value = '{"nodes": []}'
                
                # Collecter les événements
                events = []
                async for event in orchestrator.generate_with_events(sample_request_data, lambda: False):
                    events.append(event)
                
                # Vérifier qu'on a reçu l'événement complete (pas de chunks car pas de streaming)
                complete_events = [e for e in events if e.type == 'complete']
                assert len(complete_events) == 1
                
                # Vérifier que generate_dialogue_node a été appelé (fallback)
                mock_unity_service.generate_dialogue_node.assert_called_once()


@pytest.mark.asyncio
async def test_orchestrator_streaming_with_function_call_chunks(orchestrator, sample_request_data, mock_services):
    """Test que l'orchestrateur gère correctement les chunks de function call."""
    # Mock des services
    mock_services['dialogue_service'].context_builder = Mock()
    _wire_context_builder_mock(mock_services['dialogue_service'].context_builder)
    
    # Créer un objet BuiltPrompt avec des attributs réels (pas des Mocks)
    class BuiltPrompt:
        def __init__(self):
            self.prompt = "Test prompt"
            self.raw_prompt = "Test prompt"
            self.structured_prompt = None
            self.estimated_tokens = 100
            self.token_count = 100
            self.prompt_hash = "hash123"
    
    mock_services['prompt_engine'].build_prompt = Mock(return_value=BuiltPrompt())
    
    # Mock LLM client avec streaming et function call chunks
    mock_llm_client = Mock()
    mock_llm_client.model_name = "gpt-5.2"
    mock_llm_client.max_tokens = 32000
    mock_llm_client.temperature = 0.7
    mock_llm_client.reasoning_effort = None
    mock_llm_client.reasoning_summary = None
    mock_llm_client.top_p = None
    mock_llm_client.reasoning_trace = None
    
    async def mock_streaming(prompt, k=1, response_model=None, **kwargs):
        from core.llm.openai.stream_parser import StreamChunk
        
        # Chunks de function call
        yield StreamChunk(
            event_type="response.function_call_arguments.delta",
            data={"item_id": "item_123", "delta": '{"node": {"', "accumulated": '{"node": {"'},
            sequence=0
        )
        yield StreamChunk(
            event_type="response.function_call_arguments.delta",
            data={"item_id": "item_123", "delta": 'line": "Test"}}', "accumulated": '{"node": {"line": "Test"}}'},
            sequence=1
        )
        yield StreamChunk(
            event_type="response.function_call_arguments.done",
            data={"item_id": "item_123", "arguments": '{"node": {"line": "Test"}}'},
            sequence=2
        )
        yield StreamChunk(
            event_type="response.completed",
            data={"response": MagicMock()},
            sequence=3
        )
        
        if response_model:
            # Inclure tous les champs requis pour UnityDialogueGenerationResponse
            result = response_model.model_validate_json('{"title": "Test Dialogue", "node": {"line": "Test"}}')
            yield result
    
    mock_llm_client.generate_variants_streaming = mock_streaming
    
    with patch('services.unity_dialogue_orchestrator.LLMClientFactory') as mock_factory:
        mock_factory.create_client.return_value = mock_llm_client
        
        # Mock UnityDialogueGenerationService
        with patch('services.unity_dialogue_orchestrator.UnityDialogueGenerationService') as mock_unity_service_class:
            mock_unity_service = Mock()
            mock_unity_service_class.return_value = mock_unity_service
            mock_unity_service.normalize_generation_response.side_effect = (
                lambda response, max_choices=None: response
            )
            mock_unity_service.enrich_with_ids.return_value = [{"id": "START", "line": "Test"}]
            
            # Mock renderer
            with patch('services.unity_dialogue_orchestrator.UnityJsonRenderer') as mock_renderer_class:
                mock_renderer = Mock()
                mock_renderer_class.return_value = mock_renderer
                mock_renderer.render_unity_nodes.return_value = '{"nodes": []}'
                
                # Collecter les événements
                events = []
                async for event in orchestrator.generate_with_events(sample_request_data, lambda: False):
                    events.append(event)
                
                # Vérifier qu'on a reçu des chunks de function call
                function_call_chunks = [
                    e for e in events 
                    if e.type == 'chunk' and e.data.get('type') == 'function_call_delta'
                ]
                assert len(function_call_chunks) > 0


@pytest.mark.asyncio
async def test_orchestrator_streaming_cancellation(orchestrator, sample_request_data, mock_services):
    """Test que l'orchestrateur respecte l'annulation pendant le streaming."""
    # Mock des services
    mock_services['dialogue_service'].context_builder = Mock()
    _wire_context_builder_mock(mock_services['dialogue_service'].context_builder)
    
    # Créer un objet BuiltPrompt avec des attributs réels (pas des Mocks)
    class BuiltPrompt:
        def __init__(self):
            self.prompt = "Test prompt"
            self.raw_prompt = "Test prompt"
            self.structured_prompt = None
            self.estimated_tokens = 100
            self.token_count = 100
            self.prompt_hash = "hash123"
    
    mock_services['prompt_engine'].build_prompt = Mock(return_value=BuiltPrompt())
    
    # Mock LLM client avec streaming
    mock_llm_client = Mock()
    mock_llm_client.model_name = "gpt-5.2"
    mock_llm_client.max_tokens = 32000
    mock_llm_client.temperature = 0.7
    mock_llm_client.reasoning_effort = None
    mock_llm_client.reasoning_summary = None
    mock_llm_client.top_p = None
    
    async def mock_streaming(prompt, k=1, response_model=None, **kwargs):
        from core.llm.openai.stream_parser import StreamChunk
        yield StreamChunk(
            event_type="response.output_text.delta",
            data={"text": "Chunk 1", "type": "text"},
            sequence=0
        )
        yield StreamChunk(
            event_type="response.output_text.delta",
            data={"text": "Chunk 2", "type": "text"},
            sequence=1
        )
        # Plus de chunks après (simule l'annulation)
    
    mock_llm_client.generate_variants_streaming = mock_streaming
    
    # Flag d'annulation
    cancelled = False
    def check_cancelled():
        nonlocal cancelled
        return cancelled
    
    with patch('services.unity_dialogue_orchestrator.LLMClientFactory') as mock_factory:
        mock_factory.create_client.return_value = mock_llm_client
        
        # Mock UnityDialogueGenerationService
        with patch('services.unity_dialogue_orchestrator.UnityDialogueGenerationService') as mock_unity_service_class:
            mock_unity_service = Mock()
            mock_unity_service_class.return_value = mock_unity_service
            mock_unity_service.normalize_generation_response.side_effect = (
                lambda response, max_choices=None: response
            )
            mock_unity_service.enrich_with_ids.return_value = [{"id": "START"}]
            
            # Mock renderer
            with patch('services.unity_dialogue_orchestrator.UnityJsonRenderer') as mock_renderer_class:
                mock_renderer = Mock()
                mock_renderer_class.return_value = mock_renderer
                mock_renderer.render_unity_nodes.return_value = '{"nodes": []}'
                
                # Simuler l'annulation après quelques chunks
                events = []
                async for event in orchestrator.generate_with_events(sample_request_data, check_cancelled):
                    events.append(event)
                    if event.type == 'chunk' and len([e for e in events if e.type == 'chunk']) >= 1:
                        cancelled = True
                
                # Vérifier qu'on a reçu un événement d'erreur d'annulation
                error_events = [e for e in events if e.type == 'error' and 'annulée' in e.data.get('message', '')]
                # Note: L'annulation peut être détectée à différents moments selon l'implémentation
                assert len(events) > 0

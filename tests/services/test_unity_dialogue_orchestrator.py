"""Tests unitaires pour UnityDialogueOrchestrator."""
import pytest
from unittest.mock import Mock, AsyncMock, patch
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator, GenerationEvent
from api.schemas.dialogue import GenerateUnityDialogueRequest, GenerateUnityDialogueResponse, ContextSelection
from api.exceptions import ValidationException, InternalServerException
from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse


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
        user_instructions="Test dialogue",
        context_selections=context_selection,
        llm_model_identifier="gpt-5.6-luna"
    )


@pytest.mark.asyncio
async def test_orchestrator_generate_with_events_sequence(orchestrator, sample_request_data, mock_services):
    """Test que l'orchestrateur yield les bons événements dans le bon ordre."""
    
    # Mock context_builder
    mock_context_builder = Mock()
    _wire_context_builder_mock(mock_context_builder)
    orchestrator.dialogue_service.context_builder = mock_context_builder
    
    # Mock prompt_engine
    mock_built = Mock()
    mock_built.raw_prompt = "Test prompt"
    mock_built.prompt_hash = "hash123"
    mock_built.token_count = 100
    mock_built.structured_prompt = None
    mock_services['prompt_engine'].build_prompt.return_value = mock_built
    
    # Mock skill/trait services
    mock_services['skill_service'].load_skills.return_value = []
    mock_services['trait_service'].get_trait_labels.return_value = []
    
    # Mock config service
    mock_services['config_service'].get_llm_config.return_value = {}
    mock_services['config_service'].get_available_llm_models.return_value = [
        {"model_identifier": "gpt-5.6-luna"}
    ]
    
    # Mock LLM client factory
    mock_llm_client = AsyncMock()
    mock_llm_client.reasoning_trace = None
    mock_llm_client.warning = None
    mock_llm_client.last_call_cost = 0.001
    
    # Créer un async generator pour generate_variants_streaming
    # Le streaming peut retourner soit des StreamChunk, soit le résultat final
    async def mock_stream_generator(*args, **kwargs):
        from core.llm.openai.stream_parser import StreamChunk
        from models.dialogue_structure.unity_dialogue_node import UnityDialogueNodeContent
        # Simuler quelques chunks de streaming
        yield StreamChunk(
            event_type="response.output_text.delta",
            data={"text": "Test"},
            sequence=0
        )
        # Puis le résultat final
        yield UnityDialogueGenerationResponse(
            title="Test Dialogue",
            node=UnityDialogueNodeContent(
                speaker="NPC",
                line="Hello",
                choices=[]
            )
        )
    
    # Utiliser side_effect pour que chaque appel retourne un nouveau generator
    mock_llm_client.generate_variants_streaming = mock_stream_generator
    
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
            mock_unity_service.normalize_generation_response = (
                lambda response, max_choices=None: response
            )
            
            # Mock enrich_with_ids
            mock_enriched_nodes = [{"id": "START", "text": "Test"}]
            mock_unity_service.enrich_with_ids.return_value = mock_enriched_nodes
            
            # Mock renderer
            with patch('services.unity_dialogue_orchestrator.UnityJsonRenderer') as mock_renderer_class:
                mock_renderer = Mock()
                mock_renderer_class.return_value = mock_renderer
                mock_renderer.render_unity_nodes.return_value = '{"nodes": []}'
                
                # Collecter les événements
                events = []
                async for event in orchestrator.generate_with_events(sample_request_data, lambda: False):
                    events.append(event)
                
                # Vérifier séquence des événements
                assert len(events) >= 4
                # Les premiers événements doivent être 'step' pour Prompting et Generating
                step_events = [e for e in events if e.type == 'step']
                assert len(step_events) >= 2
                assert step_events[0].data['step'] == 'Prompting'
                assert step_events[1].data['step'] == 'Generating'
                # Validating peut venir après des chunks de streaming
                validating_events = [e for e in events if e.type == 'step' and e.data.get('step') == 'Validating']
                assert len(validating_events) > 0
                
                # Vérifier metadata
                metadata_events = [e for e in events if e.type == 'metadata']
                assert len(metadata_events) > 0
                # Le token_count vient de built.token_count (mock_built.token_count = 100)
                assert metadata_events[0].data['tokens'] == 100
                
                # Vérifier complete
                complete_events = [e for e in events if e.type == 'complete']
                assert len(complete_events) > 0
                assert 'result' in complete_events[0].data


@pytest.mark.asyncio
async def test_orchestrator_cancellation(orchestrator, sample_request_data, mock_services):
    """Test que l'annulation fonctionne correctement et arrête immédiatement."""
    
    # Mock context_builder
    mock_context_builder = Mock()
    _wire_context_builder_mock(mock_context_builder)
    orchestrator.dialogue_service.context_builder = mock_context_builder
    
    # Mock prompt_engine
    mock_built = Mock()
    mock_built.raw_prompt = "Test prompt"
    mock_built.prompt_hash = "hash123"
    mock_built.token_count = 100
    mock_built.structured_prompt = None
    mock_services['prompt_engine'].build_prompt.return_value = mock_built
    
    # Mock skill/trait services
    mock_services['skill_service'].load_skills.return_value = []
    mock_services['trait_service'].get_trait_labels.return_value = []
    
    # Mock config service
    mock_services['config_service'].get_llm_config.return_value = {}
    mock_services['config_service'].get_available_llm_models.return_value = [
        {"model_identifier": "gpt-5.6-luna"}
    ]

    # Simuler annulation juste après l'étape "Generating".
    # Le générateur vérifie `check_cancelled()` immédiatement après avoir yieldé l'événement step,
    # donc on annule côté test après réception du step.
    cancelled = False

    def check_cancelled():
        return cancelled

    events = []
    async for event in orchestrator.generate_with_events(sample_request_data, check_cancelled):
        events.append(event)
        if event.type == 'step' and event.data.get('step') == 'Generating':
            cancelled = True

    error_events = [e for e in events if e.type == 'error']
    assert len(error_events) > 0
    assert error_events[0].data.get('code') == 'cancelled'

    complete_events = [e for e in events if e.type == 'complete']
    assert len(complete_events) == 0, "Aucun résultat ne doit être envoyé si annulé"


@pytest.mark.asyncio
async def test_orchestrator_generate_rest_usage(orchestrator, sample_request_data, mock_services):
    """Test que generate() (usage REST) fonctionne correctement."""
    
    # Mock context_builder
    mock_context_builder = Mock()
    _wire_context_builder_mock(mock_context_builder)
    orchestrator.dialogue_service.context_builder = mock_context_builder
    
    # Mock prompt_engine
    mock_built = Mock()
    mock_built.raw_prompt = "Test prompt"
    mock_built.prompt_hash = "hash123"
    mock_built.token_count = 100
    mock_built.structured_prompt = None
    mock_services['prompt_engine'].build_prompt.return_value = mock_built
    
    # Mock skill/trait services
    mock_services['skill_service'].load_skills.return_value = []
    mock_services['trait_service'].get_trait_labels.return_value = []
    
    # Mock config service
    mock_services['config_service'].get_llm_config.return_value = {}
    mock_services['config_service'].get_available_llm_models.return_value = [
        {"model_identifier": "gpt-5.6-luna"}
    ]
    
    # Mock LLM client factory
    mock_llm_client = Mock()
    mock_llm_client.reasoning_trace = None
    mock_llm_client.warning = None
    mock_llm_client.last_call_cost = 0.001
    
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
            
            # Mock enrich_with_ids
            mock_enriched_nodes = [{"id": "START", "text": "Test"}]
            mock_unity_service.enrich_with_ids.return_value = mock_enriched_nodes
            
            # Mock renderer
            with patch('services.unity_dialogue_orchestrator.UnityJsonRenderer') as mock_renderer_class:
                mock_renderer = Mock()
                mock_renderer_class.return_value = mock_renderer
                mock_renderer.render_unity_nodes.return_value = '{"nodes": []}'
                
                # Appel generate() (usage REST)
                result = await orchestrator.generate(sample_request_data)
                
                # Vérifier que le résultat est une GenerateUnityDialogueResponse
                assert isinstance(result, GenerateUnityDialogueResponse)
                assert result.raw_prompt == "Test prompt"
                assert result.prompt_hash == "hash123"
                assert result.estimated_tokens == 100


@pytest.mark.asyncio
async def test_orchestrator_validation_error(orchestrator, mock_services):
    """Test que les validators Pydantic rejettent une requête Unity invalide."""
    
    # Créer une requête sans personnages (devrait lever ValidationException)
    context_selection = ContextSelection(
        characters_full=[],
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
    
    from pydantic import ValidationError

    # Les règles métier (au moins un personnage) sont validées dès la construction du modèle.
    with pytest.raises(ValidationError):
        GenerateUnityDialogueRequest(
            user_instructions="Test",
            context_selections=context_selection,
            llm_model_identifier="gpt-5.6-luna"
        )

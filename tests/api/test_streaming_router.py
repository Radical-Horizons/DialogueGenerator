"""Tests d'intégration pour le router SSE streaming."""
import pytest
import json
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock
from api.main import app
from api.schemas.dialogue import ContextSelection

@pytest.fixture
def client():
    """Client de test FastAPI."""
    return TestClient(app)


# Anciens tests pour /generate/stream (endpoint supprimé) retirés.
# Le flux streaming est couvert par test_create_job_and_stream_real_generation,
# test_cancel_job et test_cleanup_automatic_after_completion (jobs + stream).


@pytest.mark.asyncio
async def test_create_job_and_stream_real_generation(client: TestClient, monkeypatch):
    """Test que le streaming utilise la vraie génération Unity via orchestrateur."""
    
    # Créer un job
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
    
    job_request = {
        "user_instructions": "Test dialogue",
        "context_selections": context_selection.model_dump(mode='json'),
            "llm_model_identifier": "gpt-5-mini"
    }
    
    response = client.post("/api/v1/dialogues/generate/jobs", json=job_request)
    assert response.status_code == 200
    
    job_data = response.json()
    assert "job_id" in job_data
    assert "stream_url" in job_data
    job_id = job_data["job_id"]
    
    # Streamer le job (avec mock de l'orchestrateur pour éviter vrai appel LLM)
    with patch('services.unity_dialogue_orchestrator.UnityDialogueOrchestrator') as mock_orchestrator_class:
        # Mock de l'orchestrateur
        mock_orchestrator = MagicMock()
        mock_orchestrator_class.return_value = mock_orchestrator
        
        # Mock des événements (doit accepter request_data et check_cancelled)
        from services.unity_dialogue_orchestrator import GenerationEvent
        
        async def mock_events(request_data, check_cancelled):
            yield GenerationEvent(type='step', data={'step': 'Prompting'})
            yield GenerationEvent(type='step', data={'step': 'Generating'})
            yield GenerationEvent(type='step', data={'step': 'Validating'})
            yield GenerationEvent(type='metadata', data={'tokens': 100, 'cost': 0.001})
            yield GenerationEvent(type='complete', data={
                'result': {
                    'json_content': '{"nodes": [{"id": "START", "text": "Test"}]}',
                    'title': 'Test Dialogue',
                    'raw_prompt': 'Test prompt',
                    'prompt_hash': 'hash123',
                    'estimated_tokens': 100,
                    'warning': None,
                    'structured_prompt': None,
                    'reasoning_trace': None
                }
            })
        
        mock_orchestrator.generate_with_events = mock_events
        
        # Streamer le job
        stream_response = client.get(f"/api/v1/dialogues/generate/jobs/{job_id}/stream")
        assert stream_response.status_code == 200
        assert stream_response.headers['content-type'] == 'text/event-stream; charset=utf-8'
        
        # Parser les événements SSE
        events = []
        for line in stream_response.text.split('\n'):
            if line.startswith('data:'):
                data_str = line[5:].strip()
                if data_str:
                    events.append(json.loads(data_str))
        
        # Vérifier séquence événements
        assert len(events) >= 4
        assert events[0] == {"type": "step", "step": "Prompting"}
        assert events[1] == {"type": "step", "step": "Generating"}
        assert events[2] == {"type": "step", "step": "Validating"}
        
        # Vérifier metadata
        metadata_events = [e for e in events if e.get('type') == 'metadata']
        assert len(metadata_events) > 0
        assert metadata_events[0]['tokens'] == 100
        
        # Vérifier complete avec résultat Unity JSON
        complete_events = [e for e in events if e.get('type') == 'complete']
        assert len(complete_events) > 0
        result = complete_events[0]['result']
        assert 'json_content' in result
        assert 'title' in result
        assert result['title'] == 'Test Dialogue'


def test_cancel_job(client: TestClient):
    """Test que l'annulation d'un job fonctionne."""
    
    # Créer un job
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
    
    job_request = {
        "user_instructions": "Test dialogue",
        "context_selections": context_selection.model_dump(mode='json'),
            "llm_model_identifier": "gpt-5-mini"
    }
    
    response = client.post("/api/v1/dialogues/generate/jobs", json=job_request)
    job_id = response.json()["job_id"]
    
    # Annuler le job
    cancel_response = client.post(f"/api/v1/dialogues/generate/jobs/{job_id}/cancel")
    assert cancel_response.status_code == 200
    
    cancel_data = cancel_response.json()
    assert cancel_data["success"] is True
    assert cancel_data["job_id"] == job_id


@pytest.mark.asyncio
async def test_cleanup_automatic_after_completion(client: TestClient, monkeypatch, caplog):
    """Test que le cleanup automatique fonctionne après génération normale (Task 5 - Story 0.8)."""
    from api.services.generation_job_manager import get_job_manager
    
    # Créer un job
    context_selection = ContextSelection(
        characters_full=["character_1"],
        characters_excerpt=[],
        locations_full=[],
        items_excerpt=[],
        species_full=[],
        species_excerpt=[],
        communities_full=[],
        communities_excerpt=[],
        dialogues_examples=[],
        scene_location=None
    )
    
    job_request = {
        "user_instructions": "Test dialogue",
        "context_selections": context_selection.model_dump(mode='json'),
            "llm_model_identifier": "gpt-5-mini"
    }
    
    response = client.post("/api/v1/dialogues/generate/jobs", json=job_request)
    job_id = response.json()["job_id"]
    
    job_manager = get_job_manager()
    
    # Mock de l'orchestrateur pour retourner un événement complete
    with patch('services.unity_dialogue_orchestrator.UnityDialogueOrchestrator') as mock_orchestrator_class:
        mock_orchestrator = MagicMock()
        mock_orchestrator_class.return_value = mock_orchestrator
        
        from services.unity_dialogue_orchestrator import GenerationEvent
        
        async def mock_events(request_data, check_cancelled):
            yield GenerationEvent(type='step', data={'step': 'Prompting'})
            yield GenerationEvent(type='step', data={'step': 'Generating'})
            yield GenerationEvent(type='step', data={'step': 'Validating'})
            yield GenerationEvent(type='complete', data={
                'result': {
                    'json_content': '{"nodes": []}',
                    'title': 'Test Dialogue',
                    'raw_prompt': 'Test prompt',
                    'prompt_hash': 'hash123',
                    'estimated_tokens': 100,
                    'warning': None,
                    'structured_prompt': None,
                    'reasoning_trace': None
                }
            })
        
        mock_orchestrator.generate_with_events = mock_events
        
        # Streamer le job jusqu'à completion
        stream_response = client.get(f"/api/v1/dialogues/generate/jobs/{job_id}/stream")
        assert stream_response.status_code == 200
        
        # Lire tous les événements pour déclencher le cleanup
        content = stream_response.text
        assert '"type": "complete"' in content
        
        # Attendre un peu pour que le cleanup se termine
        import asyncio
        await asyncio.sleep(0.2)
        
        # Vérifier que la tâche a été désenregistrée (cleanup automatique dans finally)
        # Note: La tâche est désenregistrée dans le finally block de stream_generation
        # On vérifie que le job est dans l'état completed
        job = job_manager.get_job(job_id)
        assert job is not None
        assert job['status'] == 'completed'
        
        # Vérifier que les logs de cleanup automatique sont présents
        log_records = [r for r in caplog.records if 'Génération terminée, cleanup automatique' in r.message]
        assert len(log_records) > 0, "Les logs de cleanup automatique doivent être présents"
        
        # Vérifier que les métadonnées sont dans les logs
        log_message = log_records[0].message
        assert f"job_id: {job_id}" in log_message
        assert "durée:" in log_message
        assert "timestamp:" in log_message

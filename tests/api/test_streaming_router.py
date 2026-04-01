"""Tests d'intégration pour le router SSE streaming."""
import pytest
import json
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock

from api.main import app
from api.routers.auth import get_current_user
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
    assert response.status_code == 201
    
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
        stream_response = client.get(job_data["stream_url"])
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
    assert response.status_code == 201
    job_id = response.json()["job_id"]
    
    # Annuler le job
    cancel_response = client.post(f"/api/v1/dialogues/generate/jobs/{job_id}/cancel")
    assert cancel_response.status_code == 200
    
    cancel_data = cancel_response.json()
    assert cancel_data["success"] is True
    assert cancel_data["job_id"] == job_id


def test_stream_job_uses_job_id_as_orchestrator_request_id(client: TestClient, monkeypatch):
    """Test que le routeur de stream passe le job_id comme request_id orchestrateur."""
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
    assert response.status_code == 201
    job_id = response.json()["job_id"]

    received_request_ids = {}

    def fake_get_unity_orchestrator(request, request_id: str):
        received_request_ids["value"] = request_id

        async def fake_events(request_data, check_cancelled):
            from services.unity_dialogue_orchestrator import GenerationEvent
            yield GenerationEvent(
                type="complete",
                data={
                    "result": {
                        "json_content": "{\"nodes\": []}",
                        "title": "Test Dialogue",
                        "raw_prompt": "Test prompt",
                        "prompt_hash": "hash123",
                        "estimated_tokens": 100,
                        "warning": None,
                        "structured_prompt": None,
                        "reasoning_trace": None,
                    }
                },
            )

        fake_orchestrator = MagicMock()
        fake_orchestrator.generate_with_events = fake_events
        return fake_orchestrator

    monkeypatch.setattr("api.routers.streaming.get_unity_dialogue_orchestrator", fake_get_unity_orchestrator)

    stream_url = response.json()["stream_url"]
    stream_response = client.get(stream_url)
    assert stream_response.status_code == 200
    assert '"type": "complete"' in stream_response.text
    assert received_request_ids.get("value") == job_id


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
    assert response.status_code == 201
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
        
        stream_url = response.json()["stream_url"]
        stream_response = client.get(stream_url)
        assert stream_response.status_code == 200
        
        # Lire tous les événements pour déclencher le cleanup
        content = stream_response.text
        assert '"type": "complete"' in content

        # Attendre conditionnellement la fin du cleanup (évite sleep fixe flaky)
        import asyncio
        job = None
        for _ in range(200):
            job = job_manager.get_job(job_id)
            if job is not None and job.get("status") == "completed":
                break
            await asyncio.sleep(0.01)
        assert job is not None
        assert job["status"] == "completed"
        
        # Vérifier que les logs de cleanup automatique sont présents
        log_records = [r for r in caplog.records if 'Génération terminée, cleanup automatique' in r.message]
        assert len(log_records) > 0, "Les logs de cleanup automatique doivent être présents"
        
        # Vérifier que les métadonnées sont dans les logs
        log_message = log_records[0].message
        assert f"job_id: {job_id}" in log_message
        assert "durée:" in log_message
        assert "timestamp:" in log_message


def test_stream_job_when_claim_fails_emits_sse_error(client: TestClient, monkeypatch):
    """Si try_claim_stream_job échoue, le flux SSE doit émettre un événement error."""
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
        scene_location=None,
    )
    job_request = {
        "user_instructions": "Test dialogue",
        "context_selections": context_selection.model_dump(mode="json"),
        "llm_model_identifier": "gpt-5-mini",
    }
    response = client.post("/api/v1/dialogues/generate/jobs", json=job_request)
    assert response.status_code == 201
    stream_url = response.json()["stream_url"]
    job_id = response.json()["job_id"]

    from api.services.generation_job_manager import get_job_manager

    jm = get_job_manager()

    async def deny_claim(_jid: str) -> bool:
        return False

    monkeypatch.setattr(jm, "try_claim_stream_job", deny_claim)

    stream_response = client.get(stream_url)
    assert stream_response.status_code == 200
    events = []
    for line in stream_response.text.split("\n"):
        if line.startswith("data:"):
            s = line[5:].strip()
            if s:
                events.append(json.loads(s))
    assert any(e.get("type") == "error" for e in events)
    err = next(e for e in events if e.get("type") == "error")
    assert job_id
    assert "message" in err


@pytest.mark.asyncio
async def test_stream_generation_with_billable_user_sets_context_during_stream(monkeypatch):
    """Le flux SSE doit pousser l'utilisateur facturable aligné sur le job (sse_token), pas seulement le middleware."""
    from api.routers import streaming as streaming_mod
    from api.middleware.billable_user_context import (
        get_billable_user_id,
        push_billable_user_id,
        reset_billable_user_id,
    )

    seen_during_inner: list[str] = []

    async def fake_stream_generation(_job_id: str, _orchestrator):
        seen_during_inner.append(get_billable_user_id())
        yield 'data: {"type":"complete","result":{}}\n\n'

    monkeypatch.setattr(streaming_mod, "stream_generation", fake_stream_generation)

    outer = push_billable_user_id("default_user")
    try:
        chunks: list[str] = []
        async for line in streaming_mod.stream_generation_with_billable_user(
            "job-1", MagicMock(), "alice"
        ):
            chunks.append(line)
        assert seen_during_inner == ["alice"]
        assert get_billable_user_id() == "default_user"
        assert chunks
    finally:
        reset_billable_user_id(outer)


def _minimal_job_request() -> dict:
    """Payload minimal pour POST /generate/jobs (réutilisé par les tests ownership)."""
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
        scene_location=None,
    )
    return {
        "user_instructions": "Test dialogue",
        "context_selections": context_selection.model_dump(mode="json"),
        "llm_model_identifier": "gpt-5-mini",
    }


def test_cancel_job_forbidden_for_non_owner(client: TestClient, monkeypatch) -> None:
    """Un utilisateur ne peut pas annuler le job d'un autre (auth réelle simulée)."""
    monkeypatch.setattr(
        "api.routers.streaming._security_skips_job_ownership",
        lambda: False,
    )

    async def user_alice() -> dict:
        return {"id": "1", "username": "alice", "email": "alice@example.com"}

    app.dependency_overrides[get_current_user] = user_alice
    try:
        create_resp = client.post(
            "/api/v1/dialogues/generate/jobs",
            json=_minimal_job_request(),
        )
        assert create_resp.status_code == 201
        job_id = create_resp.json()["job_id"]

        async def user_bob() -> dict:
            return {"id": "2", "username": "bob", "email": "bob@example.com"}

        app.dependency_overrides[get_current_user] = user_bob
        cancel_resp = client.post(f"/api/v1/dialogues/generate/jobs/{job_id}/cancel")
        assert cancel_resp.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_get_job_status_forbidden_for_non_owner(client: TestClient, monkeypatch) -> None:
    """Un utilisateur ne peut pas lire le statut du job d'un autre."""
    monkeypatch.setattr(
        "api.routers.streaming._security_skips_job_ownership",
        lambda: False,
    )

    async def user_alice() -> dict:
        return {"id": "1", "username": "alice", "email": "alice@example.com"}

    app.dependency_overrides[get_current_user] = user_alice
    try:
        create_resp = client.post(
            "/api/v1/dialogues/generate/jobs",
            json=_minimal_job_request(),
        )
        assert create_resp.status_code == 201
        job_id = create_resp.json()["job_id"]

        async def user_bob() -> dict:
            return {"id": "2", "username": "bob", "email": "bob@example.com"}

        app.dependency_overrides[get_current_user] = user_bob
        status_resp = client.get(f"/api/v1/dialogues/generate/jobs/{job_id}")
        assert status_resp.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)

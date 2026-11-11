"""Reprise d'une génération après rechargement de page ou coupure du flux SSE.

La génération tourne dans sa propre tâche et écrit un journal d'événements ; le flux
SSE ne fait que le rejouer. Fermer le flux (F5) ne doit donc ni annuler le job ni le
relancer, et un client revenu retrouve tout ce qui a déjà été produit.
"""
import asyncio
import json
from typing import Any, AsyncIterator, Callable, Dict, List
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.routers import streaming as streaming_mod
from api.services.generation_job_manager import GenerationJobManager
from services.unity_dialogue_orchestrator import GenerationEvent

_RESULT: Dict[str, Any] = {
    "json_content": '{"nodes": []}',
    "title": "Dialogue repris",
    "raw_prompt": "prompt",
    "prompt_hash": "hash",
    "estimated_tokens": 10,
    "warning": None,
    "structured_prompt": None,
    "reasoning_trace": None,
}


def _parse(chunks: List[str]) -> List[Dict[str, Any]]:
    """Extrait les payloads JSON des lignes ``data:`` d'une liste de chunks SSE."""
    events: List[Dict[str, Any]] = []
    for chunk in chunks:
        for line in chunk.split("\n"):
            if line.startswith("data:"):
                events.append(json.loads(line[5:].strip()))
    return events


def _gated_orchestrator(gate: asyncio.Event, calls: List[int]) -> MagicMock:
    """Orchestrateur factice : deux étapes, puis attend ``gate`` avant de conclure."""

    async def events(request_data: Any, check_cancelled: Callable[[], bool]) -> AsyncIterator[GenerationEvent]:
        calls.append(1)
        yield GenerationEvent(type="step", data={"step": "Prompting"})
        yield GenerationEvent(type="chunk", data={"content": "Bon", "sequence": 0})
        await gate.wait()
        yield GenerationEvent(type="chunk", data={"content": "jour", "sequence": 1})
        yield GenerationEvent(type="complete", data={"result": _RESULT})

    orchestrator = MagicMock()
    orchestrator.generate_with_events = events
    return orchestrator


@pytest.fixture
def manager(monkeypatch: pytest.MonkeyPatch) -> GenerationJobManager:
    """Gestionnaire isolé, substitué au singleton lu par le routeur."""
    jm = GenerationJobManager()
    monkeypatch.setattr(streaming_mod, "get_job_manager", lambda: jm)
    return jm


def _params() -> Dict[str, Any]:
    """Paramètres minimaux valides pour ``GenerateUnityDialogueRequest``."""
    return {
        "user_instructions": "Test",
        "context_selections": {"characters_full": ["character_1"]},
        "llm_model_identifier": "gpt-5.6-luna",
    }


async def _wait_status(jm: GenerationJobManager, job_id: str, status: str) -> None:
    """Attend qu'un job atteigne un statut donné (borne 2 s)."""
    for _ in range(200):
        job = jm.get_job(job_id)
        if job is not None and job["status"] == status:
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"statut {status} jamais atteint : {jm.get_job(job_id)}")


@pytest.mark.asyncio
async def test_closing_stream_does_not_cancel_generation(manager: GenerationJobManager) -> None:
    """F5 : le client ferme le flux en pleine génération, le job continue et aboutit."""
    gate = asyncio.Event()
    calls: List[int] = []
    orchestrator = _gated_orchestrator(gate, calls)
    job_id = manager.create_job(_params(), owner_username="admin")

    first = streaming_mod.stream_generation(job_id, orchestrator)
    received = [await first.__anext__(), await first.__anext__()]
    await first.aclose()

    assert manager.get_job(job_id)["status"] == "running"
    gate.set()
    await _wait_status(manager, job_id, "completed")
    assert manager.get_job(job_id)["result"]["title"] == "Dialogue repris"
    assert _parse(received)[1] == {"type": "chunk", "content": "Bon", "sequence": 0}


@pytest.mark.asyncio
async def test_reconnecting_client_replays_journal_without_rerunning(manager: GenerationJobManager) -> None:
    """Le client revenu rejoue tout le journal ; l'appel LLM n'est fait qu'une fois."""
    gate = asyncio.Event()
    calls: List[int] = []
    orchestrator = _gated_orchestrator(gate, calls)
    job_id = manager.create_job(_params(), owner_username="admin")

    first = streaming_mod.stream_generation(job_id, orchestrator)
    await first.__anext__()
    await first.aclose()

    gate.set()
    second = [chunk async for chunk in streaming_mod.stream_generation(job_id, orchestrator)]
    events = _parse(second)

    assert [e["type"] for e in events] == ["step", "chunk", "chunk", "complete"]
    assert "".join(e["content"] for e in events if e["type"] == "chunk") == "Bonjour"
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_last_event_id_resumes_after_last_received_event(manager: GenerationJobManager) -> None:
    """Reconnexion ``EventSource`` : rien n'est livré deux fois."""
    gate = asyncio.Event()
    gate.set()
    orchestrator = _gated_orchestrator(gate, [])
    job_id = manager.create_job(_params(), owner_username="admin")

    full = [chunk async for chunk in streaming_mod.stream_generation(job_id, orchestrator)]
    assert full[1].startswith("id: 1\n")

    resumed = [
        chunk async for chunk in streaming_mod.stream_generation(job_id, orchestrator, last_event_id=1)
    ]
    assert [e["type"] for e in _parse(resumed)] == ["chunk", "complete"]
    assert resumed[0].startswith("id: 2\n")


@pytest.mark.asyncio
async def test_cancel_ends_followers_with_cancelled_event(manager: GenerationJobManager) -> None:
    """« Interrompre » arrête la tâche et clôt le journal par un seul événement d'annulation."""
    gate = asyncio.Event()
    orchestrator = _gated_orchestrator(gate, [])
    job_id = manager.create_job(_params(), owner_username="admin")

    follower = streaming_mod.stream_generation(job_id, orchestrator)
    await follower.__anext__()
    await follower.__anext__()

    assert manager.cancel_job(job_id) is True
    rest = [chunk async for chunk in follower]
    await asyncio.sleep(0.05)

    events = _parse(rest)
    assert events == [{"type": "error", "message": "Génération annulée", "code": "cancelled"}]
    journal_types = [e["type"] for e in manager.get_job(job_id)["events"]]
    assert journal_types.count("error") == 1


def test_unknown_job_stream_explains_lost_generation(manager: GenerationJobManager) -> None:
    """Après un redémarrage, le job n'existe plus : le flux le dit au lieu d'un 404 muet."""
    client = TestClient(app)
    response = client.get("/api/v1/dialogues/generate/jobs/inconnu/stream")
    assert response.status_code == 200
    events = _parse([response.text])
    assert events == [
        {"type": "error", "message": streaming_mod.GENERATION_LOST_MESSAGE, "code": "not_found"}
    ]


@pytest.mark.asyncio
async def test_idle_stream_sends_heartbeat(
    manager: GenerationJobManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Pendant un long appel LLM, le flux bat : un client derrière un proxy voit l'API tomber."""
    monkeypatch.setattr(streaming_mod, "SSE_HEARTBEAT_SECONDS", 0.05)
    gate = asyncio.Event()
    orchestrator = _gated_orchestrator(gate, [])
    job_id = manager.create_job(_params(), owner_username="admin")

    follower = streaming_mod.stream_generation(job_id, orchestrator)
    await follower.__anext__()
    await follower.__anext__()
    heartbeat = await asyncio.wait_for(follower.__anext__(), timeout=1)
    assert heartbeat == streaming_mod.SSE_HEARTBEAT
    assert _parse([heartbeat]) == [{}]

    gate.set()
    rest = [chunk async for chunk in follower]
    assert [e.get("type") for e in _parse(rest) if e] == ["chunk", "complete"]

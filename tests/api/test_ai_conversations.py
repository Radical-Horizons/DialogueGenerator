"""Tests API des conversations IA (``/api/v1/ai-conversations``)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_ai_conversation_service, get_config_service
from api.main import app
from api.routers.auth import get_current_user
from core.llm.openai.client import STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX
from services.ai_conversation_service import AIConversationService, DialogueNodeSubjectResolver
from services.configuration_service import ConfigurationService
from services.llm_pricing_service import LLMPricingService
from services.llm_usage_service import LLMUsageService
from services.repositories.llm_usage_repository import FileLLMUsageRepository
from services.repositories.sqlite.ai_conversations_repository import (
    AIConversationsRepository,
    NewAIConversationMessage,
)
from services.repositories.sqlite.connection import DatabaseConnection

BASE = "/api/v1/ai-conversations"
NODE_OUTPUT = json.dumps(
    {"title": "Garde", "node": {"displayName": "Le garde hésite", "line": "Halte !"}},
    ensure_ascii=False,
)
REASONING = "J'ai fait hésiter le garde pour ouvrir une négociation."


def _user(user_id: str, role: str = "writer") -> Dict[str, object]:
    """Identité active pour ``get_current_user``."""
    return {"id": user_id, "username": user_id, "role": role, "is_active": True}


@dataclass
class ScriptedClient:
    """Faux client LLM : réponses scriptées, appels mémorisés."""

    answers: List[str]
    calls: List[Dict[str, Any]] = field(default_factory=list)
    last_call_cost: float = 0.0

    async def generate_variants(
        self,
        prompt: str,
        k: int = 1,
        response_model: Any = None,
        previous_dialogue_context: Optional[List[Dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
    ) -> List[str]:
        """Mémorise l'appel et rend la réponse suivante."""
        self.calls.append(
            {
                "prompt": prompt,
                "context": [dict(m) for m in previous_dialogue_context or []],
                "instructions": user_system_prompt_override,
            }
        )
        return [self.answers.pop(0) if self.answers else f"Réponse {len(self.calls)}"]

    def get_max_tokens(self) -> int:
        """Plafond factice."""
        return 1000


@dataclass
class Env:
    """Client HTTP et doublures pilotables."""

    client: TestClient
    usage: LLMUsageService
    budget: MagicMock
    scripted_answers: List[str]
    llm_calls: List[Dict[str, Any]]
    repository: AIConversationsRepository

    def as_user(self, user_id: str, role: str = "writer") -> None:
        """Change l'utilisateur courant."""
        app.dependency_overrides[get_current_user] = lambda: _user(user_id, role)


def _seed_generation(usage: LLMUsageService, dialogue_id: str, node_id: str) -> None:
    """Trace une génération OpenAI Responses (avec résumé) annotée sur (dialogue, nœud)."""
    prompt = (
        "Tu es le scénariste." + STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX + "\n\n--- Input ---\n"
        + json.dumps([{"role": "user", "content": "Écris la réplique."}], ensure_ascii=False)
    )
    response = json.dumps(
        {
            "output": [
                {"type": "reasoning", "summary": [{"type": "summary_text", "text": REASONING}]},
                {"type": "function_call", "name": "generate_interaction", "arguments": NODE_OUTPUT},
            ]
        }
    )
    call_id = usage.track_usage(
        request_id="req-generation",
        model_name="gpt-5.6-terra",
        prompt_tokens=100,
        completion_tokens=10,
        total_tokens=110,
        duration_ms=1,
        success=True,
        endpoint="graph/generate-node",
        prompt=prompt,
        response=response,
    )
    assert call_id is not None
    usage.annotate_call(call_id, dialogue_id, node_id)


@pytest.fixture
def env(tmp_path: Path, isolated_app_database: DatabaseConnection) -> Iterator[Env]:
    """writer-a possède le dialogue D dont le nœud N a une génération tracée."""
    dialogue_dir = tmp_path / "Dialogues"
    layout_dir = tmp_path / "Layouts"
    dialogue_dir.mkdir()
    layout_dir.mkdir()
    config = MagicMock(spec=ConfigurationService)
    config.get_unity_dialogues_path.return_value = dialogue_dir
    config.get_unity_layouts_path.return_value = layout_dir
    config.get_available_llm_models.return_value = [{"api_identifier": "gpt-6.2-sol"}]
    config.get_llm_config.return_value = {"default_model": "gpt-6-luna"}
    for user_id in ("writer-a", "writer-b"):
        isolated_app_database.execute(
            "INSERT INTO users(id, username, role, is_active, created_at, updated_at) "
            "VALUES (?, ?, 'writer', 1, datetime('now'), datetime('now'))",
            (user_id, user_id),
        )

    usage = LLMUsageService(
        repository=FileLLMUsageRepository(storage_dir=str(tmp_path / "usage")),
        pricing_service=LLMPricingService(),
    )
    budget = MagicMock()
    budget.check_budget.return_value = {"allowed": True, "percentage": 1.0, "warning": None}
    answers: List[str] = []
    calls: List[Dict[str, Any]] = []

    def factory(model_id: str, request_id: str) -> ScriptedClient:
        client = ScriptedClient(answers=answers, calls=calls)
        return client

    repository = AIConversationsRepository(isolated_app_database)
    service = AIConversationService(
        repository=repository,
        usage_service=usage,
        cost_governance_service=budget,
        config_service=config,
        llm_client_factory=factory,  # type: ignore[arg-type]
        resolvers=[
            DialogueNodeSubjectResolver(
                app.state.container.get_document_persistence_service(), usage
            )
        ],
    )
    app.dependency_overrides[get_config_service] = lambda: config
    app.dependency_overrides[get_ai_conversation_service] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    client = TestClient(app)
    try:
        assert client.put(
            "/api/v1/documents/D",
            json={"document": {"schemaVersion": "1.2.0", "nodes": []}, "revision": 1},
        ).status_code == 200
        _seed_generation(usage, "D", "N")
        yield Env(client, usage, budget, answers, calls, repository)
    finally:
        app.dependency_overrides.clear()


def _create(env: Env, dialogue_id: str = "D", node_id: str = "N") -> Any:
    return env.client.post(
        BASE,
        json={"subject": {"kind": "dialogue_node", "dialogue_id": dialogue_id, "node_id": node_id}},
    )


def test_create_two_questions_then_detail(env: Env) -> None:
    """Création 201, deux questions 201, détail ordonné, contexte du second appel."""
    created = _create(env)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["generation"]["output_text"] == NODE_OUTPUT
    assert body["generation"]["reasoning_summary"] == REASONING
    assert body["model_name"] == "gpt-6.2-sol"
    assert body["messages"] == []
    assert body["subject"] == {"kind": "dialogue_node", "dialogue_id": "D", "node_id": "N"}

    env.scripted_answers.extend(["Pour ouvrir une négociation.", "Elle reste ouverte."])
    first = env.client.post(f"{BASE}/{body['id']}/messages", json={"content": "Pourquoi ce ton ?"})
    assert first.status_code == 201, first.text
    assert first.json()["assistant_message"]["content"] == "Pour ouvrir une négociation."
    second = env.client.post(f"{BASE}/{body['id']}/messages", json={"content": "Et la fin ?"})
    assert second.status_code == 201
    assert second.json()["assistant_message"]["content"] == "Elle reste ouverte."

    detail = env.client.get(f"{BASE}/{body['id']}")
    assert detail.status_code == 200
    assert [(m["position"], m["role"], m["content"]) for m in detail.json()["messages"]] == [
        (1, "user", "Pourquoi ce ton ?"),
        (2, "assistant", "Pour ouvrir une négociation."),
        (3, "user", "Et la fin ?"),
        (4, "assistant", "Elle reste ouverte."),
    ]

    first_call, second_call = env.llm_calls
    assert first_call["instructions"] == "Tu es le scénariste."
    assert first_call["context"][1] == {"role": "assistant", "content": NODE_OUTPUT}
    assert REASONING in first_call["context"][2]["content"]
    assert second_call["context"][-2:] == [
        {"role": "user", "content": "Pourquoi ce ton ?"},
        {"role": "assistant", "content": "Pour ouvrir une négociation."},
    ]


def test_writer_without_access_gets_403_and_404(env: Env) -> None:
    """writer-b : création refusée (403 dialogue_access_denied), conversation de writer-a introuvable."""
    conversation_id = _create(env).json()["id"]
    env.as_user("writer-b")

    denied = _create(env)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "dialogue_access_denied"
    assert env.client.get(f"{BASE}/{conversation_id}").status_code == 404
    assert env.client.post(
        f"{BASE}/{conversation_id}/messages", json={"content": "?"}
    ).status_code == 404
    assert env.client.delete(f"{BASE}/{conversation_id}").status_code == 404


def test_node_without_trace_returns_404(env: Env) -> None:
    """Nœud écrit à la main ⇒ 404 generation_trace_not_found, rien n'est créé."""
    response = _create(env, node_id="MANUAL")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "generation_trace_not_found"
    assert env.client.get(BASE).json() == []


def test_llm_error_returns_502_and_persists_nothing(env: Env) -> None:
    """Réponse « Erreur: … » ⇒ 502 llm_error, aucun message."""
    conversation_id = _create(env).json()["id"]
    env.scripted_answers.append("Erreur: fournisseur indisponible")
    response = env.client.post(f"{BASE}/{conversation_id}/messages", json={"content": "Pourquoi ?"})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "llm_error"
    assert env.client.get(f"{BASE}/{conversation_id}").json()["messages"] == []


def test_budget_exceeded_returns_429(env: Env) -> None:
    """Budget dépassé ⇒ 429 QUOTA_EXCEEDED, aucun appel LLM."""
    conversation_id = _create(env).json()["id"]
    env.budget.check_budget.return_value = {"allowed": False, "percentage": 101.0, "warning": "Budget dépassé"}
    response = env.client.post(f"{BASE}/{conversation_id}/messages", json={"content": "Pourquoi ?"})
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "QUOTA_EXCEEDED"
    assert env.llm_calls == []


def test_full_conversation_returns_409(env: Env) -> None:
    """40 messages déjà présents ⇒ 409 conversation_full, aucun appel LLM."""
    conversation_id = _create(env).json()["id"]
    for index in range(20):
        env.repository.append_exchange(
            conversation_id,
            NewAIConversationMessage(id=f"u{index}", role="user", content="q", created_at="t"),
            NewAIConversationMessage(id=f"a{index}", role="assistant", content="r", created_at="t"),
            updated_at="t",
            max_messages=40,
        )
    response = env.client.post(f"{BASE}/{conversation_id}/messages", json={"content": "Encore ?"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conversation_full"
    assert env.llm_calls == []


def test_revoked_share_returns_403_on_read_and_message(env: Env) -> None:
    """Partage révoqué après création ⇒ 403 dialogue_access_denied sur GET et POST message."""
    assert env.client.post(
        "/api/v1/dialogues/D/shares", json={"username": "writer-b"}
    ).status_code in (200, 201)
    env.as_user("writer-b")
    created = _create(env)
    assert created.status_code == 201, created.text
    conversation_id = created.json()["id"]

    env.as_user("writer-a")
    assert env.client.delete("/api/v1/dialogues/D/shares/writer-b").status_code in (200, 204)

    env.as_user("writer-b")
    read = env.client.get(f"{BASE}/{conversation_id}")
    assert read.status_code == 403
    assert read.json()["error"]["code"] == "dialogue_access_denied"
    message = env.client.post(f"{BASE}/{conversation_id}/messages", json={"content": "?"})
    assert message.status_code == 403
    assert message.json()["error"]["code"] == "dialogue_access_denied"


def test_guest_cannot_write(env: Env) -> None:
    """Invité ⇒ 403 sur création, message et suppression."""
    conversation_id = _create(env).json()["id"]
    env.as_user("guest", role="guest")
    assert _create(env).status_code == 403
    assert env.client.post(f"{BASE}/{conversation_id}/messages", json={"content": "?"}).status_code == 403
    assert env.client.delete(f"{BASE}/{conversation_id}").status_code == 403


def test_list_filters_and_delete(env: Env) -> None:
    """Liste filtrée par dialogue / nœud ; suppression 204 puis 404."""
    _seed_generation(env.usage, "D", "M")
    on_n = _create(env).json()["id"]
    on_m = _create(env, node_id="M").json()["id"]

    by_node = env.client.get(BASE, params={"dialogue_id": "D", "node_id": "N"})
    assert [c["id"] for c in by_node.json()] == [on_n]
    by_dialogue = env.client.get(BASE, params={"dialogue_id": "D.json"})
    assert {c["id"] for c in by_dialogue.json()} == {on_n, on_m}
    assert by_dialogue.json()[0]["message_count"] == 0
    assert env.client.get(BASE, params={"node_id": "N"}).status_code == 422

    assert env.client.delete(f"{BASE}/{on_m}").status_code == 204
    assert env.client.get(f"{BASE}/{on_m}").status_code == 404


@pytest.mark.parametrize("content", ["", "   ", "x" * 4001])
def test_message_content_validation(env: Env, content: str) -> None:
    """Contenu vide, blanc ou au-delà de 4000 caractères ⇒ 422."""
    conversation_id = _create(env).json()["id"]
    response = env.client.post(f"{BASE}/{conversation_id}/messages", json={"content": content})
    assert response.status_code == 422
    assert env.llm_calls == []


def test_unknown_subject_kind_is_rejected(env: Env) -> None:
    """Sujet inconnu de l'union discriminée ⇒ 422."""
    response = env.client.post(BASE, json={"subject": {"kind": "gdd_query", "query": "x"}})
    assert response.status_code == 422


def test_unknown_requested_model_returns_422(env: Env) -> None:
    """Modèle demandé absent de la configuration ⇒ 422 unknown_model, rien n'est créé."""
    response = env.client.post(
        BASE,
        json={
            "subject": {"kind": "dialogue_node", "dialogue_id": "D", "node_id": "N"},
            "llm_model_identifier": "gpt-imaginaire",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "unknown_model"
    assert env.client.get(BASE).json() == []


def test_real_container_wiring_with_dummy_client(
    tmp_path: Path, isolated_app_database: DatabaseConnection
) -> None:
    """Câblage réel du container (sans surcharge du service) : création puis question, client Dummy sans clé."""
    dialogue_dir = tmp_path / "Dialogues"
    layout_dir = tmp_path / "Layouts"
    dialogue_dir.mkdir()
    layout_dir.mkdir()
    config = MagicMock(spec=ConfigurationService)
    config.get_unity_dialogues_path.return_value = dialogue_dir
    config.get_unity_layouts_path.return_value = layout_dir
    isolated_app_database.execute(
        "INSERT INTO users(id, username, role, is_active, created_at, updated_at) "
        "VALUES ('writer-a', 'writer-a', 'writer', 1, datetime('now'), datetime('now'))"
    )
    app.dependency_overrides[get_config_service] = lambda: config
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    try:
        client = TestClient(app)
        assert client.put(
            "/api/v1/documents/D",
            json={"document": {"schemaVersion": "1.2.0", "nodes": []}, "revision": 1},
        ).status_code == 200
        _seed_generation(app.state.container.get_llm_usage_service(), "D", "N")

        created = _create_with(client)
        assert created.status_code == 201, created.text
        assert created.json()["generation"]["output_text"] == NODE_OUTPUT

        answered = client.post(
            f"{BASE}/{created.json()['id']}/messages", json={"content": "Pourquoi ce ton ?"}
        )
        assert answered.status_code == 201, answered.text
        assert "DummyLLMClient" in answered.json()["assistant_message"]["content"]
        assert len(client.get(f"{BASE}/{created.json()['id']}").json()["messages"]) == 2
    finally:
        app.dependency_overrides.clear()


def _create_with(client: TestClient) -> Any:
    return client.post(
        BASE,
        json={"subject": {"kind": "dialogue_node", "dialogue_id": "D", "node_id": "N"}},
    )

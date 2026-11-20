"""Tests du service de conversations IA (sujet ``dialogue_node``)."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from types import SimpleNamespace
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Set, Tuple
from unittest.mock import MagicMock

import pytest

from api.exceptions import AllLLMProvidersUnavailableError
from core.llm.llm_client import DummyLLMClient
from core.llm.openai.client import STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX
from models.llm_usage import LLMUsageRecord
from services.ai_conversation_service import (
    AIConversationNotFoundError,
    AIConversationService,
    ConversationBudgetExceededError,
    ConversationFullError,
    ConversationLLMError,
    DialogueNodeSubjectResolver,
    InvalidSubjectError,
    SubjectAccessDeniedError,
    UnknownModelError,
    dialogue_node_subject_key,
)
from services.configuration_service import ConfigurationService
from services.document_persistence_service import (
    DialogueAccessDeniedError,
    DialogueNotFoundError,
)
from services.generation_trace import GenerationTraceUnavailableError
from services.llm_pricing_service import LLMPricingService
from services.llm_usage_service import LLMUsageService
from services.repositories.llm_usage_repository import FileLLMUsageRepository
from services.repositories.sqlite.ai_conversations_repository import AIConversationsRepository
from services.repositories.sqlite.connection import DatabaseConnection

WRITER_A = {"id": "writer-a", "username": "writer-a", "role": "writer", "is_active": True}
WRITER_B = {"id": "writer-b", "username": "writer-b", "role": "writer", "is_active": True}
GENERATION_INSTRUCTIONS = "Tu es le scénariste du jeu."
GENERATION_PROMPT = "Écris la réplique du garde."
NODE_OUTPUT = json.dumps(
    {"title": "Garde", "node": {"displayName": "Le garde hésite", "line": "Halte !"}},
    ensure_ascii=False,
)


class FakeDialogueAccess:
    """Autorité d'accès minimale : lecteurs autorisés et documents enregistrés."""

    def __init__(self) -> None:
        self.readers: Set[Tuple[str, str]] = set()
        self.read_only: Set[Tuple[str, str]] = set()
        self.documents: Dict[str, Dict[str, Any]] = {}
        self.read_dirs: List[Path] = []

    def require_access(self, document_id: str, current_user: Mapping[str, object]) -> None:
        """Lève comme ``DocumentPersistenceService.require_access``."""
        if (str(current_user.get("id")), document_id) not in self.readers:
            raise DialogueAccessDeniedError(f"Accès refusé au dialogue {document_id}")

    def require_edit(self, document_id: str, current_user: Mapping[str, object]) -> None:
        """Lève comme ``DocumentPersistenceService.require_edit`` : lecteur sans droit d'écriture."""
        self.require_access(document_id, current_user)
        if (str(current_user.get("id")), document_id) in self.read_only:
            raise DialogueAccessDeniedError(f"Écriture refusée pour le dialogue {document_id}")

    def read_document(
        self, base_dir: Path, document_id: str, current_user: Mapping[str, object]
    ) -> SimpleNamespace:
        """Comme ``DocumentPersistenceService.read_document`` : accès, puis document ou 404."""
        self.require_access(document_id, current_user)
        self.read_dirs.append(base_dir)
        if document_id not in self.documents:
            raise DialogueNotFoundError(document_id)
        return SimpleNamespace(document=self.documents[document_id])


class FakeBudget:
    """Gouvernance des coûts pilotable."""

    def __init__(self) -> None:
        self.allowed = True
        self.calls: List[Tuple[str, float]] = []

    def check_budget(self, user_id: str, estimated_cost: float) -> Dict[str, Any]:
        """Retourne la décision configurée."""
        self.calls.append((user_id, estimated_cost))
        return {"allowed": self.allowed, "percentage": 120.0 if not self.allowed else 1.0, "warning": "Budget dépassé"}


@dataclass
class FakeConversationClient:
    """Faux client LLM : répond en texte et, s'il a un suivi d'usage, trace l'appel."""

    usage: Optional[LLMUsageService]
    request_id: str
    answers: List[Any] = field(default_factory=list)
    reasoning_summary: Optional[str] = None
    raise_error: Optional[BaseException] = None
    delay: float = 0.0
    calls: List[Dict[str, Any]] = field(default_factory=list)
    last_call_cost: float = 0.0

    async def generate_variants(
        self,
        prompt: str,
        k: int = 1,
        response_model: Any = None,
        previous_dialogue_context: Optional[List[Dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
    ) -> List[Any]:
        """Enregistre l'appel et retourne la réponse suivante."""
        self.calls.append(
            {
                "prompt": prompt,
                "response_model": response_model,
                "context": [dict(m) for m in previous_dialogue_context or []],
                "instructions": user_system_prompt_override,
            }
        )
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.raise_error is not None:
            raise self.raise_error
        answer = self.answers.pop(0) if self.answers else f"Réponse {len(self.calls)}"
        if self.usage is not None and isinstance(answer, str) and not answer.startswith("Erreur"):
            output: List[Dict[str, Any]] = []
            if self.reasoning_summary:
                output.append(
                    {"type": "reasoning", "summary": [{"type": "summary_text", "text": self.reasoning_summary}]}
                )
            output.append(
                {"type": "message", "content": [{"type": "output_text", "text": answer}]}
            )
            self.usage.track_usage(
                request_id=self.request_id,
                model_name="gpt-6.2-sol",
                prompt_tokens=100,
                completion_tokens=20,
                total_tokens=120,
                duration_ms=1,
                success=True,
                endpoint="ai_conversation",
                prompt=prompt,
                response=json.dumps({"output": output}),
            )
            self.last_call_cost = 0.0042
        return [answer]

    def get_max_tokens(self) -> int:
        """Plafond factice."""
        return 1000


@dataclass
class Harness:
    """Service sous test et ses doublures."""

    service: AIConversationService
    usage: LLMUsageService
    access: FakeDialogueAccess
    budget: FakeBudget
    clients: List[FakeConversationClient]
    client_template: Dict[str, Any]


def _insert_users(database: DatabaseConnection) -> None:
    """Crée les propriétaires référencés par la clé étrangère ``owner_id``."""
    for user_id in ("writer-a", "writer-b"):
        database.execute(
            "INSERT INTO users(id, username, role, is_active, created_at, updated_at) "
            "VALUES (?, ?, 'writer', 1, datetime('now'), datetime('now'))",
            (user_id, user_id),
        )


def _build(
    tmp_path: Path,
    database: DatabaseConnection,
    *,
    max_messages: int = 40,
) -> Harness:
    """Assemble le service avec dépôt d'usage fichier, SQLite isolée et faux client."""
    _insert_users(database)
    usage = LLMUsageService(
        repository=FileLLMUsageRepository(storage_dir=str(tmp_path / "usage")),
        pricing_service=LLMPricingService(),
    )
    access = FakeDialogueAccess()
    budget = FakeBudget()
    config = MagicMock(spec=ConfigurationService)
    config.get_available_llm_models.return_value = [
        {"api_identifier": "gpt-6.2-sol"},
        {"api_identifier": "gpt-6-luna"},
    ]
    config.get_llm_config.return_value = {"default_model": "gpt-6-luna"}
    clients: List[FakeConversationClient] = []
    config.get_unity_dialogues_path.return_value = tmp_path / "Dialogues"
    template: Dict[str, Any] = {
        "track": True,
        "answers": [],
        "reasoning_summary": None,
        "raise_error": None,
        "factory_error": None,
        "delay": 0.0,
    }

    def factory(model_id: str, request_id: str) -> FakeConversationClient:
        if template["factory_error"] is not None:
            raise template["factory_error"]
        client = FakeConversationClient(
            usage=usage if template["track"] else None,
            request_id=request_id,
            answers=list(template["answers"]),
            reasoning_summary=template["reasoning_summary"],
            raise_error=template["raise_error"],
            delay=template["delay"],
        )
        client.model_id = model_id  # type: ignore[attr-defined]
        clients.append(client)
        return client

    service = AIConversationService(
        repository=AIConversationsRepository(database),
        usage_service=usage,
        cost_governance_service=budget,  # type: ignore[arg-type]
        config_service=config,
        llm_client_factory=factory,  # type: ignore[arg-type]
        resolvers=[DialogueNodeSubjectResolver(access, usage, config)],  # type: ignore[arg-type]
        max_messages=max_messages,
    )
    return Harness(service, usage, access, budget, clients, template)


def _seed_generation(
    usage: LLMUsageService,
    dialogue_id: str,
    node_id: str,
    *,
    output: str = NODE_OUTPUT,
    summary: Optional[str] = "Le garde doute : je l'ai fait hésiter.",
    success: bool = True,
    model_name: str = "gpt-5.6-terra",
) -> str:
    """Trace une génération au format OpenAI Responses et l'annote sur (dialogue, nœud)."""
    prompt = (
        f"{GENERATION_INSTRUCTIONS}{STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX}\n\n--- Input ---\n"
        + json.dumps([{"role": "user", "content": GENERATION_PROMPT}], ensure_ascii=False)
    )
    items: List[Dict[str, Any]] = []
    if summary:
        items.append({"type": "reasoning", "summary": [{"type": "summary_text", "text": summary}]})
    items.append({"type": "function_call", "name": "generate_interaction", "arguments": output})
    call_id = usage.track_usage(
        request_id="req-generation",
        model_name=model_name,
        prompt_tokens=12000,
        completion_tokens=300,
        total_tokens=12300,
        duration_ms=10,
        success=success,
        endpoint="graph/generate-node",
        prompt=prompt,
        response=json.dumps({"output": items}),
    )
    assert call_id is not None
    usage.annotate_call(call_id, dialogue_id, node_id)
    return call_id


@pytest.fixture
def harness(tmp_path: Path, isolated_app_database: DatabaseConnection) -> Harness:
    """Service prêt : writer-a lit le dialogue D, dont le nœud N a une génération tracée."""
    built = _build(tmp_path, isolated_app_database)
    built.access.readers.add(("writer-a", "D"))
    _seed_generation(built.usage, "D", "N")
    return built


def _subject(dialogue_id: str = "D", node_id: str = "N") -> Dict[str, str]:
    return {"kind": "dialogue_node", "dialogue_id": dialogue_id, "node_id": node_id}


def test_create_copies_generation_snapshot(harness: Harness) -> None:
    """Création : sortie = arguments de l'appel de fonction, résumé, modèle normalisé, aucun message."""
    view = harness.service.create(WRITER_A, _subject())

    assert view.subject == _subject()
    assert view.generation["output_text"] == NODE_OUTPUT
    assert view.generation["reasoning_summary"] == "Le garde doute : je l'ai fait hésiter."
    assert view.generation["model_name"] == "gpt-5.6-terra"
    assert view.model_name == "gpt-6.2-sol"
    assert view.title == "Le garde hésite"
    assert view.messages == []


def test_create_accepts_dialogue_id_with_json_suffix(harness: Harness) -> None:
    """Le sujet ``D.json`` est normalisé en ``D``."""
    view = harness.service.create(WRITER_A, _subject("D.json"))
    assert view.subject["dialogue_id"] == "D"


def test_trace_annotated_with_json_suffix_and_most_recent_wins(
    tmp_path: Path, isolated_app_database: DatabaseConnection
) -> None:
    """Records sous ``D`` et ``D.json`` : les deux formes sont cherchées, le plus récent gagne."""
    built = _build(tmp_path, isolated_app_database)
    built.access.readers.add(("writer-a", "D"))
    _seed_generation(built.usage, "D", "N", output='{"node": {"line": "ancienne"}}')
    _seed_generation(built.usage, "D.json", "N", output='{"node": {"line": "récente"}}')

    view = built.service.create(WRITER_A, _subject("D"))
    assert view.generation["output_text"] == '{"node": {"line": "récente"}}'


def test_trace_only_under_json_suffix_is_found(
    tmp_path: Path, isolated_app_database: DatabaseConnection
) -> None:
    """Record annoté ``D.json`` seulement, requête ``D`` : trace trouvée."""
    built = _build(tmp_path, isolated_app_database)
    built.access.readers.add(("writer-a", "D"))
    _seed_generation(built.usage, "D.json", "N")
    assert built.service.create(WRITER_A, _subject("D")).generation["output_text"] == NODE_OUTPUT


@pytest.mark.parametrize(
    "seed",
    [
        None,
        {"success": False},
        {"output": "   "},
    ],
    ids=["record_absent", "record_en_echec", "sortie_vide"],
)
def test_create_without_usable_trace_creates_nothing(
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
    seed: Optional[Dict[str, Any]],
) -> None:
    """Pas de trace exploitable ⇒ GenerationTraceUnavailableError, rien n'est créé."""
    built = _build(tmp_path, isolated_app_database)
    built.access.readers.add(("writer-a", "D"))
    if seed is not None:
        _seed_generation(built.usage, "D", "N", **seed)

    with pytest.raises(GenerationTraceUnavailableError):
        built.service.create(WRITER_A, _subject())
    assert built.service.list_for_user(WRITER_A) == []


def test_create_rejects_invalid_subject(harness: Harness) -> None:
    """Identifiant de dialogue invalide ⇒ InvalidSubjectError."""
    with pytest.raises(InvalidSubjectError):
        harness.service.create(WRITER_A, _subject("bad/name"))


def test_create_denied_without_dialogue_access(harness: Harness) -> None:
    """Sans accès au dialogue ⇒ SubjectAccessDeniedError (code dialogue_access_denied)."""
    with pytest.raises(SubjectAccessDeniedError) as excinfo:
        harness.service.create(WRITER_B, _subject())
    assert excinfo.value.code == "dialogue_access_denied"


def test_create_denied_for_read_only_reader(harness: Harness) -> None:
    """Un lecteur d'un dialogue partagé ne rejoue pas le prompt de l'auteur : création refusée."""
    harness.access.readers.add(("writer-b", "D"))
    harness.access.read_only.add(("writer-b", "D"))
    with pytest.raises(SubjectAccessDeniedError) as excinfo:
        harness.service.create(WRITER_B, _subject())
    assert excinfo.value.code == "dialogue_access_denied"


@pytest.mark.asyncio
async def test_two_questions_replay_generation_then_history(harness: Harness) -> None:
    """Deux tours : contexte rejoué en texte, le second reçoit la première paire."""
    conversation = harness.service.create(WRITER_A, _subject())

    first = await harness.service.post_message(
        conversation.id, WRITER_A, "Pourquoi ce ton ?", billable_user_id="writer-a", request_id="req-1"
    )
    second = await harness.service.post_message(
        conversation.id, WRITER_A, "Et la fin ?", billable_user_id="writer-a", request_id="req-2"
    )

    first_call = harness.clients[0].calls[0]
    assert first_call["instructions"] == GENERATION_INSTRUCTIONS
    assert first_call["response_model"] is None
    assert first_call["prompt"] == "Pourquoi ce ton ?"
    context = first_call["context"]
    assert context[0] == {"role": "user", "content": GENERATION_PROMPT}
    assert context[1] == {"role": "assistant", "content": NODE_OUTPUT}
    assert context[2]["role"] == "user"
    assert context[2]["content"].startswith("[Note de l'application]")
    assert "devenue le nœud N" in context[2]["content"]
    assert "Le garde doute" in context[2]["content"]
    assert len(context) == 3

    second_context = harness.clients[1].calls[0]["context"]
    assert second_context[:3] == context
    assert second_context[3:] == [
        {"role": "user", "content": "Pourquoi ce ton ?"},
        {"role": "assistant", "content": first.assistant_message.content},
    ]
    assert harness.clients[1].model_id == "gpt-6.2-sol"  # type: ignore[attr-defined]

    detail = harness.service.get(conversation.id, WRITER_A)
    assert [(m.position, m.role, m.content) for m in detail.messages] == [
        (1, "user", "Pourquoi ce ton ?"),
        (2, "assistant", first.assistant_message.content),
        (3, "user", "Et la fin ?"),
        (4, "assistant", second.assistant_message.content),
    ]


@pytest.mark.asyncio
async def test_turn_keeps_call_id_reasoning_summary_and_cost(harness: Harness) -> None:
    """Le message assistant garde l'appel tracké, son résumé de réflexion et son coût."""
    harness.client_template["reasoning_summary"] = "Je relis ma réplique."
    conversation = harness.service.create(WRITER_A, _subject())

    exchange = await harness.service.post_message(
        conversation.id, WRITER_A, "Pourquoi ?", billable_user_id="writer-a", request_id="req-1"
    )

    assistant = exchange.assistant_message
    assert assistant.reasoning_summary == "Je relis ma réplique."
    assert assistant.llm_call_id is not None
    record = harness.usage.get_record_by_call_id(assistant.llm_call_id)
    assert record is not None and record.endpoint == "ai_conversation"
    assert assistant.cost_usd == pytest.approx(0.0042)
    assert exchange.user_message.reasoning_summary is None


@pytest.mark.asyncio
async def test_untracked_client_answer_is_kept_without_call(harness: Harness) -> None:
    """Client sans suivi d'usage (Dummy) : réponse persistée, sans call_id ni résumé."""
    harness.client_template["track"] = False
    conversation = harness.service.create(WRITER_A, _subject())
    exchange = await harness.service.post_message(
        conversation.id, WRITER_A, "Pourquoi ?", billable_user_id="writer-a", request_id="req-1"
    )
    assert exchange.assistant_message.llm_call_id is None
    assert exchange.assistant_message.reasoning_summary is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "template",
    [
        {"answers": ["Erreur: quota fournisseur"]},
        {"answers": ["Erreur API: 500"]},
        {"answers": ["   "]},
        {"raise_error": RuntimeError("réseau coupé")},
    ],
    ids=["erreur_chaine", "erreur_api", "vide", "exception"],
)
async def test_llm_error_persists_nothing(harness: Harness, template: Dict[str, Any]) -> None:
    """Réponse en erreur ou exception ⇒ ConversationLLMError, aucun message."""
    harness.client_template.update(template)
    conversation = harness.service.create(WRITER_A, _subject())

    with pytest.raises(ConversationLLMError):
        await harness.service.post_message(
            conversation.id, WRITER_A, "Pourquoi ?", billable_user_id="writer-a", request_id="req-1"
        )
    assert harness.service.get(conversation.id, WRITER_A).messages == []


@pytest.mark.asyncio
async def test_all_providers_unavailable_propagates(harness: Harness) -> None:
    """La chaîne de repli épuisée n'est pas convertie en erreur LLM générique."""
    harness.client_template["raise_error"] = AllLLMProvidersUnavailableError()
    conversation = harness.service.create(WRITER_A, _subject())
    with pytest.raises(AllLLMProvidersUnavailableError):
        await harness.service.post_message(
            conversation.id, WRITER_A, "Pourquoi ?", billable_user_id="writer-a", request_id="req-1"
        )


@pytest.mark.asyncio
async def test_budget_exceeded_blocks_before_llm(harness: Harness) -> None:
    """Budget dépassé ⇒ aucune fabrication de client, aucun message ; contrôle sur l'utilisateur facturable."""
    harness.budget.allowed = False
    conversation = harness.service.create(WRITER_A, _subject())
    with pytest.raises(ConversationBudgetExceededError):
        await harness.service.post_message(
            conversation.id, WRITER_A, "Pourquoi ?", billable_user_id="bill-a", request_id="req-1"
        )
    assert harness.clients == []
    assert harness.budget.calls[0][0] == "bill-a"
    assert harness.service.get(conversation.id, WRITER_A).messages == []


@pytest.mark.asyncio
async def test_full_conversation_blocks_before_llm(
    tmp_path: Path, isolated_app_database: DatabaseConnection
) -> None:
    """Plafond atteint ⇒ ConversationFullError sans appel LLM."""
    built = _build(tmp_path, isolated_app_database, max_messages=2)
    built.access.readers.add(("writer-a", "D"))
    _seed_generation(built.usage, "D", "N")
    conversation = built.service.create(WRITER_A, _subject())
    await built.service.post_message(
        conversation.id, WRITER_A, "Q1", billable_user_id="writer-a", request_id="req-1"
    )

    with pytest.raises(ConversationFullError):
        await built.service.post_message(
            conversation.id, WRITER_A, "Q2", billable_user_id="writer-a", request_id="req-2"
        )
    assert len(built.clients) == 1


@pytest.mark.asyncio
async def test_revoked_access_blocks_read_and_message_but_not_delete(harness: Harness) -> None:
    """Accès retiré après création : lecture et message refusés, liste filtrée, suppression permise."""
    conversation = harness.service.create(WRITER_A, _subject())
    harness.access.readers.clear()

    with pytest.raises(SubjectAccessDeniedError):
        harness.service.get(conversation.id, WRITER_A)
    with pytest.raises(SubjectAccessDeniedError):
        await harness.service.post_message(
            conversation.id, WRITER_A, "Pourquoi ?", billable_user_id="writer-a", request_id="req-1"
        )
    assert harness.clients == []
    assert harness.service.list_for_user(WRITER_A) == []
    harness.service.delete(conversation.id, WRITER_A)


@pytest.mark.asyncio
async def test_conversation_is_private_to_owner(harness: Harness) -> None:
    """Un autre utilisateur, même lecteur du dialogue, ne voit pas la conversation."""
    harness.access.readers.add(("writer-b", "D"))
    conversation = harness.service.create(WRITER_A, _subject())

    with pytest.raises(AIConversationNotFoundError):
        harness.service.get(conversation.id, WRITER_B)
    with pytest.raises(AIConversationNotFoundError):
        await harness.service.post_message(
            conversation.id, WRITER_B, "?", billable_user_id="writer-b", request_id="req-1"
        )
    with pytest.raises(AIConversationNotFoundError):
        harness.service.delete(conversation.id, WRITER_B)
    assert harness.service.list_for_user(WRITER_B) == []


def test_model_choice_requested_then_origin_then_default(
    tmp_path: Path, isolated_app_database: DatabaseConnection
) -> None:
    """Modèle demandé, sinon celui de la génération s'il est disponible, sinon le défaut."""
    built = _build(tmp_path, isolated_app_database)
    built.access.readers.add(("writer-a", "D"))
    _seed_generation(built.usage, "D", "N", model_name="mistral-retired")

    assert built.service.create(WRITER_A, _subject(), model_name="gpt-6.2-sol").model_name == "gpt-6.2-sol"
    assert built.service.create(WRITER_A, _subject()).model_name == "gpt-6-luna"


def test_snapshot_survives_regeneration(harness: Harness) -> None:
    """Une régénération ultérieure du même nœud ne change pas une conversation existante."""
    conversation = harness.service.create(WRITER_A, _subject())
    _seed_generation(harness.usage, "D", "N", output='{"node": {"line": "nouvelle version"}}')

    assert harness.service.get(conversation.id, WRITER_A).generation["output_text"] == NODE_OUTPUT
    assert (
        harness.service.create(WRITER_A, _subject()).generation["output_text"]
        == '{"node": {"line": "nouvelle version"}}'
    )


def test_list_filters_by_subject(harness: Harness) -> None:
    """Filtres : clé exacte d'un nœud, préfixe d'un dialogue, type de sujet."""
    harness.access.readers.add(("writer-a", "E"))
    _seed_generation(harness.usage, "D", "M")
    _seed_generation(harness.usage, "E", "N")
    on_dn = harness.service.create(WRITER_A, _subject("D", "N"))
    on_dm = harness.service.create(WRITER_A, _subject("D", "M"))
    on_en = harness.service.create(WRITER_A, _subject("E", "N"))

    by_node = harness.service.list_for_user(
        WRITER_A, subject_key=dialogue_node_subject_key("D", "N")
    )
    assert [c.id for c in by_node] == [on_dn.id]
    by_dialogue = harness.service.list_for_user(
        WRITER_A, subject_key_prefix=dialogue_node_subject_key("D")
    )
    assert {c.id for c in by_dialogue} == {on_dn.id, on_dm.id}
    assert {c.id for c in harness.service.list_for_user(WRITER_A, subject_kind="dialogue_node")} == {
        on_dn.id,
        on_dm.id,
        on_en.id,
    }
    assert harness.service.list_for_user(WRITER_A, subject_kind="gdd_query") == []


@dataclass
class SilentTrackedClient:
    """Client qui déclare un suivi d'usage mais n'a enregistré aucun appel réussi."""

    usage_service: object
    answer: str = "Texte qui ressemble à une réponse"
    last_call_cost: float = 0.0

    async def generate_variants(self, prompt: str, k: int = 1, **_: Any) -> List[str]:
        """Rend une chaîne sans tracer d'appel réussi."""
        return [self.answer]

    def get_max_tokens(self) -> int:
        """Plafond factice."""
        return 1000


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "outage",
    ["Mistral API unavailable: 503", "OpenRouter API unavailable: 502"],
)
async def test_provider_outage_strings_are_not_saved(harness: Harness, outage: str) -> None:
    """Les messages d'indisponibilité Mistral / OpenRouter ⇒ ConversationLLMError, rien de persisté."""
    harness.client_template["answers"] = [outage]
    harness.client_template["track"] = False
    conversation = harness.service.create(WRITER_A, _subject())
    with pytest.raises(ConversationLLMError):
        await harness.service.post_message(
            conversation.id, WRITER_A, "?", billable_user_id="writer-a", request_id="req-1"
        )
    assert harness.service.get(conversation.id, WRITER_A).messages == []


@pytest.mark.asyncio
async def test_tracked_client_without_successful_call_is_an_error(
    tmp_path: Path, isolated_app_database: DatabaseConnection
) -> None:
    """Client qui trace son usage sans appel réussi capturé ⇒ ConversationLLMError ; Dummy accepté."""
    built = _build(tmp_path, isolated_app_database)
    built.access.readers.add(("writer-a", "D"))
    _seed_generation(built.usage, "D", "N")
    conversation = built.service.create(WRITER_A, _subject())

    built.service._llm_client_factory = lambda model_id, request_id: SilentTrackedClient(  # type: ignore[assignment]
        usage_service=built.usage
    )
    with pytest.raises(ConversationLLMError):
        await built.service.post_message(
            conversation.id, WRITER_A, "?", billable_user_id="writer-a", request_id="req-1"
        )

    built.service._llm_client_factory = lambda model_id, request_id: DummyLLMClient(delay_seconds=0)  # type: ignore[assignment]
    exchange = await built.service.post_message(
        conversation.id, WRITER_A, "?", billable_user_id="writer-a", request_id="req-2"
    )
    assert "DummyLLMClient" in exchange.assistant_message.content
    assert exchange.assistant_message.llm_call_id is None


@pytest.mark.asyncio
async def test_client_factory_error_maps_to_llm_error(harness: Harness) -> None:
    """Fabrique qui lève (ex. OpenRouter sans clé : ValueError) ⇒ ConversationLLMError."""
    harness.client_template["factory_error"] = ValueError("OPENROUTER_API_KEY manquante")
    conversation = harness.service.create(WRITER_A, _subject())
    with pytest.raises(ConversationLLMError):
        await harness.service.post_message(
            conversation.id, WRITER_A, "?", billable_user_id="writer-a", request_id="req-1"
        )
    assert harness.service.get(conversation.id, WRITER_A).messages == []


def test_unknown_requested_model_is_rejected(harness: Harness) -> None:
    """Modèle demandé absent de la configuration ⇒ UnknownModelError (code unknown_model)."""
    with pytest.raises(UnknownModelError) as excinfo:
        harness.service.create(WRITER_A, _subject(), model_name="gpt-imaginaire")
    assert excinfo.value.code == "unknown_model"
    assert harness.service.list_for_user(WRITER_A) == []


def test_requested_legacy_model_id_is_normalized(harness: Harness) -> None:
    """Un ancien identifiant demandé est ramené au modèle courant de son rôle."""
    assert harness.service.create(WRITER_A, _subject(), model_name="gpt-5.6-terra").model_name == "gpt-6.2-sol"


@pytest.mark.asyncio
async def test_retired_pinned_model_falls_back_to_default(harness: Harness) -> None:
    """Modèle épinglé retiré de la configuration : le tour utilise le défaut, le message le dit."""
    harness.client_template["track"] = False
    conversation = harness.service.create(WRITER_A, _subject())
    assert conversation.model_name == "gpt-6.2-sol"
    harness.service._config.get_available_llm_models.return_value = [{"api_identifier": "gpt-6-luna"}]  # type: ignore[attr-defined]

    exchange = await harness.service.post_message(
        conversation.id, WRITER_A, "?", billable_user_id="writer-a", request_id="req-1"
    )
    assert harness.clients[0].model_id == "gpt-6-luna"  # type: ignore[attr-defined]
    assert exchange.assistant_message.model_name == "gpt-6-luna"


def _legacy_record(node_id: str, *, output: str) -> LLMUsageRecord:
    """Record antérieur à call_id, annoté sur (D, node_id)."""
    prompt = (
        f"{GENERATION_INSTRUCTIONS}\n\n--- Input ---\n"
        + json.dumps([{"role": "user", "content": GENERATION_PROMPT}], ensure_ascii=False)
    )
    return LLMUsageRecord(
        request_id="req-legacy",
        timestamp=datetime(2026, 10, 1, 12, 0, tzinfo=UTC),
        model_name="gpt-6.2-sol",
        prompt_tokens=1,
        completion_tokens=1,
        total_tokens=2,
        estimated_cost=0.0,
        duration_ms=1,
        success=True,
        endpoint="graph/generate-node",
        dialogue_id="D",
        node_id=node_id,
        prompt=prompt,
        response=json.dumps({"output": [{"type": "function_call", "arguments": output}]}),
    )


def test_legacy_record_with_sibling_calls_is_not_replayed(
    tmp_path: Path, isolated_app_database: DatabaseConnection
) -> None:
    """Record sans call_id dont la requête a fait d'autres appels ⇒ trace indisponible."""
    built = _build(tmp_path, isolated_app_database)
    built.access.readers.add(("writer-a", "D"))
    built.usage.repository.save(_legacy_record("N", output='{"node": {"line": "peut-être pas la mienne"}}'))
    built.usage.repository.save(_legacy_record("M", output='{"node": {"line": "voisine"}}'))

    with pytest.raises(GenerationTraceUnavailableError):
        built.service.create(WRITER_A, _subject())


def test_legacy_single_call_record_is_replayed(
    tmp_path: Path, isolated_app_database: DatabaseConnection
) -> None:
    """Record sans call_id, seul de sa requête : le lien est fiable, la trace est rejouée."""
    built = _build(tmp_path, isolated_app_database)
    built.access.readers.add(("writer-a", "D"))
    built.usage.repository.save(_legacy_record("N", output='{"node": {"line": "la mienne"}}'))

    view = built.service.create(WRITER_A, _subject())
    assert view.generation["output_text"] == '{"node": {"line": "la mienne"}}'
    assert view.generation["call_id"] is None


@pytest.mark.asyncio
async def test_seed_includes_current_node_when_readable(harness: Harness) -> None:
    """Le nœud tel qu'il est dans le dialogue est joint à la note (l'auteur a pu le retoucher)."""
    edited = {"id": "N", "speaker": "PNJ", "line": "Halte, étranger — réplique retouchée."}
    harness.access.documents["D"] = {"schemaVersion": "1.2.0", "nodes": [{"id": "X"}, edited]}
    conversation = harness.service.create(WRITER_A, _subject())

    await harness.service.post_message(
        conversation.id, WRITER_A, "?", billable_user_id="writer-a", request_id="req-1"
    )
    note = harness.clients[0].calls[0]["context"][2]["content"]
    assert "Le nœud tel qu'il est aujourd'hui dans le dialogue (l'auteur a pu le retoucher) :" in note
    assert json.dumps(edited, ensure_ascii=False) in note
    assert harness.access.read_dirs == [harness.service._config.get_unity_dialogues_path()]  # type: ignore[attr-defined]


@pytest.mark.asyncio
@pytest.mark.parametrize("document", [None, {"schemaVersion": "1.2.0", "nodes": [{"id": "AUTRE"}]}])
async def test_seed_omits_current_node_when_unreadable(
    harness: Harness, document: Optional[Dict[str, Any]]
) -> None:
    """Dialogue absent sur disque ou nœud supprimé : la note ne contient que la génération."""
    if document is not None:
        harness.access.documents["D"] = document
    conversation = harness.service.create(WRITER_A, _subject())
    await harness.service.post_message(
        conversation.id, WRITER_A, "?", billable_user_id="writer-a", request_id="req-1"
    )
    assert "tel qu'il est aujourd'hui" not in harness.clients[0].calls[0]["context"][2]["content"]


@pytest.mark.asyncio
async def test_concurrent_turns_are_serialized(harness: Harness) -> None:
    """Deux questions simultanées : la seconde est jouée après la première et la voit."""
    harness.client_template["delay"] = 0.05
    conversation = harness.service.create(WRITER_A, _subject())

    first, second = await asyncio.gather(
        harness.service.post_message(
            conversation.id, WRITER_A, "Question A", billable_user_id="writer-a", request_id="req-a"
        ),
        harness.service.post_message(
            conversation.id, WRITER_A, "Question B", billable_user_id="writer-a", request_id="req-b"
        ),
    )

    second_context = harness.clients[1].calls[0]["context"]
    assert second_context[-2:] == [
        {"role": "user", "content": harness.clients[0].calls[0]["prompt"]},
        {"role": "assistant", "content": "Réponse 1"},
    ]
    positions = sorted(
        (first.user_message.position, first.assistant_message.position,
         second.user_message.position, second.assistant_message.position)
    )
    assert positions == [1, 2, 3, 4]
    assert harness.service._turn_locks == {}  # type: ignore[attr-defined]

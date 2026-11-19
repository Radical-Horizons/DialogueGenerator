"""Conversations avec l'IA, sur des sujets enfichables.

Une conversation part d'un **sujet** (``kind`` + identifiants) qu'un résolveur transforme en
**graine** : les instructions et le contexte que le modèle recevra à chaque tour, plus un
instantané affichable. Premier sujet : ``dialogue_node``, l'IA qui a produit un nœud de
dialogue. Sa graine rejoue la génération en texte (instructions d'origine sans la consigne
d'appel de fonction, messages d'origine, sortie exacte en message assistant, note de
l'application), ce qui marche quel que soit le fournisseur. Voir
``docs/architecture/conversations-ia.md``.

La graine est copiée à la création : une régénération du nœud ou la rotation des journaux
d'usage ne change pas une conversation existante.

Les méthodes synchrones (``create``, ``list_for_user``, ``get``, ``delete``) lisent fichiers
et SQLite : un router async les appelle via ``asyncio.to_thread``. ``post_message`` fait
lui-même passer ses entrées-sorties dans un thread.
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import (
    Any,
    AsyncIterator,
    Callable,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Protocol,
)
from uuid import uuid4

from api.exceptions import AllLLMProvidersUnavailableError
from constants import ModelNames
from core.llm.llm_client import ILLMClient
from services.configuration_service import ConfigurationService
from services.cost_governance_service import CostGovernanceService
from services.document_id_validation import validate_document_id
from services.document_persistence_service import (
    DialogueAccessDeniedError,
    DialogueNotFoundError,
    DocumentPersistenceService,
)
from services.generation_trace import (
    GenerationTrace,
    GenerationTraceUnavailableError,
    extract_reasoning_summary,
    parse_generation_trace,
)
from services.llm_call_provenance import capture_llm_calls
from services.llm_usage_service import LLMUsageService
from services.repositories.sqlite.ai_conversations_repository import (
    AIConversationCapacityError,
    AIConversationEntry,
    AIConversationMessageEntry,
    AIConversationMissingError,
    AIConversationsRepository,
    NewAIConversationMessage,
)

logger = logging.getLogger(__name__)

MAX_CONVERSATION_MESSAGES = 40
AI_CONVERSATION_ENDPOINT = "ai_conversation"
DIALOGUE_NODE_SUBJECT_KIND = "dialogue_node"
_TITLE_MAX_LENGTH = 120
# Estimation pour le contrôle budget avant appel (le coût réel est relevé après).
_ESTIMATED_COMPLETION_TOKENS = 1000
_CHARS_PER_TOKEN = 4
# Chaînes que les clients LLM rendent à la place d'une réponse quand l'appel échoue.
_LLM_ERROR_PREFIXES = (
    "Erreur: ",
    "Erreur API: ",
    "Mistral API unavailable: ",
    "OpenRouter API unavailable: ",
)
_CURRENT_NODE_HEADER = (
    "Le nœud tel qu'il est aujourd'hui dans le dialogue (l'auteur a pu le retoucher) :"
)

LLMClientFactoryFn = Callable[[str, str], ILLMClient]
"""Fabrique ``(model_id, request_id) -> client`` ; le client suit son usage."""


# ---------------------------------------------------------------------------
# Erreurs de domaine
# ---------------------------------------------------------------------------


class AIConversationNotFoundError(LookupError):
    """Conversation absente ou appartenant à un autre utilisateur."""


class UnknownSubjectKindError(ValueError):
    """Aucun résolveur n'est enregistré pour ce type de sujet."""


class InvalidSubjectError(ValueError):
    """Les paramètres de la conversation (sujet, modèle) sont invalides."""

    code: Optional[str] = None


class UnknownModelError(InvalidSubjectError):
    """Le modèle demandé ne figure pas dans la configuration."""

    code = "unknown_model"


class SubjectAccessDeniedError(PermissionError):
    """L'utilisateur n'a plus accès à l'objet sur lequel porte la conversation."""

    def __init__(self, code: str, message: str) -> None:
        """Mémorise le code d'erreur exposé par l'API.

        Args:
            code: Code stable (ex. ``dialogue_access_denied``).
            message: Message lisible.
        """
        super().__init__(message)
        self.code = code


class ConversationFullError(Exception):
    """La conversation a atteint son plafond de messages."""


class ConversationBudgetExceededError(Exception):
    """Le budget LLM de l'utilisateur ne permet pas un nouveau tour."""

    def __init__(self, message: str, *, percentage: float, estimated_cost: float) -> None:
        """Mémorise le détail du contrôle budget.

        Args:
            message: Message lisible.
            percentage: Pourcentage du budget après ce tour.
            estimated_cost: Coût estimé du tour (USD).
        """
        super().__init__(message)
        self.percentage = percentage
        self.estimated_cost = estimated_cost


class ConversationLLMError(RuntimeError):
    """Le modèle n'a pas produit de réponse exploitable."""


# ---------------------------------------------------------------------------
# Graine et vues
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ConversationSeed:
    """Ce qu'un résolveur fournit pour ouvrir une conversation."""

    subject: Dict[str, Any]
    subject_key: str
    title: str
    instructions: str
    context_messages: List[Dict[str, str]]
    generation: Dict[str, Any]
    origin_model_name: Optional[str] = None


@dataclass(frozen=True)
class AIConversationMessageView:
    """Message d'une conversation, prêt pour l'API."""

    id: str
    position: int
    role: str
    content: str
    reasoning_summary: Optional[str]
    llm_call_id: Optional[str]
    model_name: Optional[str]
    cost_usd: Optional[float]
    created_at: str


@dataclass(frozen=True)
class AIConversationSummary:
    """Conversation sans ses messages (listes)."""

    id: str
    subject_kind: str
    subject: Dict[str, Any]
    title: str
    model_name: str
    message_count: int
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class AIConversationView:
    """Conversation complète : instantané de génération et messages."""

    id: str
    subject_kind: str
    subject: Dict[str, Any]
    title: str
    model_name: str
    generation: Dict[str, Any]
    created_at: str
    updated_at: str
    messages: List[AIConversationMessageView] = field(default_factory=list)


@dataclass(frozen=True)
class AIConversationExchange:
    """Question posée et réponse obtenue lors d'un tour."""

    user_message: AIConversationMessageView
    assistant_message: AIConversationMessageView


@dataclass(frozen=True)
class _PreparedTurn:
    """Ce qu'un tour envoie au modèle (préparé hors de la boucle d'événements)."""

    model_id: str
    instructions: str
    context: List[Dict[str, str]]


class AIConversationSubjectResolver(Protocol):
    """Transforme un sujet en graine et contrôle l'accès à l'objet visé."""

    kind: str

    def resolve(
        self,
        subject: Mapping[str, Any],
        current_user: Mapping[str, object],
    ) -> ConversationSeed:
        """Vérifie l'accès et construit la graine.

        Raises:
            InvalidSubjectError: Identifiants invalides.
            SubjectAccessDeniedError: Accès refusé à l'objet.
            GenerationTraceUnavailableError: Rien à rejouer pour ce sujet.
        """
        ...

    def check_access(
        self,
        subject: Mapping[str, Any],
        current_user: Mapping[str, object],
    ) -> None:
        """Revérifie l'accès à l'objet (à chaque lecture et à chaque message).

        Raises:
            InvalidSubjectError: Identifiants invalides.
            SubjectAccessDeniedError: Accès refusé à l'objet.
        """
        ...


# ---------------------------------------------------------------------------
# Sujet « dialogue_node »
# ---------------------------------------------------------------------------


def dialogue_node_subject_key(dialogue_id: str, node_id: Optional[str] = None) -> str:
    """Clé de sujet d'un nœud de dialogue, ou préfixe commun aux nœuds d'un dialogue.

    Args:
        dialogue_id: Identifiant du dialogue (sans ``.json``).
        node_id: Identifiant du nœud ; absent, la fonction rend le préfixe du dialogue.
    """
    prefix = f"{DIALOGUE_NODE_SUBJECT_KIND}:{dialogue_id}:"
    return prefix if node_id is None else f"{prefix}{node_id}"


def build_application_note(
    node_id: str,
    reasoning_summary: Optional[str],
    current_node: Optional[Mapping[str, Any]] = None,
) -> str:
    """Note qui ouvre la discussion après la génération rejouée.

    Elle dit au modèle ce qu'il retrouve (contexte, réponse, résumé de réflexion s'il
    existe) et ce qu'il ne retrouve pas (son raisonnement interne), pour qu'il distingue
    ce qu'il relit de ce qu'il reconstruit. Quand le nœud est lisible dans le dialogue,
    son état actuel est joint : l'auteur a pu le retoucher depuis la génération.

    Args:
        node_id: Nœud devenu la réponse du modèle.
        reasoning_summary: Résumé lisible du raisonnement de la génération, s'il existe.
        current_node: Le nœud tel qu'il est aujourd'hui dans le dialogue, s'il a été lu.
    """
    available = (
        "du contexte exact, de ta réponse exacte et du résumé de ta réflexion ci-dessous"
        if reasoning_summary
        else "du contexte exact et de ta réponse exacte"
    )
    lines = [
        "[Note de l'application] La génération est terminée : ta réponse ci-dessus est "
        f"devenue le nœud {node_id}.",
        "L'auteur du jeu ouvre une discussion avec toi sur ce nœud. Réponds en français, "
        "en texte libre, sans JSON ni appel de fonction. Ton raisonnement interne de la "
        f"génération n'a pas été conservé ; tu disposes {available}. Distingue ce que tu "
        "retrouves dans ces éléments de ce que tu reconstruis après coup ; n'invente pas "
        "de souvenir.",
    ]
    if reasoning_summary:
        lines.append(f"Résumé de ta réflexion pendant la génération :\n{reasoning_summary}")
    if current_node is not None:
        lines.append(
            f"{_CURRENT_NODE_HEADER}\n{json.dumps(dict(current_node), ensure_ascii=False)}"
        )
    return "\n".join(lines)


def _node_title(output_text: str, node_id: str) -> str:
    """Titre lisible : nom affiché du nœud généré s'il est lisible, sinon son id."""
    try:
        payload = json.loads(output_text)
    except (json.JSONDecodeError, TypeError):
        payload = None
    if isinstance(payload, dict):
        node = payload.get("node")
        candidates = [
            node.get("displayName") if isinstance(node, dict) else None,
            payload.get("title"),
        ]
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()[:_TITLE_MAX_LENGTH]
    return f"Nœud {node_id}"[:_TITLE_MAX_LENGTH]


def _aware(moment: datetime) -> datetime:
    """Rend comparables les horodatages anciens (naïfs) et récents (UTC)."""
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


class DialogueNodeSubjectResolver:
    """Sujet ``dialogue_node`` : discuter avec l'IA qui a produit un nœud."""

    kind = DIALOGUE_NODE_SUBJECT_KIND

    def __init__(
        self,
        persistence_service: DocumentPersistenceService,
        usage_service: LLMUsageService,
        config_service: Optional[ConfigurationService] = None,
    ) -> None:
        """Injecte l'autorité d'accès aux dialogues, le suivi d'usage et la configuration.

        Args:
            persistence_service: Contrôle d'accès et lecture des dialogues.
            usage_service: Historique des appels LLM (traces de génération).
            config_service: Donne le dossier des dialogues, pour joindre l'état actuel du
                nœud ; absent, la note ne contient que la génération.
        """
        self._persistence = persistence_service
        self._usage = usage_service
        self._config = config_service

    @staticmethod
    def _normalize(subject: Mapping[str, Any]) -> tuple[str, str]:
        """Valide et normalise ``(dialogue_id, node_id)`` (``.json`` retiré)."""
        try:
            dialogue_id = validate_document_id(str(subject.get("dialogue_id") or ""))
        except ValueError as exc:
            raise InvalidSubjectError(str(exc)) from exc
        node_id = str(subject.get("node_id") or "").strip()
        if not node_id:
            raise InvalidSubjectError("L'identifiant du nœud est vide.")
        return dialogue_id, node_id

    def _require_access(self, dialogue_id: str, current_user: Mapping[str, object]) -> None:
        """Traduit le refus d'accès au dialogue en erreur de sujet."""
        try:
            self._persistence.require_access(dialogue_id, current_user)
        except DialogueAccessDeniedError as exc:
            raise SubjectAccessDeniedError("dialogue_access_denied", str(exc)) from exc

    def check_access(
        self,
        subject: Mapping[str, Any],
        current_user: Mapping[str, object],
    ) -> None:
        """Revérifie la lecture du dialogue (un partage a pu être révoqué)."""
        dialogue_id, _ = self._normalize(subject)
        self._require_access(dialogue_id, current_user)

    def _read_current_node(
        self,
        dialogue_id: str,
        node_id: str,
        current_user: Mapping[str, object],
    ) -> Optional[Dict[str, Any]]:
        """Le nœud tel qu'il est enregistré dans le dialogue, ou None s'il est illisible."""
        if self._config is None:
            return None
        try:
            base_dir = self._config.get_unity_dialogues_path()
            if not base_dir:
                return None
            persisted = self._persistence.read_document(Path(base_dir), dialogue_id, current_user)
        except (
            DialogueNotFoundError,
            DialogueAccessDeniedError,
            ValueError,
            TypeError,
            OSError,
        ) as exc:
            logger.debug("Nœud %s de %s non joint à la graine : %s", node_id, dialogue_id, exc)
            return None
        for node in persisted.document.get("nodes") or []:
            if isinstance(node, dict) and str(node.get("id")) == node_id:
                return node
        logger.debug("Nœud %s absent du dialogue %s : non joint à la graine", node_id, dialogue_id)
        return None

    def resolve(
        self,
        subject: Mapping[str, Any],
        current_user: Mapping[str, object],
    ) -> ConversationSeed:
        """Graine : la génération du nœud rejouée en texte, plus la note de l'application."""
        dialogue_id, node_id = self._normalize(subject)
        self._require_access(dialogue_id, current_user)
        lookup = self._usage.find_node_generation_record(
            (dialogue_id, f"{dialogue_id}.json"), node_id
        )
        if lookup.record is None:
            raise GenerationTraceUnavailableError(
                "Aucune génération IA n'est enregistrée pour ce nœud."
            )
        if lookup.legacy_ambiguous:
            raise GenerationTraceUnavailableError(
                "La génération de ce nœud date d'avant le suivi par appel et sa requête en a "
                "produit d'autres : le lien nœud → génération n'est pas fiable."
            )
        trace: GenerationTrace = parse_generation_trace(lookup.record)
        current_node = self._read_current_node(dialogue_id, node_id, current_user)
        context_messages = [
            *trace.input_messages,
            {"role": "assistant", "content": trace.output_text},
            {
                "role": "user",
                "content": build_application_note(
                    node_id, trace.reasoning_summary, current_node
                ),
            },
        ]
        return ConversationSeed(
            subject={
                "kind": self.kind,
                "dialogue_id": dialogue_id,
                "node_id": node_id,
            },
            subject_key=dialogue_node_subject_key(dialogue_id, node_id),
            title=_node_title(trace.output_text, node_id),
            instructions=trace.instructions,
            context_messages=context_messages,
            generation={
                "output_text": trace.output_text,
                "reasoning_summary": trace.reasoning_summary,
                "model_name": trace.model_name,
                "generated_at": _aware(trace.generated_at).isoformat(),
                "request_id": trace.request_id,
                "call_id": trace.call_id,
            },
            origin_model_name=trace.model_name,
        )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


def _utc_now_iso() -> str:
    """Horodatage UTC ISO-8601 (microsecondes conservées : ordre stable des tours)."""
    return datetime.now(UTC).isoformat()


def _owner_id(current_user: Mapping[str, object]) -> str:
    """Identifiant stable de l'utilisateur courant."""
    user_id = current_user.get("id")
    if not isinstance(user_id, str) or not user_id:
        raise ValueError("Identifiant utilisateur manquant")
    return user_id


def _message_view(entry: AIConversationMessageEntry) -> AIConversationMessageView:
    """Mappe une ligne persistée vers sa vue."""
    return AIConversationMessageView(
        id=entry.id,
        position=entry.position,
        role=entry.role,
        content=entry.content,
        reasoning_summary=entry.reasoning_summary,
        llm_call_id=entry.llm_call_id,
        model_name=entry.model_name,
        cost_usd=entry.cost_usd,
        created_at=entry.created_at,
    )


def _client_tracks_usage(client: object) -> bool:
    """Le client enregistre-t-il ses appels dans le suivi d'usage ?

    ``FallbackLLMClient`` le dit pour le client qui a répondu (``tracks_usage``) ; les
    autres clients tracent quand ils ont un ``usage_service`` (``DummyLLMClient`` : jamais).
    """
    tracks = getattr(client, "tracks_usage", None)
    if isinstance(tracks, bool):
        return tracks
    return getattr(client, "usage_service", None) is not None


def build_default_llm_client_factory(
    config_service: ConfigurationService,
    usage_service: LLMUsageService,
) -> LLMClientFactoryFn:
    """Fabrique de clients réels, suivis sous l'endpoint ``ai_conversation``.

    La chaîne de repli configurée s'applique comme pour la génération du graphe.

    Args:
        config_service: Configuration LLM (modèles disponibles, clés, repli).
        usage_service: Suivi d'usage partagé (coût, budget, provenance).
    """
    from factories.llm_factory import create_llm_client_with_configured_fallback

    def create(model_id: str, request_id: str) -> ILLMClient:
        return create_llm_client_with_configured_fallback(
            model_id,
            config_service,
            usage_service,
            request_id,
            endpoint=AI_CONVERSATION_ENDPOINT,
        )

    return create


class AIConversationService:
    """Crée, liste, lit, supprime les conversations et en joue les tours."""

    def __init__(
        self,
        *,
        repository: AIConversationsRepository,
        usage_service: LLMUsageService,
        cost_governance_service: CostGovernanceService,
        config_service: ConfigurationService,
        llm_client_factory: LLMClientFactoryFn,
        resolvers: Iterable[AIConversationSubjectResolver] = (),
        max_messages: int = MAX_CONVERSATION_MESSAGES,
    ) -> None:
        """Injecte persistance, suivi d'usage, budget, configuration et résolveurs."""
        self._repository = repository
        self._usage = usage_service
        self._cost_governance = cost_governance_service
        self._config = config_service
        self._llm_client_factory = llm_client_factory
        self._max_messages = max_messages
        self._resolvers: Dict[str, AIConversationSubjectResolver] = {}
        for resolver in resolvers:
            self.register_resolver(resolver)
        # Un tour à la fois par conversation (un seul worker gunicorn) : sinon deux
        # questions simultanées paient deux appels sans le contexte l'une de l'autre.
        self._turn_locks: Dict[str, asyncio.Lock] = {}
        self._turn_users: Dict[str, int] = {}

    def register_resolver(self, resolver: AIConversationSubjectResolver) -> None:
        """Enregistre (ou remplace) le résolveur d'un type de sujet."""
        self._resolvers[resolver.kind] = resolver

    def _resolver_for(self, kind: str) -> AIConversationSubjectResolver:
        """Résolveur d'un type de sujet."""
        resolver = self._resolvers.get(kind)
        if resolver is None:
            raise UnknownSubjectKindError(f"Type de sujet inconnu : {kind!r}")
        return resolver

    def _require_owned(
        self,
        conversation_id: str,
        current_user: Mapping[str, object],
    ) -> AIConversationEntry:
        """Conversation de l'utilisateur courant ; celle d'un autre est introuvable."""
        entry = self._repository.get_by_id(conversation_id)
        if entry is None or entry.owner_id != _owner_id(current_user):
            raise AIConversationNotFoundError("Conversation introuvable")
        return entry

    def _check_subject_access(
        self,
        entry: AIConversationEntry,
        current_user: Mapping[str, object],
    ) -> Dict[str, Any]:
        """Revérifie l'accès à l'objet du sujet ; retourne le sujet désérialisé."""
        subject = json.loads(entry.subject_json)
        self._resolver_for(entry.subject_kind).check_access(subject, current_user)
        return subject

    def _is_available_model(self, model_id: str) -> bool:
        """Le modèle figure-t-il dans la configuration ?"""
        return any(
            isinstance(model, dict)
            and model_id in (model.get("api_identifier"), model.get("model_identifier"))
            for model in self._config.get_available_llm_models()
        )

    def _default_model(self) -> str:
        """Modèle par défaut de la configuration."""
        default_model = self._config.get_llm_config().get("default_model")
        return str(default_model or ModelNames.STANDARD)

    def _choose_model(self, requested: Optional[str], origin: Optional[str]) -> str:
        """Modèle demandé (s'il est configuré), sinon celui de la génération s'il l'est encore, sinon défaut.

        Raises:
            UnknownModelError: Le modèle demandé n'est pas configuré.
        """
        if requested and requested.strip():
            normalized = ModelNames.normalize_model_id(requested.strip())
            if not self._is_available_model(normalized):
                raise UnknownModelError(f"Modèle inconnu ou non configuré : {requested.strip()!r}")
            return normalized
        if origin:
            normalized = ModelNames.normalize_model_id(origin)
            if self._is_available_model(normalized):
                return normalized
        return self._default_model()

    def _model_for_turn(self, pinned: str) -> str:
        """Modèle de la conversation, ou le défaut s'il a été retiré de la configuration."""
        if self._is_available_model(pinned):
            return pinned
        fallback = self._default_model()
        logger.info("Modèle %r retiré de la configuration : tour joué avec %r", pinned, fallback)
        return fallback

    def _to_view(self, entry: AIConversationEntry) -> AIConversationView:
        """Vue complète d'une conversation."""
        seed = json.loads(entry.seed_json)
        messages = [_message_view(m) for m in self._repository.list_messages(entry.id)]
        return AIConversationView(
            id=entry.id,
            subject_kind=entry.subject_kind,
            subject=json.loads(entry.subject_json),
            title=entry.title,
            model_name=entry.model_name,
            generation=dict(seed.get("generation") or {}),
            created_at=entry.created_at,
            updated_at=entry.updated_at,
            messages=messages,
        )

    def create(
        self,
        current_user: Mapping[str, object],
        subject: Mapping[str, Any],
        *,
        model_name: Optional[str] = None,
    ) -> AIConversationView:
        """Ouvre une conversation : résout le sujet et copie sa graine.

        Raises:
            UnknownSubjectKindError, InvalidSubjectError (dont UnknownModelError),
            SubjectAccessDeniedError, GenerationTraceUnavailableError: Rien n'est créé.
        """
        resolver = self._resolver_for(str(subject.get("kind") or ""))
        seed = resolver.resolve(subject, current_user)
        chosen_model = self._choose_model(model_name, seed.origin_model_name)
        now = _utc_now_iso()
        entry = self._repository.create(
            AIConversationEntry(
                id=uuid4().hex,
                owner_id=_owner_id(current_user),
                subject_kind=resolver.kind,
                subject_key=seed.subject_key,
                subject_json=json.dumps(seed.subject, ensure_ascii=False),
                title=seed.title,
                model_name=chosen_model,
                seed_json=json.dumps(
                    {
                        "instructions": seed.instructions,
                        "context_messages": seed.context_messages,
                        "generation": seed.generation,
                    },
                    ensure_ascii=False,
                ),
                created_at=now,
                updated_at=now,
            )
        )
        logger.info(
            "Conversation IA %s créée (sujet %s, modèle %s)",
            entry.id,
            entry.subject_key,
            entry.model_name,
        )
        return self._to_view(entry)

    def list_for_user(
        self,
        current_user: Mapping[str, object],
        *,
        subject_kind: Optional[str] = None,
        subject_key: Optional[str] = None,
        subject_key_prefix: Optional[str] = None,
    ) -> List[AIConversationSummary]:
        """Conversations de l'utilisateur dont il peut encore lire le sujet."""
        entries = self._repository.list_for_owner(
            _owner_id(current_user),
            subject_kind=subject_kind,
            subject_key=subject_key,
            subject_key_prefix=subject_key_prefix,
        )
        readable: List[AIConversationEntry] = []
        for entry in entries:
            try:
                self._check_subject_access(entry, current_user)
            except (SubjectAccessDeniedError, InvalidSubjectError, UnknownSubjectKindError):
                continue
            readable.append(entry)
        counts = self._repository.message_counts([entry.id for entry in readable])
        return [
            AIConversationSummary(
                id=entry.id,
                subject_kind=entry.subject_kind,
                subject=json.loads(entry.subject_json),
                title=entry.title,
                model_name=entry.model_name,
                message_count=counts.get(entry.id, 0),
                created_at=entry.created_at,
                updated_at=entry.updated_at,
            )
            for entry in readable
        ]

    def get(
        self,
        conversation_id: str,
        current_user: Mapping[str, object],
    ) -> AIConversationView:
        """Conversation complète, accès au sujet revérifié."""
        entry = self._require_owned(conversation_id, current_user)
        self._check_subject_access(entry, current_user)
        return self._to_view(entry)

    def delete(
        self,
        conversation_id: str,
        current_user: Mapping[str, object],
    ) -> None:
        """Supprime une conversation de l'utilisateur.

        L'accès au sujet n'est pas exigé : supprimer ses propres messages ne révèle rien
        de l'objet, et doit rester possible après la révocation d'un partage.
        """
        self._require_owned(conversation_id, current_user)
        if not self._repository.delete(conversation_id):
            raise AIConversationNotFoundError("Conversation introuvable")

    def _estimate_turn_cost(
        self,
        model_id: str,
        instructions: str,
        context: List[Dict[str, str]],
        question: str,
    ) -> float:
        """Coût estimé d'un tour, contexte rejoué compris (contrôle budget)."""
        characters = len(instructions) + len(question) + sum(
            len(message.get("content") or "") for message in context
        )
        return self._usage.pricing_service.calculate_cost(
            model_name=model_id,
            prompt_tokens=max(1, characters // _CHARS_PER_TOKEN),
            completion_tokens=_ESTIMATED_COMPLETION_TOKENS,
        )

    @asynccontextmanager
    async def _turn_lock(self, conversation_id: str) -> AsyncIterator[None]:
        """Sérialise les tours d'une conversation ; le verrou disparaît quand plus personne n'attend."""
        lock = self._turn_locks.setdefault(conversation_id, asyncio.Lock())
        self._turn_users[conversation_id] = self._turn_users.get(conversation_id, 0) + 1
        try:
            async with lock:
                yield
        finally:
            remaining = self._turn_users[conversation_id] - 1
            if remaining:
                self._turn_users[conversation_id] = remaining
            else:
                del self._turn_users[conversation_id]
                del self._turn_locks[conversation_id]

    def _prepare_turn(
        self,
        conversation_id: str,
        current_user: Mapping[str, object],
        content: str,
        billable_user_id: str,
    ) -> _PreparedTurn:
        """Contrôles (propriétaire, accès, plafond, budget) et contexte du tour. Bloquant."""
        entry = self._require_owned(conversation_id, current_user)
        self._check_subject_access(entry, current_user)
        if self._repository.count_messages(conversation_id) + 2 > self._max_messages:
            raise ConversationFullError("Cette conversation a atteint sa limite de messages.")

        seed = json.loads(entry.seed_json)
        instructions = str(seed.get("instructions") or "")
        context: List[Dict[str, str]] = [
            {"role": str(m["role"]), "content": str(m["content"])}
            for m in seed.get("context_messages") or []
        ]
        context.extend(
            {"role": m.role, "content": m.content}
            for m in self._repository.list_messages(conversation_id)
        )
        model_id = self._model_for_turn(entry.model_name)

        estimated_cost = self._estimate_turn_cost(model_id, instructions, context, content)
        budget = self._cost_governance.check_budget(
            user_id=billable_user_id,
            estimated_cost=estimated_cost,
        )
        if not budget["allowed"]:
            raise ConversationBudgetExceededError(
                str(budget.get("warning") or "Budget LLM mensuel atteint"),
                percentage=float(budget.get("percentage") or 0.0),
                estimated_cost=estimated_cost,
            )
        return _PreparedTurn(model_id=model_id, instructions=instructions, context=context)

    async def _ask(
        self,
        conversation_id: str,
        turn: _PreparedTurn,
        content: str,
        request_id: str,
    ) -> tuple[str, Optional[str], ILLMClient]:
        """Appelle le modèle ; rend la réponse, l'appel tracké et le client utilisé.

        Raises:
            ConversationLLMError: Client impossible à créer, exception, réponse en erreur,
                vide, ou appel non tracké par un client qui trace son usage.
            AllLLMProvidersUnavailableError: Chaîne de repli épuisée.
        """
        try:
            llm_client = self._llm_client_factory(turn.model_id, request_id)
            with capture_llm_calls() as llm_calls:
                variants = await llm_client.generate_variants(
                    prompt=content,
                    k=1,
                    response_model=None,
                    previous_dialogue_context=turn.context,
                    user_system_prompt_override=turn.instructions or None,
                )
        except AllLLMProvidersUnavailableError:
            raise
        except Exception as exc:
            logger.error(
                "Conversation IA %s : appel LLM en échec (request_id=%s): %s",
                conversation_id,
                request_id,
                exc,
                exc_info=True,
            )
            raise ConversationLLMError(f"Le modèle n'a pas pu répondre : {exc}") from exc

        answer = variants[0] if variants else None
        unusable = (
            not isinstance(answer, str)
            or not answer.strip()
            or answer.startswith(_LLM_ERROR_PREFIXES)
            # Un client qui trace son usage n'a signalé aucun appel réussi : la chaîne
            # rendue est un message d'échec, pas une réponse (et elle a pu être facturée).
            or (_client_tracks_usage(llm_client) and not llm_calls)
        )
        if unusable:
            logger.error(
                "Conversation IA %s : réponse inexploitable (request_id=%s): %r",
                conversation_id,
                request_id,
                answer if not isinstance(answer, str) else answer[:300],
            )
            raise ConversationLLMError("Le modèle n'a pas produit de réponse exploitable.")
        return answer, (llm_calls[-1] if llm_calls else None), llm_client

    def _persist_turn(
        self,
        conversation_id: str,
        content: str,
        answer: str,
        call_id: Optional[str],
        model_id: str,
        cost_usd: float,
    ) -> AIConversationExchange:
        """Écrit la paire question/réponse (résumé de réflexion relu sur l'appel). Bloquant."""
        record = self._usage.get_record_by_call_id(call_id) if call_id else None
        now = _utc_now_iso()
        try:
            user_entry, assistant_entry = self._repository.append_exchange(
                conversation_id,
                NewAIConversationMessage(
                    id=uuid4().hex,
                    role="user",
                    content=content,
                    created_at=now,
                ),
                NewAIConversationMessage(
                    id=uuid4().hex,
                    role="assistant",
                    content=answer,
                    created_at=now,
                    reasoning_summary=extract_reasoning_summary(record.response) if record else None,
                    llm_call_id=call_id,
                    model_name=record.model_name if record else model_id,
                    cost_usd=cost_usd,
                ),
                updated_at=now,
                max_messages=self._max_messages,
            )
        except AIConversationCapacityError as exc:
            raise ConversationFullError(
                "Cette conversation a atteint sa limite de messages."
            ) from exc
        except AIConversationMissingError as exc:
            raise AIConversationNotFoundError("Conversation introuvable") from exc
        return AIConversationExchange(
            user_message=_message_view(user_entry),
            assistant_message=_message_view(assistant_entry),
        )

    async def post_message(
        self,
        conversation_id: str,
        current_user: Mapping[str, object],
        content: str,
        *,
        billable_user_id: str,
        request_id: str,
    ) -> AIConversationExchange:
        """Pose une question et persiste la paire question/réponse si le modèle répond.

        Le modèle reçoit les instructions et le contexte de la graine, puis l'historique de
        la conversation ; la question est le prompt du tour. Les tours d'une même
        conversation sont joués l'un après l'autre.

        Raises:
            AIConversationNotFoundError: Conversation absente ou d'un autre utilisateur.
            SubjectAccessDeniedError: L'accès au sujet a été retiré.
            ConversationFullError: Plafond de messages atteint (aucun appel LLM).
            ConversationBudgetExceededError: Budget dépassé (aucun appel LLM).
            ConversationLLMError: Réponse en erreur ou vide (aucun message persisté).
            AllLLMProvidersUnavailableError: Chaîne de repli épuisée.
        """
        async with self._turn_lock(conversation_id):
            turn = await asyncio.to_thread(
                self._prepare_turn, conversation_id, current_user, content, billable_user_id
            )
            answer, call_id, llm_client = await self._ask(conversation_id, turn, content, request_id)
            return await asyncio.to_thread(
                self._persist_turn,
                conversation_id,
                content,
                answer,
                call_id,
                turn.model_id,
                float(getattr(llm_client, "last_call_cost", 0.0) or 0.0),
            )

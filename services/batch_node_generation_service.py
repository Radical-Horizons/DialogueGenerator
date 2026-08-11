"""Génération batch depuis plusieurs nœuds parents (Story 8.9 / FR88)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Literal, Optional

from core.llm.llm_client import ILLMClient
from services.graph_node_orchestrator import GenerationResult, GraphNodeOrchestrator

logger = logging.getLogger(__name__)

BatchParentStatus = Literal["ok", "error", "skipped", "cancelled"]

BATCH_GENERATE_JOB_MIN = 10
BATCH_GENERATE_HARD_MAX = 100


def _now_iso() -> str:
    """Horodatage UTC ISO-8601."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _count_free_choices(parent_node_content: Dict[str, Any]) -> int:
    """Nombre de choix sans cible (ou END) — base du compteur j/k."""
    choices = parent_node_content.get("choices") or []
    count = 0
    for choice in choices:
        if not isinstance(choice, dict):
            continue
        target = choice.get("targetNode")
        if not target or target == "END":
            count += 1
    return count


@dataclass
class BatchParentInput:
    """Spécification d'un parent à traiter."""

    parent_node_id: str
    parent_node_content: Dict[str, Any]
    context_selections: Dict[str, Any]
    user_instructions: str = ""
    npc_speaker_id: Optional[str] = None
    player_character_id: Optional[str] = None


EnrichContextFn = Callable[[BatchParentInput, Dict[str, Any]], Dict[str, Any]]
CancelCallback = Callable[[], bool]
ProgressCallback = Callable[[int, int, str], None]


@dataclass
class BatchParentResult:
    """Résultat de génération pour un nœud parent."""

    parent_node_id: str
    status: BatchParentStatus
    nodes: List[Dict[str, Any]] = field(default_factory=list)
    suggested_connections: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    warning: Optional[str] = None
    generated_choices_count: Optional[int] = None
    connected_choices_count: Optional[int] = None
    failed_choices_count: Optional[int] = None
    total_choices_count: Optional[int] = None
    context_gdd_content_fingerprint: Optional[str] = None


@dataclass
class BatchNodeGenerationReport:
    """Rapport complet d'un lot de génération multi-parents."""

    items: List[BatchParentResult]
    cancelled: bool = False
    started_at: str = ""
    finished_at: str = ""

    @property
    def ok_count(self) -> int:
        """Nombre de parents traités avec succès."""
        return sum(1 for item in self.items if item.status == "ok")

    @property
    def error_count(self) -> int:
        """Nombre de parents en erreur."""
        return sum(1 for item in self.items if item.status == "error")

    @property
    def skipped_count(self) -> int:
        """Nombre de parents ignorés / annulés."""
        return sum(
            1 for item in self.items if item.status in ("skipped", "cancelled")
        )

    @property
    def total_nodes_generated(self) -> int:
        """Somme des nœuds générés sur les parents OK."""
        return sum(len(item.nodes) for item in self.items if item.status == "ok")


def _result_from_generation(
    parent_node_id: str,
    result: GenerationResult,
    *,
    fingerprint: Optional[str] = None,
) -> BatchParentResult:
    """Mappe un ``GenerationResult`` vers un item de rapport."""
    connections: List[Dict[str, Any]] = []
    for conn in result.suggested_connections:
        if isinstance(conn, dict):
            connections.append(dict(conn))
        else:
            connections.append(
                {
                    "from": getattr(conn, "from_node", None)
                    or getattr(conn, "from", None),
                    "to": getattr(conn, "to_node", None) or getattr(conn, "to", None),
                    "via_choice_index": getattr(conn, "via_choice_index", None),
                    "connection_type": getattr(conn, "connection_type", "choice"),
                }
            )
    return BatchParentResult(
        parent_node_id=parent_node_id,
        status="ok",
        nodes=list(result.nodes or []),
        suggested_connections=connections,
        generated_choices_count=result.generated_choices_count,
        connected_choices_count=result.connected_choices_count,
        failed_choices_count=result.failed_choices_count,
        total_choices_count=result.total_choices_count,
        context_gdd_content_fingerprint=fingerprint,
    )


def _is_skip_error(message: str) -> bool:
    """Détecte les erreurs métier à traiter comme skip (pas d'échec LLM)."""
    lowered = message.lower()
    return (
        "déjà connectés" in lowered
        or "aucun choix disponible" in lowered
        or "aucun nœud à générer" in lowered
    )


class BatchNodeGenerationService:
    """Orchestre la génération ``generate_all_choices`` sur N parents séquentiels."""

    def __init__(
        self,
        orchestrator: Optional[GraphNodeOrchestrator] = None,
    ) -> None:
        """Initialise le service avec un orchestrateur de nœuds."""
        self._orchestrator = orchestrator or GraphNodeOrchestrator()

    async def generate_batch(
        self,
        parents: List[BatchParentInput],
        *,
        llm_client: ILLMClient,
        dialogue_nodes: Optional[List[Dict[str, Any]]] = None,
        system_prompt_override: Optional[str] = None,
        max_choices: Optional[int] = None,
        choices_mode: Optional[str] = None,
        enrich_context: Optional[EnrichContextFn] = None,
        fingerprint_for: Optional[
            Callable[[Dict[str, Any]], Optional[str]]
        ] = None,
        should_cancel: Optional[CancelCallback] = None,
        on_progress: Optional[ProgressCallback] = None,
    ) -> BatchNodeGenerationReport:
        """Génère séquentiellement pour chaque parent (échec partiel toléré).

        Args:
            parents: Liste des parents (≥ 1 ; le seuil job est géré par le router).
            llm_client: Client LLM déjà configuré.
            dialogue_nodes: Snapshot graphe pour le chemin ancêtre.
            system_prompt_override: Surcharge optionnelle du system prompt.
            max_choices: Plafond de choix enfants.
            choices_mode: ``free`` ou ``capped``.
            enrich_context: Enrichissement scène (dramatis) par parent.
            fingerprint_for: Empreinte GDD optionnelle après enrichissement.
            should_cancel: Callback d'annulation entre parents.
            on_progress: ``(current, total, detail)`` après chaque parent.

        Returns:
            Rapport agrégé (items par parent + compteurs).
        """
        started = _now_iso()
        items: List[BatchParentResult] = []
        total = len(parents)
        cancelled = False

        for index, parent in enumerate(parents):
            if should_cancel and should_cancel():
                cancelled = True
                for remaining in parents[index:]:
                    items.append(
                        BatchParentResult(
                            parent_node_id=remaining.parent_node_id,
                            status="cancelled",
                            warning="Annulé avant traitement",
                        )
                    )
                break

            free_choices = _count_free_choices(parent.parent_node_content)
            detail = (
                f"Nœud {index + 1}/{total} — 0/{free_choices}"
                if free_choices > 0
                else f"Nœud {index + 1}/{total}"
            )
            if on_progress:
                on_progress(index, total, detail)

            def _choice_progress(completed: int, choice_total: int) -> None:
                if on_progress:
                    on_progress(
                        index,
                        total,
                        f"Nœud {index + 1}/{total} — {completed}/{choice_total}",
                    )

            try:
                raw_ctx = dict(parent.context_selections or {})
                enriched = (
                    enrich_context(parent, raw_ctx) if enrich_context else raw_ctx
                )
                result = await self._orchestrator.generate(
                    llm_client=llm_client,
                    parent_node_id=parent.parent_node_id,
                    parent_node_content=parent.parent_node_content,
                    user_instructions=parent.user_instructions or None,
                    context_selections=enriched,
                    system_prompt_override=system_prompt_override,
                    max_choices=max_choices,
                    generate_all_choices=True,
                    dialogue_nodes=dialogue_nodes,
                    player_character_id=parent.player_character_id,
                    choices_mode=choices_mode,  # type: ignore[arg-type]
                    progress_callback=_choice_progress if on_progress else None,
                )
                fp = fingerprint_for(enriched) if fingerprint_for else None
                items.append(
                    _result_from_generation(
                        parent.parent_node_id, result, fingerprint=fp
                    )
                )
            except ValueError as exc:
                message = str(exc)
                if _is_skip_error(message):
                    items.append(
                        BatchParentResult(
                            parent_node_id=parent.parent_node_id,
                            status="skipped",
                            warning=message,
                        )
                    )
                else:
                    logger.warning(
                        "Échec génération batch parent %s: %s",
                        parent.parent_node_id,
                        message,
                    )
                    items.append(
                        BatchParentResult(
                            parent_node_id=parent.parent_node_id,
                            status="error",
                            error=message,
                        )
                    )
            except Exception as exc:  # noqa: BLE001 — isole l'échec d'un parent
                logger.exception(
                    "Erreur inattendue génération batch parent %s",
                    parent.parent_node_id,
                )
                items.append(
                    BatchParentResult(
                        parent_node_id=parent.parent_node_id,
                        status="error",
                        error=str(exc),
                    )
                )

            if on_progress:
                on_progress(index + 1, total, f"Nœud {index + 1}/{total} terminé")

        return BatchNodeGenerationReport(
            items=items,
            cancelled=cancelled,
            started_at=started,
            finished_at=_now_iso(),
        )

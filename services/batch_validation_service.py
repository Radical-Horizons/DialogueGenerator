"""Validation batch de dialogues Unity (Story 8.8 / FR87)."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Literal, Optional

from services.configuration_service import ConfigurationService
from services.graph_conversion_service import GraphConversionService
from services.graph_validation_service import GraphValidationService
from services.lore_contradiction_validator import (
    LoreGddFact,
    validate_explicit_lore_contradictions,
)
from services.unity_export_validation_service import validate_persisted_document
from services.unity_persisted_document_io import (
    read_document_blob,
    resolve_unity_dir,
    safe_document_id,
)

logger = logging.getLogger(__name__)

BatchItemStatus = Literal["valid", "invalid", "skipped", "cancelled", "denied"]
IssueSource = Literal["graph", "schema", "lore"]

BATCH_VALIDATE_SYNC_MAX = 19
BATCH_VALIDATE_JOB_MIN = 20
BATCH_VALIDATE_HARD_MAX = 500


@dataclass
class BatchValidationIssue:
    """Erreur ou avertissement agrégé pour un dialogue."""

    type: str
    message: str
    severity: Literal["error", "warning"]
    source: IssueSource
    node_id: Optional[str] = None


@dataclass
class BatchValidationItem:
    """Résultat de validation pour un document."""

    document_id: str
    status: BatchItemStatus
    issues: list[BatchValidationIssue] = field(default_factory=list)
    validated_at: str = ""


@dataclass
class BatchValidationReport:
    """Rapport complet d'un lot de validation."""

    items: list[BatchValidationItem]
    cancelled: bool = False
    started_at: str = ""
    finished_at: str = ""

    @property
    def valid_count(self) -> int:
        """Nombre de dialogues valides."""
        return sum(1 for item in self.items if item.status == "valid")

    @property
    def invalid_count(self) -> int:
        """Nombre de dialogues invalides."""
        return sum(1 for item in self.items if item.status == "invalid")

    @property
    def skipped_count(self) -> int:
        """Nombre de dialogues ignorés / refusés / annulés."""
        return sum(
            1
            for item in self.items
            if item.status in ("skipped", "cancelled", "denied")
        )


def _now_iso() -> str:
    """Horodatage UTC ISO-8601."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _extract_lore_context(
    document: dict[str, Any],
) -> tuple[Optional[dict[str, Any]], list[LoreGddFact], str]:
    """Extrait un contexte lore persisté s'il est exploitable.

    Returns:
        Tuple (context_selections ou None, faits lore, scene_instruction).
    """
    nested = document.get("generation_context")
    nested_dict = nested if isinstance(nested, dict) else {}
    selections = document.get("context_selections")
    if not isinstance(selections, dict):
        selections = nested_dict.get("context_selections")
    if not isinstance(selections, dict):
        selections = None

    raw_facts = document.get("gdd_lore_facts")
    if not isinstance(raw_facts, list):
        raw_facts = nested_dict.get("gdd_lore_facts")
    facts: list[LoreGddFact] = []
    if isinstance(raw_facts, list):
        for entry in raw_facts:
            if not isinstance(entry, dict):
                continue
            entity = entry.get("entity_name") or entry.get("entity")
            path = entry.get("gdd_path") or entry.get("path") or ""
            category = entry.get("category") or "Personnages"
            vitality_raw = entry.get("vitality")
            vitality = vitality_raw if vitality_raw in ("alive", "dead") else None
            if entity and vitality:
                try:
                    facts.append(
                        LoreGddFact(
                            entity_name=str(entity),
                            category=str(category),
                            gdd_path=str(path),
                            vitality=vitality,
                        )
                    )
                except (TypeError, ValueError):
                    continue

    scene = document.get("scene_instruction")
    if not isinstance(scene, str):
        scene = nested_dict.get("scene_instruction")
    if not isinstance(scene, str):
        scene = ""

    has_selections = bool(
        selections and any(bool(v) for v in selections.values())
    )
    if not has_selections and not facts:
        return None, [], scene
    return selections or {}, facts, scene


class BatchValidationService:
    """Orchestre graphe + schéma Unity + lore pour un ou plusieurs dialogues."""

    def __init__(
        self,
        *,
        config_service: ConfigurationService,
        graph_validation_service: Optional[GraphValidationService] = None,
    ) -> None:
        """Injecte la config et le validateur de graphe."""
        self._config = config_service
        self._graph_validator = graph_validation_service or GraphValidationService()

    def validate_one(
        self,
        document_id: str,
        *,
        access_allowed: bool,
    ) -> BatchValidationItem:
        """Valide un dialogue accessible ou renvoie denied/skipped."""
        validated_at = _now_iso()
        try:
            doc_id = safe_document_id(document_id)
        except ValueError:
            return BatchValidationItem(
                document_id=document_id,
                status="skipped",
                issues=[
                    BatchValidationIssue(
                        type="invalid_document_id",
                        message="Identifiant de dialogue invalide",
                        severity="error",
                        source="graph",
                    )
                ],
                validated_at=validated_at,
            )

        if not access_allowed:
            return BatchValidationItem(
                document_id=doc_id,
                status="denied",
                issues=[
                    BatchValidationIssue(
                        type="access_denied",
                        message="Dialogue inaccessible",
                        severity="error",
                        source="graph",
                    )
                ],
                validated_at=validated_at,
            )

        issues: list[BatchValidationIssue] = []
        try:
            unity_dir = resolve_unity_dir(self._config)
            document = read_document_blob(unity_dir, doc_id)
        except FileNotFoundError:
            return BatchValidationItem(
                document_id=doc_id,
                status="skipped",
                issues=[
                    BatchValidationIssue(
                        type="not_found",
                        message="Dialogue introuvable sur le disque",
                        severity="error",
                        source="graph",
                    )
                ],
                validated_at=validated_at,
            )
        except Exception as exc:  # noqa: BLE001 — isolé par item
            logger.warning("Lecture batch-validate échouée pour %s: %s", doc_id, exc)
            return BatchValidationItem(
                document_id=doc_id,
                status="skipped",
                issues=[
                    BatchValidationIssue(
                        type="read_error",
                        message=f"Lecture impossible: {exc}",
                        severity="error",
                        source="graph",
                    )
                ],
                validated_at=validated_at,
            )

        # 1) Graphe
        try:
            nodes_payload = document.get("nodes") if isinstance(document, dict) else document
            json_content = (
                json.dumps(nodes_payload, ensure_ascii=False)
                if not isinstance(nodes_payload, str)
                else nodes_payload
            )
            rf_nodes, rf_edges = GraphConversionService.unity_json_to_graph(json_content)
            graph_result = self._graph_validator.validate_graph(
                rf_nodes,
                rf_edges,
            )
            for err in graph_result.errors:
                payload = err.to_dict()
                issues.append(
                    BatchValidationIssue(
                        type=str(payload.get("type") or "graph_error"),
                        message=str(payload.get("message") or ""),
                        severity="error",
                        source="graph",
                        node_id=payload.get("node_id"),
                    )
                )
            for warn in graph_result.warnings:
                payload = warn.to_dict()
                issues.append(
                    BatchValidationIssue(
                        type=str(payload.get("type") or "graph_warning"),
                        message=str(payload.get("message") or ""),
                        severity="warning",
                        source="graph",
                        node_id=payload.get("node_id"),
                    )
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Validation graphe batch échouée pour %s: %s", doc_id, exc)
            issues.append(
                BatchValidationIssue(
                    type="graph_validation_failed",
                    message=f"Échec validation graphe: {exc}",
                    severity="error",
                    source="graph",
                )
            )

        # 2) Schéma Unity
        try:
            schema_result = validate_persisted_document(self._config, doc_id)
            for message in schema_result.errors:
                node_id = None
                for structured in schema_result.errors_structured or []:
                    if structured.get("message") == message:
                        node_id = structured.get("node_id")
                        break
                issues.append(
                    BatchValidationIssue(
                        type="schema_error",
                        message=str(message),
                        severity="error",
                        source="schema",
                        node_id=node_id if isinstance(node_id, str) else None,
                    )
                )
            for message in schema_result.warnings:
                issues.append(
                    BatchValidationIssue(
                        type="schema_warning",
                        message=str(message),
                        severity="warning",
                        source="schema",
                    )
                )
        except FileNotFoundError:
            issues.append(
                BatchValidationIssue(
                    type="schema_not_found",
                    message="Document absent pour validation schéma",
                    severity="error",
                    source="schema",
                )
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Validation schéma batch échouée pour %s: %s", doc_id, exc)
            issues.append(
                BatchValidationIssue(
                    type="schema_validation_failed",
                    message=f"Échec validation schéma: {exc}",
                    severity="error",
                    source="schema",
                )
            )

        # 3) Lore (si contexte exploitable)
        selections, facts, scene = _extract_lore_context(
            document if isinstance(document, dict) else {}
        )
        if selections is None:
            issues.append(
                BatchValidationIssue(
                    type="lore_not_applicable",
                    message="lore non applicable",
                    severity="warning",
                    source="lore",
                )
            )
        else:
            try:
                nodes_list = (
                    document.get("nodes", [])
                    if isinstance(document, dict)
                    else []
                )
                if not isinstance(nodes_list, list):
                    nodes_list = []
                rf_nodes, rf_edges = GraphConversionService.unity_json_to_graph(
                    json.dumps(nodes_list, ensure_ascii=False)
                )
                _valid, lore_errors, lore_warnings, *_rest = (
                    validate_explicit_lore_contradictions(
                        rf_nodes,
                        rf_edges,
                        facts,
                    )
                )
                for entry in lore_errors:
                    issues.append(
                        BatchValidationIssue(
                            type=str(entry.get("type") or "lore_contradiction_explicit"),
                            message=str(entry.get("message") or ""),
                            severity="error",
                            source="lore",
                            node_id=entry.get("node_id")
                            if isinstance(entry.get("node_id"), str)
                            else None,
                        )
                    )
                for entry in lore_warnings:
                    issues.append(
                        BatchValidationIssue(
                            type=str(entry.get("type") or "lore_warning"),
                            message=str(entry.get("message") or ""),
                            severity="warning",
                            source="lore",
                            node_id=entry.get("node_id")
                            if isinstance(entry.get("node_id"), str)
                            else None,
                        )
                    )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Validation lore batch échouée pour %s: %s", doc_id, exc)
                issues.append(
                    BatchValidationIssue(
                        type="lore_validation_failed",
                        message=f"Échec validation lore: {exc}",
                        severity="warning",
                        source="lore",
                    )
                )

        has_errors = any(issue.severity == "error" for issue in issues)
        return BatchValidationItem(
            document_id=doc_id,
            status="invalid" if has_errors else "valid",
            issues=issues,
            validated_at=validated_at,
        )

    def validate_batch(
        self,
        document_ids: list[str],
        *,
        can_access: Callable[[str], bool],
        should_cancel: Optional[Callable[[], bool]] = None,
        on_progress: Optional[Callable[[int, int, BatchValidationItem], None]] = None,
    ) -> BatchValidationReport:
        """Valide une liste de dialogues séquentiellement."""
        started_at = _now_iso()
        items: list[BatchValidationItem] = []
        cancelled = False
        total = len(document_ids)

        for index, document_id in enumerate(document_ids):
            if should_cancel and should_cancel():
                cancelled = True
                for remaining in document_ids[index:]:
                    items.append(
                        BatchValidationItem(
                            document_id=remaining,
                            status="cancelled",
                            validated_at=_now_iso(),
                        )
                    )
                break

            try:
                allowed = can_access(document_id)
            except Exception:  # noqa: BLE001
                allowed = False
            item = self.validate_one(document_id, access_allowed=allowed)
            items.append(item)
            if on_progress:
                on_progress(index + 1, total, item)

        return BatchValidationReport(
            items=items,
            cancelled=cancelled,
            started_at=started_at,
            finished_at=_now_iso(),
        )

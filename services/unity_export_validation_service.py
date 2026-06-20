"""Pipeline unifié de validation export Unity JSON (Story 5.3 / FR51).

Compose JSON Schema, règles GDD bloquantes (RepPalier) et avertissements
non bloquants (seuils flags/compteurs, volumétrie nœuds).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

from api.utils.unity_schema_validator import validate_unity_json_structured
from services.configuration_service import ConfigurationService
from services.dialogue_flag_thresholds import (
    MAX_CONVERSATIONAL_FLAGS,
    MAX_COUNTERS,
    MAX_NODES_MAINTAINABILITY,
)
from services.game_systems_reputation import validate_dialogue_flags_do_not_store_rep_palier
from services.unity_persisted_document_io import (
    read_document_blob,
    resolve_unity_dir,
    safe_document_id,
)
from services.unity_export_normalizer import normalize_unity_export_document
from services.unity_schema_error_formatter import format_structured_error_to_french


@dataclass
class SchemaValidationIssue:
    """Erreur ou avertissement de validation schéma export."""

    code: str
    message: str
    path: str = ""
    node_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Sérialise pour réponse API."""
        payload: Dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.path:
            payload["path"] = self.path
        if self.node_id:
            payload["node_id"] = self.node_id
        return payload


@dataclass
class UnityExportValidationResult:
    """Résultat agrégé validation export Unity."""

    is_valid: bool
    errors: List[str] = field(default_factory=list)
    errors_structured: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[Dict[str, Any]] = field(default_factory=list)
    error_count: int = 0


def _normalize_document(data: Union[List[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, Any]:
    """Normalise liste legacy ou document canonique."""
    if isinstance(data, dict) and "nodes" in data:
        return data
    if isinstance(data, list):
        return {"schemaVersion": "1.2.0", "nodes": data}
    raise ValueError("Format document invalide : dict avec nodes ou liste de nœuds")


def _resolve_node_id(document: Dict[str, Any], path: str) -> Optional[str]:
    """Résout nodeId depuis un chemin JSON (ex. nodes.0.choices.1)."""
    if not path.startswith("nodes"):
        return None
    parts = path.split(".")
    if len(parts) < 2:
        return None
    try:
        index = int(parts[1])
    except ValueError:
        return None
    nodes = document.get("nodes")
    if not isinstance(nodes, list) or index >= len(nodes):
        return None
    node = nodes[index]
    if isinstance(node, dict):
        node_id = node.get("id")
        return str(node_id) if node_id else None
    return None


def _enrich_structured_errors(
    document: Dict[str, Any],
    raw_errors: List[Dict[str, Any]],
) -> List[SchemaValidationIssue]:
    """Enrichit les erreurs structurées avec messages FR et nodeId."""
    enriched: List[SchemaValidationIssue] = []
    for raw in raw_errors:
        path = str(raw.get("path") or "")
        code = str(raw.get("code") or "validation_error")
        message = format_structured_error_to_french(raw)
        node_id = _resolve_node_id(document, path)
        enriched.append(
            SchemaValidationIssue(code=code, message=message, path=path, node_id=node_id)
        )
    return enriched


def _gdd_flag_warnings(dialogue_flags: List[Dict[str, Any]]) -> List[SchemaValidationIssue]:
    """Calcule les avertissements seuils GDD depuis dialogueFlags bruts."""
    warnings: List[SchemaValidationIssue] = []
    conversational = 0
    counters = 0
    for flag in dialogue_flags:
        if not isinstance(flag, dict):
            continue
        flag_type = str(flag.get("type") or "").lower()
        if flag_type == "compteur":
            counters += 1
        else:
            conversational += 1

    if conversational > MAX_CONVERSATIONAL_FLAGS:
        warnings.append(
            SchemaValidationIssue(
                code="gdd_flag_threshold_exceeded",
                message=(
                    f"Liaisons conversationnelles : {conversational} "
                    f"(repère GDD ≤ {MAX_CONVERSATIONAL_FLAGS})."
                ),
                path="dialogueFlags",
            )
        )
    if counters > MAX_COUNTERS:
        warnings.append(
            SchemaValidationIssue(
                code="gdd_counter_threshold_exceeded",
                message=f"Compteurs liés : {counters} (repère GDD ≤ {MAX_COUNTERS}).",
                path="dialogueFlags",
            )
        )
    return warnings


def _node_count_warning(document: Dict[str, Any]) -> List[SchemaValidationIssue]:
    """Avertissement volumétrie nœuds (> seuil maintenabilité)."""
    nodes = document.get("nodes")
    if not isinstance(nodes, list):
        return []
    count = len(nodes)
    if count <= MAX_NODES_MAINTAINABILITY:
        return []
    return [
        SchemaValidationIssue(
            code="gdd_node_count_threshold_exceeded",
            message=(
                f"Nombre de nœuds : {count} "
                f"(repère maintenabilité GDD ≤ {MAX_NODES_MAINTAINABILITY})."
            ),
            path="nodes",
        )
    ]


def validate_unity_export_document(
    json_data: Union[List[Dict[str, Any]], Dict[str, Any]],
) -> UnityExportValidationResult:
    """Valide un document Unity pour export (schéma + règles GDD).

    Args:
        json_data: Document canonique ou liste legacy de nœuds.

    Returns:
        Résultat avec erreurs bloquantes et avertissements non bloquants.
    """
    document = _normalize_document(json_data)
    document = normalize_unity_export_document(document, in_place=True)

    schema_valid, schema_errors = validate_unity_json_structured(document)
    gdd_errors_raw: List[Dict[str, Any]] = []
    dialogue_flags = document.get("dialogueFlags")
    if isinstance(dialogue_flags, list):
        gdd_errors_raw = validate_dialogue_flags_do_not_store_rep_palier(dialogue_flags)

    all_raw = list(schema_errors) + gdd_errors_raw
    enriched = _enrich_structured_errors(document, all_raw)
    user_messages = [issue.message for issue in enriched]

    warnings: List[SchemaValidationIssue] = []
    if isinstance(dialogue_flags, list):
        warnings.extend(_gdd_flag_warnings(dialogue_flags))
    warnings.extend(_node_count_warning(document))

    is_valid = schema_valid and len(gdd_errors_raw) == 0

    return UnityExportValidationResult(
        is_valid=is_valid,
        errors=user_messages,
        errors_structured=[e.to_dict() for e in enriched],
        warnings=[w.to_dict() for w in warnings],
        error_count=len(user_messages),
    )


def unity_export_schema_validator(
    document: Dict[str, Any],
) -> tuple[bool, List[str]]:
    """Validateur injectable pour write_unity_dialogue_to_file (DIP).

    Args:
        document: Document Unity complet (schemaVersion, nodes, …).

    Returns:
        Tuple (is_valid, messages d'erreur utilisateur).
    """
    result = validate_unity_export_document(document)
    return result.is_valid, result.errors


def validate_persisted_document(
    config_service: ConfigurationService,
    document_id: str,
    request_id: Optional[str] = None,
) -> UnityExportValidationResult:
    """Valide un document persisté sur disque via le pipeline export unifié.

    Args:
        config_service: Service de configuration (chemin Unity).
        document_id: Identifiant sans extension ``.json``.
        request_id: ID requête pour exceptions de configuration.

    Returns:
        Résultat validation enrichi (erreurs + avertissements).

    Raises:
        ValidationException: Chemin Unity non configuré.
        FileNotFoundError: Document absent.
        ValueError: document_id invalide.
    """
    doc_id = safe_document_id(document_id)
    unity_dir = resolve_unity_dir(config_service, request_id)
    document = read_document_blob(unity_dir, doc_id)
    return validate_unity_export_document(document)


def validation_result_to_api_payload(
    result: UnityExportValidationResult,
) -> Dict[str, Any]:
    """Convertit un résultat validation en payload API ValidateSchemaResponse."""
    return {
        "is_valid": result.is_valid,
        "errors": result.errors,
        "error_count": result.error_count,
        "warnings": result.warnings,
        "structured_errors": result.errors_structured,
    }

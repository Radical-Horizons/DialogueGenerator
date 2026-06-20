"""Helpers pour enregistrer les logs export depuis les routers (Story 5.6)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from api.exceptions import ValidationException
from services.export_log_service import (
    ExportLogService,
    ExportSource,
    metadata_from_document,
)
from services.llm_usage_service import LLMUsageService
from services.unity_persisted_document_io import safe_document_id


def _dialogue_id_from_filename(filename: str) -> str:
    """Stem sans extension pour identifiant dialogue."""
    name = filename if filename else "dialogue"
    if name.lower().endswith(".json"):
        return name[:-5]
    return name


def extract_validation_errors(exc: ValidationException) -> List[str]:
    """Messages d'erreur depuis ValidationException export."""
    details = exc.details or {}
    raw = details.get("validation_errors")
    if isinstance(raw, list) and raw:
        return [str(e) for e in raw if e]
    detail = getattr(exc, "detail", None)
    if isinstance(detail, str) and detail.strip():
        return [detail]
    return ["Erreur de validation"]


def record_graph_export_success(
    export_log_service: ExportLogService,
    llm_usage_service: LLMUsageService,
    *,
    document: Dict[str, Any],
    filename: str,
) -> None:
    """Journalise un export graphe réussi (save-and-write)."""
    dialogue_id = _dialogue_id_from_filename(filename)
    entry = metadata_from_document(
        document,
        dialogue_id=dialogue_id,
        filename=filename,
        export_status="success",
        skip_validation=False,
        source="graph",
        llm_usage_service=llm_usage_service,
    )
    export_log_service.log_export(entry)


def record_graph_export_failure(
    export_log_service: ExportLogService,
    llm_usage_service: LLMUsageService,
    *,
    document: Dict[str, Any],
    filename: str,
    errors: List[str],
) -> None:
    """Journalise un export graphe échoué."""
    dialogue_id = _dialogue_id_from_filename(filename)
    entry = metadata_from_document(
        document,
        dialogue_id=dialogue_id,
        filename=filename,
        export_status="failure",
        skip_validation=False,
        errors=errors,
        source="graph",
        llm_usage_service=llm_usage_service,
    )
    export_log_service.log_export(entry)


def record_graph_export_validation_exception(
    export_log_service: ExportLogService,
    llm_usage_service: LLMUsageService,
    *,
    document: Dict[str, Any],
    filename: str,
    exc: ValidationException,
) -> None:
    """Journalise échec export graphe depuis ValidationException."""
    record_graph_export_failure(
        export_log_service,
        llm_usage_service,
        document=document,
        filename=filename,
        errors=extract_validation_errors(exc),
    )


def record_unity_export_success(
    export_log_service: ExportLogService,
    llm_usage_service: LLMUsageService,
    *,
    document: Dict[str, Any],
    filename: str,
    skip_validation: bool = False,
) -> None:
    """Journalise POST /unity/export réussi."""
    dialogue_id = _dialogue_id_from_filename(filename)
    entry = metadata_from_document(
        document,
        dialogue_id=dialogue_id,
        filename=filename,
        export_status="success",
        skip_validation=skip_validation,
        source="unity_export",
        llm_usage_service=llm_usage_service,
    )
    export_log_service.log_export(entry)


def record_unity_export_failure(
    export_log_service: ExportLogService,
    llm_usage_service: LLMUsageService,
    *,
    document: Optional[Dict[str, Any]],
    filename: str,
    errors: List[str],
    skip_validation: bool = False,
) -> None:
    """Journalise POST /unity/export échoué."""
    dialogue_id = _dialogue_id_from_filename(filename)
    doc = document if document is not None else {"schemaVersion": "1.2.0", "nodes": []}
    entry = metadata_from_document(
        doc,
        dialogue_id=dialogue_id,
        filename=filename,
        export_status="failure",
        skip_validation=skip_validation,
        errors=errors,
        source="unity_export",
        llm_usage_service=llm_usage_service,
    )
    export_log_service.log_export(entry)


def record_batch_export_item(
    export_log_service: ExportLogService,
    llm_usage_service: LLMUsageService,
    *,
    document_id: str,
    filename: str,
    export_status: str,
    errors: Optional[List[str]] = None,
    document: Optional[Dict[str, Any]] = None,
    skip_validation: bool = False,
) -> None:
    """Journalise une entrée batch (succès ou échec par document)."""
    doc_id = safe_document_id(document_id)
    doc = document if document is not None else {"schemaVersion": "1.2.0", "nodes": []}
    status = "success" if export_status == "success" else "failure"
    entry = metadata_from_document(
        doc,
        dialogue_id=doc_id,
        filename=filename,
        export_status=status,
        skip_validation=skip_validation,
        errors=list(errors or []),
        source="batch",
        llm_usage_service=llm_usage_service,
    )
    export_log_service.log_export(entry)

"""Preview export Unity sans écriture disque (Story 5.5 / FR53)."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from services.configuration_service import ConfigurationService
from services.unity_dialogue_download_service import read_document_download_payload
from services.unity_export_normalizer import prepare_unity_export_document
from services.unity_export_validation_service import validate_unity_export_document
from services.unity_graph_export_serialization import (
    count_unity_nodes,
    export_filename_from_title,
    graph_to_unity_json_content,
    json_content_size_bytes,
)
from services.unity_persisted_document_io import safe_document_id

PREVIEW_TRUNCATE_BYTES = 32 * 1024


@dataclass
class ExportPreviewResult:
    """Résultat preview export single."""

    json_content: str
    size_bytes: int
    node_count: int
    filename: str
    schema_valid: bool
    errors: List[str] = field(default_factory=list)


@dataclass
class BatchExportPreviewItem:
    """Item preview batch."""

    document_id: str
    filename: str
    size_bytes: int
    node_count: int
    json_preview: str
    json_preview_truncated: bool


@dataclass
class BatchExportPreviewResult:
    """Résultat preview batch."""

    items: List[BatchExportPreviewItem]
    total_size_bytes: int
    dialogue_count: int


def _truncate_preview(json_content: str, limit: int = PREVIEW_TRUNCATE_BYTES) -> tuple[str, bool]:
    """Tronque l'aperçu JSON pour perf batch."""
    encoded = json_content.encode("utf-8")
    if len(encoded) <= limit:
        return json_content, False
    truncated = encoded[:limit].decode("utf-8", errors="ignore")
    return truncated + "\n… (aperçu tronqué)", True


def preview_graph_export(
    nodes: List[Any],
    edges: List[Any],
    *,
    dialogue_flags: Optional[Dict[str, Any]] = None,
    title: str = "Dialogue",
) -> ExportPreviewResult:
    """Calcule preview export depuis graphe ReactFlow sans écriture disque."""
    document, json_content = graph_to_unity_json_content(
        nodes,
        edges,
        dialogue_flags=dialogue_flags,
        title=title,
    )
    validation = validate_unity_export_document(document)
    return ExportPreviewResult(
        json_content=json_content,
        size_bytes=json_content_size_bytes(json_content),
        node_count=count_unity_nodes(document),
        filename=export_filename_from_title(title),
        schema_valid=validation.is_valid,
        errors=validation.errors,
    )


def preview_persisted_document(
    config_service: ConfigurationService,
    document_id: str,
    request_id: str | None = None,
) -> ExportPreviewResult:
    """Preview export depuis fichier Unity déjà exporté."""
    json_content, filename = read_document_download_payload(
        config_service, document_id, request_id
    )
    document = json.loads(json_content)
    validation = validate_unity_export_document(document)
    prepared = prepare_unity_export_document(document)
    preview_json = json.dumps(prepared, ensure_ascii=False, indent=2)
    doc_id = safe_document_id(document_id)
    return ExportPreviewResult(
        json_content=preview_json,
        size_bytes=json_content_size_bytes(preview_json),
        node_count=count_unity_nodes(prepared),
        filename=filename,
        schema_valid=validation.is_valid,
        errors=validation.errors,
    )


def preview_batch_documents(
    config_service: ConfigurationService,
    document_ids: List[str],
    request_id: str | None = None,
) -> BatchExportPreviewResult:
    """Preview batch sans écriture disque."""
    items: List[BatchExportPreviewItem] = []
    total_size = 0
    for raw_id in document_ids:
        preview = preview_persisted_document(config_service, raw_id, request_id)
        json_preview, truncated = _truncate_preview(preview.json_content)
        doc_id = safe_document_id(raw_id)
        items.append(
            BatchExportPreviewItem(
                document_id=doc_id,
                filename=preview.filename,
                size_bytes=preview.size_bytes,
                node_count=preview.node_count,
                json_preview=json_preview,
                json_preview_truncated=truncated,
            )
        )
        total_size += preview.size_bytes
    return BatchExportPreviewResult(
        items=items,
        total_size_bytes=total_size,
        dialogue_count=len(items),
    )

"""Service batch export Unity JSON depuis documents persistés (Story 5.2 / FR50).

Pipeline par document : lire JSON canonique → extraire nodes → validation schéma
(optionnelle) → écriture atomique ADR-006 via ``write_unity_dialogue_to_file``.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, List, Literal, Optional, Tuple

from api.exceptions import ValidationException
from services.configuration_service import ConfigurationService
from services.export_log_recorder import extract_validation_errors, record_batch_export_item
from services.export_log_service import ExportLogService
from services.llm_usage_service import LLMUsageService
from services.unity_dialogue_export_service import write_unity_dialogue_to_file
from services.unity_export_validation_service import unity_export_schema_validator
from services.unity_persisted_document_io import (
    read_document_blob,
    resolve_unity_dir,
    safe_document_id,
)

logger = logging.getLogger(__name__)

FilenameStrategy = Literal["preserve", "slug"]

_NOOP_VALIDATOR: Callable[[dict], Tuple[bool, List[str]]] = lambda _doc: (
    True,
    [],
)


def _slug_from_title(title: str) -> str:
    """Génère un slug fichier à partir d'un titre."""
    slug = re.sub(r"[^\w\s-]", "", title.lower())
    slug = re.sub(r"[-\s]+", "_", slug)
    return slug[:100] or "dialogue"


def _resolve_output_filename(
    document_id: str,
    document: dict,
    strategy: FilenameStrategy,
) -> Optional[str]:
    """Détermine le nom de fichier de sortie selon la stratégie."""
    if strategy == "preserve":
        return f"{document_id}.json"
    title = document.get("title")
    if isinstance(title, str) and title.strip():
        return f"{_slug_from_title(title.strip())}.json"
    nodes = document.get("nodes")
    if isinstance(nodes, list):
        for node in nodes:
            if isinstance(node, dict) and node.get("line"):
                return f"{_slug_from_title(str(node['line']))}.json"
    return f"{document_id}.json"


@dataclass
class BatchExportFailedItem:
    """Échec d'export pour un document du batch."""

    id: str
    errors: List[str] = field(default_factory=list)


@dataclass
class BatchExportResult:
    """Résultat agrégé d'un export batch."""

    exported: List[str] = field(default_factory=list)
    failed: List[BatchExportFailedItem] = field(default_factory=list)
    cancelled: bool = False


def export_persisted_document(
    config_service: ConfigurationService,
    document_id: str,
    *,
    skip_validation: bool = False,
    filename_strategy: FilenameStrategy = "preserve",
    request_id: Optional[str] = None,
) -> Tuple[Path, str]:
    """Exporte un document persisté vers le répertoire Unity.

    Args:
        config_service: Service de configuration (chemin Unity).
        document_id: Identifiant sans extension ``.json``.
        skip_validation: Si True, n'applique pas le validateur schéma Unity.
        filename_strategy: ``preserve`` ou ``slug`` pour le nom de fichier.
        request_id: ID requête pour les exceptions.

    Returns:
        Tuple (chemin absolu, nom de fichier écrit).

    Raises:
        ValidationException: Chemin Unity non configuré ou JSON invalide.
        FileNotFoundError: Document absent.
    """
    doc_id = safe_document_id(document_id)
    unity_dir = resolve_unity_dir(config_service, request_id)
    document = read_document_blob(unity_dir, doc_id)
    output_filename = _resolve_output_filename(doc_id, document, filename_strategy)
    validator = _NOOP_VALIDATOR if skip_validation else unity_export_schema_validator
    json_content = json.dumps(document, ensure_ascii=False)
    title = document.get("title") if isinstance(document.get("title"), str) else doc_id
    return write_unity_dialogue_to_file(
        config_service=config_service,
        json_content=json_content,
        filename=output_filename,
        title=title,
        request_id=request_id,
        validator=validator,
        preserve_source_fields=True,
    )


def batch_export_documents(
    config_service: ConfigurationService,
    document_ids: List[str],
    *,
    skip_validation: bool = False,
    filename_strategy: FilenameStrategy = "preserve",
    request_id: Optional[str] = None,
    export_log_service: Optional[ExportLogService] = None,
    llm_usage_service: Optional[LLMUsageService] = None,
) -> BatchExportResult:
    """Exporte plusieurs documents persistés ; continue après échecs individuels.

    Args:
        config_service: Service de configuration.
        document_ids: Liste d'identifiants document (sans ``.json``).
        skip_validation: Désactive la validation schéma Unity par item.
        filename_strategy: Stratégie de nommage des fichiers exportés.
        request_id: ID requête pour les exceptions.

    Returns:
        Résultat agrégé exportés / échecs.

    Raises:
        ValidationException: Si le chemin Unity n'est pas configuré (avant boucle).
    """
    resolve_unity_dir(config_service, request_id)
    result = BatchExportResult()

    for doc_id in document_ids:
        document: Optional[dict] = None
        output_filename: Optional[str] = None
        try:
            doc_id_safe = safe_document_id(doc_id)
            unity_dir = resolve_unity_dir(config_service, request_id)
            document = read_document_blob(unity_dir, doc_id_safe)
            output_filename = _resolve_output_filename(doc_id_safe, document, filename_strategy)
            _file_path, filename = export_persisted_document(
                config_service,
                doc_id,
                skip_validation=skip_validation,
                filename_strategy=filename_strategy,
                request_id=request_id,
            )
            result.exported.append(filename)
            logger.info("Batch export OK: %s → %s", doc_id, filename)
            if export_log_service is not None and llm_usage_service is not None:
                record_batch_export_item(
                    export_log_service,
                    llm_usage_service,
                    document_id=doc_id_safe,
                    filename=filename,
                    export_status="success",
                    document=document,
                    skip_validation=skip_validation,
                )
        except FileNotFoundError:
            err = [f"Document {doc_id} non trouvé"]
            result.failed.append(BatchExportFailedItem(id=doc_id, errors=err))
            if export_log_service is not None and llm_usage_service is not None:
                record_batch_export_item(
                    export_log_service,
                    llm_usage_service,
                    document_id=doc_id,
                    filename=f"{safe_document_id(doc_id)}.json",
                    export_status="failure",
                    errors=err,
                    skip_validation=skip_validation,
                )
        except ValidationException as exc:
            errors = extract_validation_errors(exc)
            result.failed.append(BatchExportFailedItem(id=doc_id, errors=errors))
            if export_log_service is not None and llm_usage_service is not None:
                record_batch_export_item(
                    export_log_service,
                    llm_usage_service,
                    document_id=doc_id,
                    filename=output_filename or f"{doc_id}.json",
                    export_status="failure",
                    errors=errors,
                    document=document,
                    skip_validation=skip_validation,
                )
        except ValueError as exc:
            err = [str(exc)]
            result.failed.append(BatchExportFailedItem(id=doc_id, errors=err))
            if export_log_service is not None and llm_usage_service is not None:
                record_batch_export_item(
                    export_log_service,
                    llm_usage_service,
                    document_id=doc_id,
                    filename=output_filename or f"{doc_id}.json",
                    export_status="failure",
                    errors=err,
                    document=document,
                    skip_validation=skip_validation,
                )
        except json.JSONDecodeError as exc:
            err = [f"JSON invalide: {exc}"]
            result.failed.append(BatchExportFailedItem(id=doc_id, errors=err))
            if export_log_service is not None and llm_usage_service is not None:
                record_batch_export_item(
                    export_log_service,
                    llm_usage_service,
                    document_id=doc_id,
                    filename=f"{doc_id}.json",
                    export_status="failure",
                    errors=err,
                    skip_validation=skip_validation,
                )
        except OSError as exc:
            logger.warning("Batch export écriture disque échouée pour %s: %s", doc_id, exc)
            err = [f"Erreur d'écriture disque: {exc}"]
            result.failed.append(BatchExportFailedItem(id=doc_id, errors=err))
            if export_log_service is not None and llm_usage_service is not None:
                record_batch_export_item(
                    export_log_service,
                    llm_usage_service,
                    document_id=doc_id,
                    filename=output_filename or f"{doc_id}.json",
                    export_status="failure",
                    errors=err,
                    document=document,
                    skip_validation=skip_validation,
                )

    return result

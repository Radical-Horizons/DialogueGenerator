"""Router API — chargement et sauvegarde de graphes (Unity JSON ↔ ReactFlow)."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, status

from api.dependencies import get_config_service, get_export_log_service, get_llm_usage_service, get_request_id
from api.exceptions import InternalServerException, ValidationException
from api.schemas.graph import (
    ExportPreviewResponse,
    GraphMetadata,
    LoadGraphRequest,
    LoadGraphResponse,
    SaveGraphRequest,
    SaveGraphResponse,
)
from services.configuration_service import ConfigurationService
from services.export_log_recorder import (
    record_graph_export_failure,
    record_graph_export_success,
    record_graph_export_validation_exception,
)
from services.export_log_service import ExportLogService
from services.graph_conversion_service import GraphConversionService
from services.llm_usage_service import LLMUsageService
from services.unity_dialogue_export_service import (
    read_last_seq,
    unity_export_schema_validator,
    write_unity_dialogue_to_file,
)
from services.unity_export_preview_service import preview_graph_export
from services.unity_graph_export_serialization import (
    export_filename_from_title,
    graph_to_unity_json_content,
)

logger = logging.getLogger(__name__)


def _sanitize_dialogue_title_for_filename(title: str) -> str:
    """Normalise le titre métadonnées en base de nom de fichier (sans extension)."""
    sanitized = re.sub(r"[^\w\s-]", "", title)
    return re.sub(r"[-\s]+", "_", sanitized)


router = APIRouter()


@router.post(
    "/load",
    response_model=LoadGraphResponse,
    status_code=status.HTTP_200_OK,
)
async def load_graph(
    request_data: LoadGraphRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> LoadGraphResponse:
    """Charge un dialogue Unity JSON et le convertit en format graphe (nodes/edges).

    Args:
        request_data: Contenu JSON Unity.
        request_id: ID de la requête.

    Returns:
        Nœuds et edges ReactFlow avec métadonnées.

    Raises:
        ValidationException: Si le JSON est invalide.
        InternalServerException: Si la conversion échoue.
    """
    try:
        nodes, edges = GraphConversionService.unity_json_to_graph(request_data.json_content)

        metadata = GraphMetadata(
            title="Dialogue Unity",
            node_count=len(nodes),
            edge_count=len(edges),
        )

        logger.info(
            "Graphe chargé: %s nœuds, %s edges (request_id: %s)",
            metadata.node_count,
            metadata.edge_count,
            request_id,
        )

        return LoadGraphResponse(
            nodes=nodes,
            edges=edges,
            metadata=metadata,
        )

    except ValueError as e:
        logger.warning("Validation error lors du chargement (request_id: %s): %s", request_id, e)
        raise ValidationException(
            message=str(e),
            request_id=request_id,
        )
    except Exception as e:
        logger.exception("Erreur lors du chargement du graphe (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors du chargement du graphe",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/save",
    response_model=SaveGraphResponse,
    status_code=status.HTTP_200_OK,
)
async def save_graph(
    request_data: SaveGraphRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> SaveGraphResponse:
    """Sauvegarde un graphe modifié (reconvertit en Unity JSON).

    Args:
        request_data: Nœuds et edges ReactFlow avec métadonnées.
        request_id: ID de la requête.

    Returns:
        Nom de fichier et contenu JSON Unity généré.
        Si seq/document_id fournis (ADR-006), ack_seq et last_seq dans la réponse.

    Raises:
        ValidationException: Si la conversion échoue.
        InternalServerException: Si la sauvegarde échoue.
    """
    try:
        json_content = GraphConversionService.graph_to_unity_json(
            request_data.nodes,
            request_data.edges,
        )

        sanitized_title = _sanitize_dialogue_title_for_filename(request_data.metadata.title)
        filename = f"{sanitized_title}.json"

        extra: dict = {}
        if request_data.seq is not None:
            extra["ack_seq"] = request_data.seq
            extra["last_seq"] = request_data.seq

        logger.info(
            "Graphe sauvegardé: %s, %s nœuds (request_id: %s)",
            filename,
            request_data.metadata.node_count,
            request_id,
        )

        return SaveGraphResponse(
            success=True,
            filename=filename,
            json_content=json_content,
            **extra,
        )

    except ValueError as e:
        logger.warning("Validation error lors de la sauvegarde (request_id: %s): %s", request_id, e)
        raise ValidationException(
            message=str(e),
            request_id=request_id,
        )
    except Exception as e:
        logger.exception("Erreur lors de la sauvegarde du graphe (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la sauvegarde du graphe",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/save-and-write",
    response_model=SaveGraphResponse,
    status_code=status.HTTP_200_OK,
)
async def save_graph_and_write(
    request_data: SaveGraphRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    export_log_service: Annotated[ExportLogService, Depends(get_export_log_service)],
    llm_usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> SaveGraphResponse:
    """Convertit le graphe en Unity JSON, valide et écrit le fichier sur disque (un seul appel).

    ADR-006: Si seq/document_id fournis, seq <= last_seq → ne pas écraser (200 + ack(last_seq));
    seq > last_seq → écriture atomique + persistance last_seq + ack(seq).
    """
    try:
        document, json_content = graph_to_unity_json_content(
            request_data.nodes,
            request_data.edges,
            dialogue_flags=request_data.dialogue_flags,
            title=request_data.metadata.title,
        )
        filename = export_filename_from_title(request_data.metadata.title)
        filename_without_ext = filename[:-5] if filename.lower().endswith(".json") else filename
        document_key = filename_without_ext

        seq = request_data.seq
        last_seq: Optional[int] = None
        if seq is not None:
            unity_path = config_service.get_unity_dialogues_path()
            if unity_path:
                unity_dir = Path(unity_path)
                last_seq = read_last_seq(unity_dir, document_key)
            if last_seq is not None and seq <= last_seq:
                logger.info(
                    "save-and-write: seq %s <= last_seq %s, pas d'écriture (request_id: %s)",
                    seq,
                    last_seq,
                    request_id,
                )
                return SaveGraphResponse(
                    success=True,
                    filename=filename,
                    json_content=json_content,
                    ack_seq=last_seq,
                    last_seq=last_seq,
                )

        _, filename_out = write_unity_dialogue_to_file(
            config_service=config_service,
            json_content=json_content,
            filename=filename_without_ext,
            request_id=request_id,
            validator=unity_export_schema_validator,
            last_seq_after_write=seq,
            preserve_source_fields=bool(request_data.dialogue_flags),
        )

        record_graph_export_success(
            export_log_service,
            llm_usage_service,
            document=document,
            filename=filename_out,
        )

        extra: dict = {}
        if seq is not None:
            extra["ack_seq"] = seq
            extra["last_seq"] = seq

        logger.info(
            "Graphe sauvegardé et écrit: %s, %s nœuds (request_id: %s)",
            filename_out,
            request_data.metadata.node_count,
            request_id,
        )
        return SaveGraphResponse(
            success=True,
            filename=filename_out,
            json_content=json_content,
            **extra,
        )
    except ValidationException as exc:
        record_graph_export_validation_exception(
            export_log_service,
            llm_usage_service,
            document=document,
            filename=filename,
            exc=exc,
        )
        raise
    except ValueError as e:
        logger.warning("Validation error lors de save-and-write (request_id: %s): %s", request_id, e)
        err_msg = str(e)
        if "document" in locals() and "filename" in locals():
            record_graph_export_failure(
                export_log_service,
                llm_usage_service,
                document=document,
                filename=filename,
                errors=[err_msg],
            )
        raise ValidationException(message=err_msg, request_id=request_id)
    except Exception as e:
        logger.exception("Erreur lors de la sauvegarde du graphe (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la sauvegarde du graphe",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/preview-export",
    response_model=ExportPreviewResponse,
    status_code=status.HTTP_200_OK,
)
async def preview_graph_export_route(
    request_data: SaveGraphRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> ExportPreviewResponse:
    """Preview export graphe sans écriture disque (Story 5.5 / FR53)."""
    try:
        result = preview_graph_export(
            request_data.nodes,
            request_data.edges,
            dialogue_flags=request_data.dialogue_flags,
            title=request_data.metadata.title,
        )
        return ExportPreviewResponse(
            json_content=result.json_content,
            size_bytes=result.size_bytes,
            node_count=result.node_count,
            filename=result.filename,
            schema_valid=result.schema_valid,
            errors=result.errors,
        )
    except ValueError as exc:
        raise ValidationException(message=str(exc), request_id=request_id) from exc
    except Exception as exc:
        logger.exception("Erreur preview-export graphe (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la prévisualisation export",
            details={"error": str(exc)},
            request_id=request_id,
        ) from exc

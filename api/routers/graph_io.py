"""Router API — chargement et sauvegarde de graphes (Unity JSON ↔ ReactFlow)."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, status

from api.dependencies import get_config_service, get_request_id
from api.exceptions import InternalServerException, ValidationException
from api.schemas.graph import (
    GraphMetadata,
    LoadGraphRequest,
    LoadGraphResponse,
    SaveGraphRequest,
    SaveGraphResponse,
)
from services.configuration_service import ConfigurationService
from services.graph_conversion_service import GraphConversionService
from services.unity_dialogue_export_service import (
    read_last_seq,
    unity_export_schema_validator,
    write_unity_dialogue_to_file,
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
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> SaveGraphResponse:
    """Convertit le graphe en Unity JSON, valide et écrit le fichier sur disque (un seul appel).

    ADR-006: Si seq/document_id fournis, seq <= last_seq → ne pas écraser (200 + ack(last_seq));
    seq > last_seq → écriture atomique + persistance last_seq + ack(seq).
    """
    try:
        document = GraphConversionService.graph_to_unity_document(
            request_data.nodes,
            request_data.edges,
            dialogue_flags=request_data.dialogue_flags,
            title=request_data.metadata.title,
        )
        json_content = json.dumps(document, ensure_ascii=False, indent=2)
        sanitized_title = _sanitize_dialogue_title_for_filename(request_data.metadata.title)
        filename_without_ext = sanitized_title[:100] if sanitized_title else "dialogue"
        filename = filename_without_ext + ".json"
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
    except ValidationException:
        raise
    except ValueError as e:
        logger.warning("Validation error lors de save-and-write (request_id: %s): %s", request_id, e)
        raise ValidationException(message=str(e), request_id=request_id)
    except Exception as e:
        logger.exception("Erreur lors de la sauvegarde du graphe (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la sauvegarde du graphe",
            details={"error": str(e)},
            request_id=request_id,
        )

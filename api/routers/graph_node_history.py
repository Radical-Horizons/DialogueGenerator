"""Router API — prompt nœud, accept / reject / regenerate (historique génération).

Story 4.14 : ~450L acceptable — 4 handlers partagent 3 helpers privés étroitement couplés.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, status

from api.dependencies import (
    get_config_service,
    get_context_builder,
    get_graph_node_orchestrator,
    get_llm_usage_service,
    get_request_id,
)
from api.exceptions import (
    AllLLMProvidersUnavailableError,
    InternalServerException,
    NotFoundException,
    ValidationException,
)
from api.routers.graph_cost import fingerprint_for_selections_safe, try_compute_context_relevance
from api.schemas.graph import (
    AcceptNodeRequest,
    NodePromptResponse,
    RegenerateNodeRequest,
    RegenerateNodeResponse,
    RejectNodeRequest,
    SuggestedConnection,
)
from core.context.context_builder import ContextBuilder
from services.configuration_service import ConfigurationService
from services.dialogue_path_context import build_enriched_generation_prompt
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.llm_usage_service import LLMUsageService
from api.routers.graph_router_helpers import create_llm_client_for_router, resolve_and_enrich_graph_context

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_dialogue_exists(
    dialogue_id: str,
    config_service: ConfigurationService,
    request_id: Optional[str],
) -> None:
    """Vérifie que le dialogue existe (fichier Unity). Skip si dialogue_id == 'current'."""
    if dialogue_id == "current":
        return
    fname = dialogue_id
    if ".." in fname or "/" in fname or "\\" in fname:
        raise ValidationException(
            message="Nom de fichier invalide (caractères interdits)",
            details={"dialogue_id": dialogue_id},
            request_id=request_id,
        )
    unity_path = config_service.get_unity_dialogues_path()
    if not unity_path:
        raise ValidationException(
            message="Le chemin Unity dialogues n'est pas configuré.",
            details={"field": "unity_dialogues_path"},
            request_id=request_id,
        )
    if not fname.endswith(".json"):
        fname = fname + ".json"
    path = Path(unity_path) / fname
    if not path.exists():
        raise NotFoundException(
            resource_type="Dialogue Unity",
            resource_id=fname,
            request_id=request_id,
        )


from services.dialogue_dramatic_progression import DEFAULT_NODE_SCENE_INSTRUCTIONS

_DEFAULT_INSTRUCTIONS = DEFAULT_NODE_SCENE_INSTRUCTIONS


def _load_unity_nodes_from_dialogue(
    config_service: ConfigurationService,
    dialogue_id: str,
) -> list:
    """Charge la liste des nœuds Unity d'un dialogue (fichier JSON)."""
    unity_path = config_service.get_unity_dialogues_path()
    if not unity_path:
        raise ValueError("Chemin Unity non configuré")
    fname = dialogue_id if dialogue_id.endswith(".json") else dialogue_id + ".json"
    path = Path(unity_path) / fname
    if not path.exists():
        raise FileNotFoundError(f"Dialogue {dialogue_id} introuvable")
    raw = path.read_text(encoding="utf-8")
    doc = json.loads(raw)
    if isinstance(doc, list):
        return doc
    return doc.get("nodes", [])


def _reconstruct_prompt_for_node(
    config_service: ConfigurationService,
    dialogue_id: str,
    node_id: str,
    request_id: Optional[str] = None,
) -> str:
    """Reconstruit le prompt utilisateur pour un nœud à partir du document (Story 1.14)."""
    nodes = _load_unity_nodes_from_dialogue(config_service, dialogue_id)
    node = next((n for n in nodes if n.get("id") == node_id), None)
    if not node:
        raise NotFoundException(
            resource_type="Node",
            resource_id=node_id,
            request_id=request_id,
        )
    parent_node: Optional[dict] = None
    choice_text: Optional[str] = None
    for n in nodes:
        choices = n.get("choices") or []
        for c in choices:
            if c.get("targetNode") == node_id:
                parent_node = n
                choice_text = c.get("text", "")
                break
        if parent_node is not None:
            break
    if not parent_node:
        return build_enriched_generation_prompt(
            nodes=nodes,
            parent_node_id=str(node.get("id", node_id)),
            parent_speaker=str(node.get("speaker") or "PNJ"),
            parent_line=str(node.get("line") or ""),
            user_instructions=_DEFAULT_INSTRUCTIONS,
        )

    parent_id = str(parent_node.get("id", ""))
    return build_enriched_generation_prompt(
        nodes=nodes,
        parent_node_id=parent_id,
        parent_speaker=str(parent_node.get("speaker") or "PNJ"),
        parent_line=str(parent_node.get("line") or ""),
        user_instructions=_DEFAULT_INSTRUCTIONS,
        choice_text=choice_text,
    )


@router.get(
    "/prompt",
    response_model=NodePromptResponse,
    status_code=status.HTTP_200_OK,
)
async def get_node_prompt(
    dialogue_id: str,
    node_id: str,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> NodePromptResponse:
    """Retourne le prompt exact ou reconstruit pour un nœud (Story 1.14)."""
    try:
        _validate_dialogue_exists(dialogue_id, config_service, request_id)
    except (NotFoundException, ValidationException):
        raise
    try:
        record = usage_service.repository.get_by_dialogue_and_node(dialogue_id, node_id)
    except Exception as e:
        logger.debug(
            "get_node_prompt: impossible de charger le record (dialogue_id=%s, node_id=%s): %s",
            dialogue_id,
            node_id,
            e,
        )
        record = None

    stored_prompt = getattr(record, "prompt", None) if record else None
    if stored_prompt and isinstance(stored_prompt, str) and stored_prompt.strip():
        return NodePromptResponse(
            raw_prompt=stored_prompt.strip(),
            prompt_tokens=record.prompt_tokens if record else None,
            completion_tokens=record.completion_tokens if record else None,
            timestamp=record.timestamp if record else None,
            is_historical=True,
            message="Prompt historique - contexte GDD depuis modifié",
        )

    try:
        raw_prompt = _reconstruct_prompt_for_node(
            config_service, dialogue_id, node_id, request_id=request_id
        )
    except NotFoundException:
        raise
    except FileNotFoundError as e:
        raise NotFoundException(
            resource_type="Dialogue Unity",
            resource_id=dialogue_id,
            request_id=request_id,
        ) from e
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning("Erreur chargement document pour prompt (request_id: %s): %s", request_id, e)
        raise ValidationException(
            message="Document invalide ou introuvable pour la reconstruction du prompt",
            details={"error": str(e)},
            request_id=request_id,
        ) from e
    except Exception as e:
        logger.exception("Erreur GET prompt (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la récupération du prompt",
            details={"error": str(e)},
            request_id=request_id,
        ) from e

    return NodePromptResponse(
        raw_prompt=raw_prompt,
        prompt_tokens=record.prompt_tokens if record else None,
        completion_tokens=record.completion_tokens if record else None,
        timestamp=record.timestamp if record else None,
        is_historical=False,
        message="Prompt reconstruit (contexte actuel)",
    )


@router.post(
    "/nodes/{node_id}/accept",
    status_code=status.HTTP_200_OK,
)
async def accept_node(
    node_id: str,
    request_data: AcceptNodeRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
):
    """Accepte un nœud généré (validation dialogue existant ; persistance côté client)."""
    try:
        _validate_dialogue_exists(
            request_data.dialogue_id, config_service, request_id
        )
        logger.info(
            "Nœud accepté: %s, dialogue: %s (request_id: %s)",
            node_id,
            request_data.dialogue_id,
            request_id,
        )
        return {"success": True, "node_id": node_id, "status": "accepted"}
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.exception("Erreur lors de l'acceptation du nœud (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de l'acceptation du nœud",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/nodes/{node_id}/regenerate",
    response_model=RegenerateNodeResponse,
    status_code=status.HTTP_200_OK,
)
async def regenerate_node(
    node_id: str,
    request_data: RegenerateNodeRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    orchestrator: Annotated[GraphNodeOrchestrator, Depends(get_graph_node_orchestrator)],
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> RegenerateNodeResponse:
    """Régénère un nœud avec de nouvelles instructions (Story 1.10)."""
    try:
        _validate_dialogue_exists(
            request_data.dialogue_id, config_service, request_id
        )
        llm_client = create_llm_client_for_router(
            request_data.llm_model_identifier,
            config_service,
            usage_service,
            request_id,
        )

        dramatis, enriched_context = resolve_and_enrich_graph_context(
            request_data.context_selections or {},
            player_character_id=request_data.player_character_id,
            context_builder=context_builder,
        )

        result = await orchestrator.generate(
            llm_client=llm_client,
            parent_node_id=request_data.parent_node_id,
            parent_node_content=request_data.parent_node_content,
            user_instructions=request_data.new_instructions,
            context_selections=enriched_context,
            system_prompt_override=request_data.system_prompt_override,
            max_choices=None,
            target_choice_index=request_data.via_choice_index,
            generate_all_choices=False,
            dialogue_nodes=request_data.dialogue_nodes,
            player_character_id=dramatis.player_character_id,
        )

        if not result.nodes:
            raise InternalServerException(
                message="Aucun nœud généré lors de la régénération",
                request_id=request_id,
            )

        new_node = dict(result.nodes[0])
        new_node["id"] = node_id

        suggested_connections = [
            SuggestedConnection(
                **{
                    "from": c.get("from", c.get("from_node", "")),
                    "to": node_id,
                    "via_choice_index": c.get("via_choice_index"),
                    "connection_type": c.get("connection_type", "choice"),
                }
            )
            for c in result.suggested_connections
        ]

        logger.info(
            "Nœud régénéré: %s, parent: %s (request_id: %s)",
            node_id,
            request_data.parent_node_id,
            request_id,
        )
        usage_service.annotate_usage(request_id, request_data.dialogue_id, str(node_id))
        try_compute_context_relevance(usage_service, request_id)
        gdd_fp = await asyncio.to_thread(
            fingerprint_for_selections_safe,
            context_builder,
            enriched_context,
        )
        return RegenerateNodeResponse(
            node=new_node,
            suggested_connections=suggested_connections,
            context_gdd_content_fingerprint=gdd_fp,
        )
    except (NotFoundException, ValidationException):
        raise
    except AllLLMProvidersUnavailableError:
        raise
    except InternalServerException:
        raise
    except Exception as e:
        logger.exception("Erreur lors de la régénération du nœud (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la régénération du nœud",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/nodes/{node_id}/reject",
    status_code=status.HTTP_200_OK,
)
async def reject_node(
    node_id: str,
    request_data: RejectNodeRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
):
    """Rejette un nœud généré (validation dialogue existant ; persistance côté client)."""
    try:
        _validate_dialogue_exists(
            request_data.dialogue_id, config_service, request_id
        )
        logger.info(
            "Nœud rejeté: %s, dialogue: %s (request_id: %s)",
            node_id,
            request_data.dialogue_id,
            request_id,
        )
        return {"success": True, "node_id": node_id, "status": "rejected"}
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.exception("Erreur lors du rejet du nœud (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors du rejet du nœud",
            details={"error": str(e)},
            request_id=request_id,
        )

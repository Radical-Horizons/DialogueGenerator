"""Router API — génération de nœuds dans le graphe."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, status

from api.dependencies import (
    get_config_service,
    get_context_builder,
    get_graph_node_orchestrator,
    get_llm_usage_service,
    get_request_id,
    require_non_guest,
)
from api.exceptions import AllLLMProvidersUnavailableError, InternalServerException, ValidationException
from api.routers.auth import get_current_user
from api.routers.graph_cost import fingerprint_for_selections_safe, try_compute_context_relevance
from api.routers.graph_router_helpers import create_llm_client_for_router, resolve_and_enrich_graph_context
from api.schemas.graph import GenerateNodeRequest, GenerateNodeResponse, SuggestedConnection
from core.context.context_builder import ContextBuilder
from services.configuration_service import ConfigurationService
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.llm_usage_service import LLMUsageService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


def _reject_guest_user(
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
) -> dict[str, object]:
    """Dépendance FastAPI : refuse les sessions invitées avant le corps métier."""
    return require_non_guest(current_user)


@router.post(
    "/generate-node",
    response_model=GenerateNodeResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_node(
    _current_user: Annotated[dict[str, object], Depends(_reject_guest_user)],
    request_data: GenerateNodeRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    orchestrator: Annotated[GraphNodeOrchestrator, Depends(get_graph_node_orchestrator)],
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> GenerateNodeResponse:
    """Génère un nœud en contexte (extension de /generate/unity-dialogue).

    Délègue la logique métier à ``GraphNodeOrchestrator`` et se limite à :
    1. Instancier le client LLM
    2. Appeler l'orchestrateur
    3. Mapper le résultat vers le schéma HTTP
    """
    try:
        llm_client = create_llm_client_for_router(
            request_data.llm_model_identifier,
            config_service,
            usage_service,
            request_id,
        )

        dramatis, enriched_context = resolve_and_enrich_graph_context(
            request_data.context_selections,
            player_character_id=request_data.player_character_id,
            npc_speaker_id=request_data.npc_speaker_id,
            context_builder=context_builder,
        )

        result = await orchestrator.generate(
            llm_client=llm_client,
            parent_node_id=request_data.parent_node_id,
            parent_node_content=request_data.parent_node_content,
            user_instructions=request_data.user_instructions,
            context_selections=enriched_context,
            system_prompt_override=request_data.system_prompt_override,
            max_choices=request_data.max_choices,
            target_choice_index=request_data.target_choice_index,
            generate_all_choices=request_data.generate_all_choices,
            dialogue_nodes=request_data.dialogue_nodes,
            player_character_id=dramatis.player_character_id,
            choices_mode=request_data.choices_mode,
        )

        suggested_connections = [
            SuggestedConnection(**conn) for conn in result.suggested_connections
        ]

        logger.info(
            "generate-node terminé: %d nœud(s), parent: %s (request_id: %s)",
            len(result.nodes),
            result.parent_node_id,
            request_id,
        )

        if request_data.dialogue_id and result.nodes:
            first_node_id = (
                result.nodes[0].get("id")
                if isinstance(result.nodes[0], dict)
                else getattr(result.nodes[0], "id", None)
            )
            if first_node_id:
                usage_service.annotate_usage(
                    request_id, request_data.dialogue_id, str(first_node_id)
                )
                try_compute_context_relevance(usage_service, request_id)

        gdd_fp = fingerprint_for_selections_safe(
            context_builder,
            enriched_context,
        )

        return GenerateNodeResponse(
            node=result.nodes[0] if result.nodes else None,
            nodes=result.nodes if len(result.nodes) > 1 else None,
            suggested_connections=suggested_connections,
            parent_node_id=result.parent_node_id,
            batch_count=result.batch_count,
            generated_choices_count=result.generated_choices_count,
            connected_choices_count=result.connected_choices_count,
            failed_choices_count=result.failed_choices_count,
            total_choices_count=result.total_choices_count,
            context_gdd_content_fingerprint=gdd_fp,
        )

    except ValueError as e:
        logger.warning("Validation error lors de generate-node (request_id: %s): %s", request_id, e)
        raise ValidationException(
            message=str(e),
            request_id=request_id,
        )
    except ValidationException:
        raise
    except AllLLMProvidersUnavailableError:
        raise
    except Exception as e:
        logger.exception("Erreur lors de la génération de nœud (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la génération de nœud",
            details={"error": str(e)},
            request_id=request_id,
        )

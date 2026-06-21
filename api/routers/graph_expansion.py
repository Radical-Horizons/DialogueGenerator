"""Router API — expansion BFS d'un dialogue complet."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, status

from api.dependencies import (
    get_config_service,
    get_dialogue_tree_expansion_service,
    get_llm_pricing_service,
    get_llm_usage_service,
    get_request_id,
    get_token_estimation_service,
    get_unity_dialogue_orchestrator,
)
from api.exceptions import InternalServerException, ValidationException
from api.routers.documents import _resolve_document_base, _write_document_blob, _write_meta
from api.routers.graph_cost import _build_representative_prompt_for_estimate
from api.routers.graph_router_helpers import create_llm_client_for_router
from api.schemas.graph import ExpandTreeRequest, ExpandTreeResponse
from services.configuration_service import ConfigurationService
from services.dialogue_tree_expansion_service import (
    DialogueTreeExpansionService,
    estimate_tree_llm_calls,
)
from services.llm_pricing_service import LLMPricingService
from services.llm_usage_service import LLMUsageService
from services.token_estimation_service import TokenEstimationService
from services.unity_dialogue_export_service import write_unity_dialogue_to_file, unity_export_schema_validator
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter()


def _sanitize_document_id(title: str) -> str:
    """Produit un identifiant document sûr à partir du titre."""
    sanitized = re.sub(r"[^\w\s-]", "", title)
    slug = re.sub(r"[-\s]+", "_", sanitized).strip("_").lower()
    if not slug:
        slug = "dialogue_auto"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"{slug}_{timestamp}"


def _estimate_tree_cost_usd(
    *,
    request_data: ExpandTreeRequest,
    config_service: ConfigurationService,
    token_service: TokenEstimationService,
    pricing_service: LLMPricingService,
) -> float:
    """Estime le coût USD total pour une expansion complète."""
    model_id = request_data.llm_model_identifier
    context_dict = request_data.context_selections.to_service_dict()
    representative_prompt = _build_representative_prompt_for_estimate(
        {"speaker": "PNJ", "line": "Ligne représentative pour estimation."},
        request_data.user_instructions,
        context_dict,
    )
    prompt_tokens, completion_tokens_per_node = token_service.estimate_tokens(
        representative_prompt,
        model_id,
    )
    total_calls = estimate_tree_llm_calls(request_data.max_depth, request_data.max_choices)
    total_completion = completion_tokens_per_node * total_calls
    return pricing_service.calculate_cost(model_id, prompt_tokens, total_completion)


@router.post(
    "/expand-tree",
    response_model=ExpandTreeResponse,
    status_code=status.HTTP_200_OK,
)
async def expand_tree(
    request_data: ExpandTreeRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    expansion_service: Annotated[DialogueTreeExpansionService, Depends(get_dialogue_tree_expansion_service)],
    unity_orchestrator: Annotated[UnityDialogueOrchestrator, Depends(get_unity_dialogue_orchestrator)],
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    token_service: Annotated[TokenEstimationService, Depends(get_token_estimation_service)],
    pricing_service: Annotated[LLMPricingService, Depends(get_llm_pricing_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> ExpandTreeResponse:
    """Génère un dialogue complet par expansion BFS (START + choix PJ récursifs)."""
    try:
        if not request_data.context_selections.characters_full and not request_data.context_selections.characters_excerpt:
            raise ValidationException(
                message="Au moins un personnage est requis dans context_selections.",
                request_id=request_id,
            )

        document_id = request_data.document_id or _sanitize_document_id(request_data.title)
        llm_model = request_data.llm_model_identifier
        estimated_calls = estimate_tree_llm_calls(request_data.max_depth, request_data.max_choices)

        if request_data.dry_run:
            cost_usd = _estimate_tree_cost_usd(
                request_data=request_data,
                config_service=config_service,
                token_service=token_service,
                pricing_service=pricing_service,
            )
            return ExpandTreeResponse(
                document={"schemaVersion": "1.2.0", "nodes": []},
                node_count=0,
                llm_calls_estimated=estimated_calls,
                levels_expanded=0,
                document_id=document_id,
                failed_parents=[],
                cost_usd=cost_usd,
                llm_model_identifier=llm_model,
            )

        llm_client = create_llm_client_for_router(
            llm_model,
            config_service,
            usage_service,
            request_id,
        )

        result = await expansion_service.expand(
            unity_orchestrator=unity_orchestrator,
            llm_client=llm_client,
            user_instructions=request_data.user_instructions,
            context_selections=request_data.context_selections,
            max_depth=request_data.max_depth,
            max_choices=request_data.max_choices,
            npc_speaker_id=request_data.npc_speaker_id,
            player_character_id=request_data.player_character_id,
            llm_model_identifier=llm_model,
            title=request_data.title,
        )

        if request_data.persist:
            base_dir, doc_id = _resolve_document_base(document_id, config_service, request_id)
            _write_document_blob(base_dir, doc_id, result.document)
            _write_meta(base_dir, doc_id, 1)
            try:
                json_content = json.dumps(result.document, ensure_ascii=False)
                write_unity_dialogue_to_file(
                    config_service=config_service,
                    json_content=json_content,
                    filename=doc_id,
                    title=result.title,
                    request_id=request_id,
                    validator=unity_export_schema_validator,
                )
            except Exception as export_exc:
                logger.warning(
                    "Export Unity fichier échoué pour %s (document persisté): %s",
                    doc_id,
                    export_exc,
                )

        logger.info(
            "expand-tree terminé: %s nœuds, %s appels LLM, doc=%s (request_id=%s)",
            result.node_count,
            result.llm_calls,
            document_id,
            request_id,
        )

        return ExpandTreeResponse(
            document=result.document,
            node_count=result.node_count,
            llm_calls_estimated=result.llm_calls,
            levels_expanded=result.levels_expanded,
            document_id=document_id,
            failed_parents=result.failed_parents,
            cost_usd=None,
            llm_model_identifier=llm_model,
        )

    except ValidationException:
        raise
    except Exception as exc:
        logger.exception("Erreur expand-tree (request_id: %s)", request_id)
        raise InternalServerException(
            message=str(exc),
            request_id=request_id,
        )

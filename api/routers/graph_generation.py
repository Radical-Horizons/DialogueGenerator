"""Router API — génération de nœuds dans le graphe."""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated, Any, Dict, Optional

from fastapi import APIRouter, Depends, status

from api.dependencies import (
    get_batch_node_generation_job_manager,
    get_batch_node_generation_service,
    get_config_service,
    get_context_builder,
    get_cost_governance_service,
    get_graph_node_orchestrator,
    get_llm_pricing_service,
    get_llm_usage_service,
    get_request_id,
    require_non_guest,
)
from api.exceptions import (
    AllLLMProvidersUnavailableError,
    APIException,
    InternalServerException,
    NotFoundException,
    ValidationException,
)
from api.middleware.billable_user_context import get_billable_user_id
from api.middleware.cost_governance import DEFAULT_COMPLETION_TOKENS, DEFAULT_PROMPT_TOKENS
from api.routers.auth import get_current_user
from api.routers.graph_cost import fingerprint_for_selections_safe, try_compute_context_relevance
from api.routers.graph_router_helpers import create_llm_client_for_router, resolve_and_enrich_graph_context
from api.schemas.batch_node_generation import (
    BatchGenerateFromNodesJobRequest,
    BatchGenerateFromNodesReport,
    BatchGenerateJobCreateResponse,
    BatchGenerateJobStatusResponse,
    BatchGenerateParentItemResponse,
    SuggestedConnectionPayload,
)
from api.schemas.graph import GenerateNodeRequest, GenerateNodeResponse, SuggestedConnection
from api.services.batch_node_generation_job_manager import BatchNodeGenerationJobManager
from api.utils.job_ownership import job_owner_key
from constants import Defaults
from core.context.context_builder import ContextBuilder
from services.batch_node_generation_service import (
    BATCH_GENERATE_HARD_MAX,
    BATCH_GENERATE_JOB_MIN,
    BatchNodeGenerationReport,
    BatchNodeGenerationService,
    BatchParentInput,
)
from services.configuration_service import ConfigurationService
from services.cost_governance_service import CostGovernanceService
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.llm_pricing_service import LLMPricingService
from services.llm_usage_service import LLMUsageService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


def _reject_guest_user(
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
) -> dict[str, object]:
    """Dépendance FastAPI : refuse les sessions invitées avant le corps métier."""
    return require_non_guest(current_user)


def _owner_key(current_user: dict[str, object]) -> str:
    """Identifiant propriétaire pour les jobs en mémoire."""
    return job_owner_key(current_user)


def _check_batch_budget_or_raise(
    parent_count: int,
    model_id: Optional[str],
    pricing_service: LLMPricingService,
    cost_service: CostGovernanceService,
    request_id: str,
) -> None:
    """Vérifie le budget avec le N réel (post-parsing du body).

    Le pré-check du middleware (``CostGovernanceMiddleware``) estime le coût
    ×N depuis un header client (``X-Batch-Parent-Count``) que le body n'a pas
    encore été lu à ce stade — un client peut y mentir sans conséquence. Ce
    contrôle-ci utilise ``len(request_data.parents)``, la valeur réelle que le
    job va traiter, et fait autorité : c'est lui qui bloque, pas le header.
    """
    prompt_tokens = DEFAULT_PROMPT_TOKENS * parent_count
    completion_tokens = DEFAULT_COMPLETION_TOKENS * parent_count
    estimated_cost = pricing_service.calculate_cost(
        model_name=model_id or Defaults.MODEL_ID,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )
    budget_check = cost_service.check_budget(
        user_id=get_billable_user_id(),
        estimated_cost=estimated_cost,
    )
    if not budget_check["allowed"]:
        raise APIException(
            status_code=429,
            code="QUOTA_EXCEEDED",
            message=budget_check.get("warning", "Monthly quota reached"),
            details={
                "percentage": budget_check["percentage"],
                "estimated_cost": estimated_cost,
                "parent_count": parent_count,
            },
            request_id=request_id,
        )


def _report_to_response(report: BatchNodeGenerationReport) -> BatchGenerateFromNodesReport:
    """Mappe le rapport métier vers le schéma HTTP."""
    items: list[BatchGenerateParentItemResponse] = []
    for item in report.items:
        connections: list[SuggestedConnectionPayload] = []
        for conn in item.suggested_connections:
            from_id = conn.get("from") or conn.get("from_node") or ""
            to_id = conn.get("to") or conn.get("to_node") or ""
            connections.append(
                SuggestedConnectionPayload(
                    **{
                        "from": str(from_id),
                        "to": str(to_id),
                        "via_choice_index": conn.get("via_choice_index"),
                        "connection_type": conn.get("connection_type") or "choice",
                    }
                )
            )
        items.append(
            BatchGenerateParentItemResponse(
                parent_node_id=item.parent_node_id,
                status=item.status,
                nodes=item.nodes,
                suggested_connections=connections,
                error=item.error,
                warning=item.warning,
                generated_choices_count=item.generated_choices_count,
                connected_choices_count=item.connected_choices_count,
                failed_choices_count=item.failed_choices_count,
                total_choices_count=item.total_choices_count,
                context_gdd_content_fingerprint=item.context_gdd_content_fingerprint,
            )
        )
    return BatchGenerateFromNodesReport(
        items=items,
        cancelled=report.cancelled,
        started_at=report.started_at,
        finished_at=report.finished_at,
        ok_count=report.ok_count,
        error_count=report.error_count,
        skipped_count=report.skipped_count,
        total_nodes_generated=report.total_nodes_generated,
    )


def _assert_job_owner(
    job: dict[str, Any],
    current_user: dict[str, object],
    job_id: str,
    request_id: Optional[str],
) -> None:
    """Refuse l'accès cross-user (sauf admin)."""
    owner = str(job.get("owner_username") or "")
    if owner != _owner_key(current_user) and current_user.get("role") != "admin":
        raise NotFoundException(
            resource_type="BatchGenerateJob",
            resource_id=job_id,
            request_id=request_id,
        )


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
                    request_id,
                    request_data.dialogue_id,
                    str(first_node_id),
                    template_id=request_data.template_id,
                    template_name=request_data.template_name,
                )
                try_compute_context_relevance(usage_service, request_id)

        gdd_fp = await asyncio.to_thread(
            fingerprint_for_selections_safe,
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


@router.post(
    "/batch-generate-from-nodes/jobs",
    response_model=BatchGenerateJobCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_batch_generate_from_nodes_job(
    _current_user: Annotated[dict[str, object], Depends(_reject_guest_user)],
    request_data: BatchGenerateFromNodesJobRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    batch_service: Annotated[
        BatchNodeGenerationService, Depends(get_batch_node_generation_service)
    ],
    job_manager: Annotated[
        BatchNodeGenerationJobManager, Depends(get_batch_node_generation_job_manager)
    ],
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    pricing_service: Annotated[LLMPricingService, Depends(get_llm_pricing_service)],
    cost_service: Annotated[CostGovernanceService, Depends(get_cost_governance_service)],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> BatchGenerateJobCreateResponse:
    """Lance un job async de génération multi-parents (N ≥ 10) — Story 8.9 / FR88."""
    parent_count = len(request_data.parents)
    if parent_count < BATCH_GENERATE_JOB_MIN:
        raise ValidationException(
            message=(
                f"Utilisez la boucle client generate-node pour N < {BATCH_GENERATE_JOB_MIN}"
            ),
            details={"count": parent_count},
            request_id=request_id,
        )
    if parent_count > BATCH_GENERATE_HARD_MAX:
        raise ValidationException(
            message=f"Maximum {BATCH_GENERATE_HARD_MAX} parents par lot",
            details={"count": parent_count},
            request_id=request_id,
        )
    _check_batch_budget_or_raise(
        parent_count,
        request_data.llm_model_identifier,
        pricing_service,
        cost_service,
        request_id,
    )

    parent_ids = [p.parent_node_id for p in request_data.parents]
    job_id = job_manager.create_job(parent_ids, _owner_key(current_user))

    parents = [
        BatchParentInput(
            parent_node_id=p.parent_node_id,
            parent_node_content=p.parent_node_content,
            context_selections=p.context_selections,
            user_instructions=p.user_instructions,
            npc_speaker_id=p.npc_speaker_id,
            player_character_id=p.player_character_id,
        )
        for p in request_data.parents
    ]

    model_id = request_data.llm_model_identifier
    dialogue_nodes = request_data.dialogue_nodes
    system_prompt_override = request_data.system_prompt_override
    max_choices = request_data.max_choices
    choices_mode = request_data.choices_mode
    document_id = request_data.document_id

    async def _runner() -> None:
        try:
            llm_client = create_llm_client_for_router(
                model_id,
                config_service,
                usage_service,
                request_id,
            )

            # Index inutilisé : enrichissement lié au parent passé au callback.
            def enrich_context(
                parent: BatchParentInput, raw: Dict[str, Any]
            ) -> Dict[str, Any]:
                _dramatis, enriched = resolve_and_enrich_graph_context(
                    raw,
                    player_character_id=parent.player_character_id,
                    npc_speaker_id=parent.npc_speaker_id,
                    context_builder=context_builder,
                )
                return enriched

            def fingerprint_for(enriched: Dict[str, Any]) -> Optional[str]:
                return fingerprint_for_selections_safe(context_builder, enriched)

            report = await batch_service.generate_batch(
                parents,
                llm_client=llm_client,
                dialogue_nodes=dialogue_nodes,
                system_prompt_override=system_prompt_override,
                max_choices=max_choices,
                choices_mode=choices_mode,
                enrich_context=enrich_context,
                fingerprint_for=fingerprint_for,
                should_cancel=lambda: job_manager.is_cancelled(job_id),
                on_progress=lambda current, _total, detail: job_manager.set_progress(
                    job_id, current, detail
                ),
            )
            payload = _report_to_response(report).model_dump(by_alias=True)
            if document_id and report.total_nodes_generated > 0:
                for item in report.items:
                    if item.status == "ok" and item.nodes:
                        nid = item.nodes[0].get("id")
                        if nid:
                            usage_service.annotate_usage(
                                request_id, document_id, str(nid)
                            )
                            break
            final_status = "cancelled" if report.cancelled else "completed"
            job_manager.complete(job_id, status=final_status, report=payload)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Job batch-generate-from-nodes %s échoué (request_id: %s)",
                job_id,
                request_id,
            )
            job_manager.complete(job_id, status="error", error=str(exc))

    task = asyncio.create_task(_runner())
    job_manager.register_task(job_id, task)
    return BatchGenerateJobCreateResponse(
        job_id=job_id,
        status="queued",
        total=parent_count,
    )


@router.get(
    "/batch-generate-from-nodes/jobs/{job_id}",
    response_model=BatchGenerateJobStatusResponse,
)
async def get_batch_generate_from_nodes_job(
    job_id: str,
    job_manager: Annotated[
        BatchNodeGenerationJobManager, Depends(get_batch_node_generation_job_manager)
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> BatchGenerateJobStatusResponse:
    """Retourne l'état / le rapport d'un job de génération batch."""
    job = job_manager.get_job(job_id)
    if job is None:
        raise NotFoundException(
            resource_type="BatchGenerateJob",
            resource_id=job_id,
            request_id=request_id,
        )
    _assert_job_owner(job, current_user, job_id, request_id)
    report_payload = job.get("report")
    report = (
        BatchGenerateFromNodesReport(**report_payload)
        if isinstance(report_payload, dict)
        else None
    )
    return BatchGenerateJobStatusResponse(
        job_id=job_id,
        status=job["status"],
        current=int(job.get("current") or 0),
        total=int(job.get("total") or 0),
        detail=str(job.get("detail") or ""),
        cancelled=bool(job.get("cancelled")),
        error=job.get("error"),
        report=report,
    )


@router.post(
    "/batch-generate-from-nodes/jobs/{job_id}/cancel",
    response_model=BatchGenerateJobStatusResponse,
)
async def cancel_batch_generate_from_nodes_job(
    job_id: str,
    job_manager: Annotated[
        BatchNodeGenerationJobManager, Depends(get_batch_node_generation_job_manager)
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> BatchGenerateJobStatusResponse:
    """Annule un job de génération batch en cours."""
    job = job_manager.get_job(job_id)
    if job is None:
        raise NotFoundException(
            resource_type="BatchGenerateJob",
            resource_id=job_id,
            request_id=request_id,
        )
    _assert_job_owner(job, current_user, job_id, request_id)
    job_manager.cancel_job(job_id)
    return await get_batch_generate_from_nodes_job(
        job_id, job_manager, current_user, request_id
    )

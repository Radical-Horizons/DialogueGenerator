"""Router pour les endpoints de suivi d'utilisation LLM."""
import logging
from datetime import date, datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Request, status

from api.routers.auth import get_current_user

from api.dependencies import get_llm_usage_service, get_request_id
from api.exceptions import InternalServerException
from api.schemas.llm_usage import (
    AllDialoguesCostResponse,
    ContextRelevanceHistoryEntry,
    ContextRelevanceHistoryResponse,
    ContextRelevanceReportResponse,
    ContextSectionUsageEntityGroup,
    ContextSectionUsageFlatItem,
    ContextSectionUsageItem,
    ContextSectionUsageReportResponse,
    DialogueCostResponse,
    DialogueCostSummaryEntry,
    GenerationLogEntry,
    GenerationLogsResponse,
    LLMUsageHistoryResponse,
    LLMUsageRecordResponse,
    LLMUsageStatisticsResponse,
    NodeCostEntry,
)
from services.context_relevance_scoring import extract_generated_plain_text
from api.utils.pagination import paginate_list, PaginationParams
from services.llm_usage_service import LLMUsageService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


def _context_section_usage_to_response(
    dialogue_id: str,
    node_id: str,
    raw: dict,
    generated_preview: str,
) -> ContextSectionUsageReportResponse:
    """Construit le schéma HTTP à partir du dict persisté / calculé."""
    groups = [
        ContextSectionUsageEntityGroup(
            entity_type=g["entity_type"],
            entity_label=g["entity_label"],
            sections=[ContextSectionUsageItem(**s) for s in g.get("sections", [])],
        )
        for g in raw.get("entity_groups", [])
    ]
    weak = [ContextSectionUsageFlatItem(**x) for x in raw.get("weak_sections", [])]
    refl = [ContextSectionUsageFlatItem(**x) for x in raw.get("reflected_sections", [])]
    return ContextSectionUsageReportResponse(
        record_present=True,
        dialogue_id=dialogue_id,
        node_id=node_id,
        request_id=raw.get("request_id"),
        method=str(raw.get("method", "unknown")),
        computation_ms=int(raw.get("computation_ms", 0)),
        computed_at=str(raw.get("computed_at", "")),
        reflected_threshold_percent=float(raw.get("reflected_threshold_percent", 40.0)),
        entity_groups=groups,
        weak_sections=weak,
        reflected_sections=refl,
        weak_section_count=int(raw.get("weak_section_count", len(weak))),
        reflected_section_count=int(raw.get("reflected_section_count", len(refl))),
        generated_plain_preview=generated_preview,
        parser_note=raw.get("parser_note"),
    )


@router.get(
    "/history",
    response_model=LLMUsageHistoryResponse,
    status_code=status.HTTP_200_OK
)
async def get_usage_history(
    request: Request,
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)],
    start_date: Optional[date] = Query(
        default=None,
        description="Date de début (incluse). Par défaut: 30 jours avant aujourd'hui."
    ),
    end_date: Optional[date] = Query(
        default=None,
        description="Date de fin (incluse). Par défaut: aujourd'hui."
    ),
    model: Optional[str] = Query(
        default=None,
        alias="model",
        description="Filtrer par nom de modèle (ex: gpt-4o)"
    ),
    page: int = Query(default=1, ge=1, description="Numéro de page"),
    page_size: int = Query(default=50, ge=1, le=200, description="Taille de la page")
) -> LLMUsageHistoryResponse:
    """Récupère l'historique d'utilisation LLM avec pagination.
    
    Args:
        request: La requête HTTP.
        usage_service: Service de tracking injecté.
        request_id: ID de la requête.
        start_date: Date de début (optionnel).
        end_date: Date de fin (optionnel).
        model: Filtrer par modèle (optionnel).
        page: Numéro de page.
        page_size: Taille de la page.
        
    Returns:
        Historique paginé des enregistrements d'utilisation.
        
    Raises:
        InternalServerException: Si la récupération échoue.
    """
    try:
        # Définir les dates par défaut si non fournies
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=30)
        
        # Récupérer l'historique
        records = usage_service.get_usage_history(
            start_date=start_date,
            end_date=end_date,
            model_name=model
        )
        
        # Paginer
        total = len(records)
        pagination_params = PaginationParams(page=page, page_size=page_size)
        paginated_records = paginate_list(records, pagination_params)
        total_pages = (total + page_size - 1) // page_size
        
        # Convertir en schémas de réponse
        record_responses = [
            LLMUsageRecordResponse(
                request_id=r.request_id,
                timestamp=r.timestamp,
                model_name=r.model_name,
                prompt_tokens=r.prompt_tokens,
                completion_tokens=r.completion_tokens,
                total_tokens=r.total_tokens,
                estimated_cost=r.estimated_cost,
                duration_ms=r.duration_ms,
                success=r.success,
                endpoint=r.endpoint,
                k_variants=r.k_variants,
                error_message=r.error_message,
                dialogue_id=r.dialogue_id,
                node_id=r.node_id,
            )
            for r in paginated_records
        ]
        
        return LLMUsageHistoryResponse(
            records=record_responses,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages
        )
        
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération de l'historique LLM (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération de l'historique d'utilisation LLM",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/dialogue/{dialogue_id}/costs",
    response_model=DialogueCostResponse,
    status_code=status.HTTP_200_OK,
)
async def get_dialogue_costs(
    dialogue_id: str,
    request: Request,
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> DialogueCostResponse:
    """Récupère le breakdown détaillé des coûts LLM pour un dialogue.

    Args:
        dialogue_id: Identifiant du dialogue (nom du fichier JSON Unity).
        request: La requête HTTP.
        usage_service: Service de tracking injecté.
        request_id: ID de la requête.

    Returns:
        Coût total, nombre de nœuds générés, coût moyen et détail par nœud.

    Raises:
        InternalServerException: Si la récupération échoue.
    """
    try:
        data = usage_service.get_dialogue_costs(dialogue_id)
        return DialogueCostResponse(
            dialogue_id=data["dialogue_id"],
            total_cost_eur=data["total_cost_eur"],
            node_count=data["node_count"],
            avg_cost_per_node_eur=data["avg_cost_per_node_eur"],
            breakdown=[NodeCostEntry(**entry) for entry in data["breakdown"]],
        )
    except Exception as e:
        logger.exception(
            f"Erreur lors de la récupération des coûts dialogue (dialogue_id: {dialogue_id}, "
            f"request_id: {request_id})"
        )
        raise InternalServerException(
            message="Erreur lors de la récupération des coûts du dialogue",
            details={"error": str(e), "dialogue_id": dialogue_id},
            request_id=request_id,
        )


@router.get(
    "/dialogue/{dialogue_id}/generation-logs",
    response_model=GenerationLogsResponse,
    status_code=status.HTTP_200_OK,
)
async def get_generation_logs(
    dialogue_id: str,
    request: Request,
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)],
    start_date: Optional[date] = Query(default=None, description="Date de début (incluse)"),
    end_date: Optional[date] = Query(default=None, description="Date de fin (incluse)"),
    model_name: Optional[str] = Query(default=None, alias="model_name", description="Filtrer par modèle / provider"),
) -> GenerationLogsResponse:
    """Récupère les logs de génération pour un dialogue (Story 1.15).
    
    Liste chronologique (plus récent en premier) avec prompt, réponse, coût, tokens, statut.
    Filtres optionnels : période (start_date, end_date), provider (model_name).
    """
    try:
        data = usage_service.get_generation_logs(
            dialogue_id=dialogue_id,
            start_date=start_date,
            end_date=end_date,
            model_name=model_name,
        )
        return GenerationLogsResponse(
            entries=[GenerationLogEntry(**e) for e in data["entries"]],
            total_count=data["total_count"],
            total_cost_eur=data["total_cost_eur"],
        )
    except Exception as e:
        logger.exception(
            f"Erreur lors de la récupération des generation-logs (dialogue_id: {dialogue_id}, "
            f"request_id: {request_id})"
        )
        raise InternalServerException(
            message="Erreur lors de la récupération des logs de génération",
            details={"error": str(e), "dialogue_id": dialogue_id},
            request_id=request_id,
        )


@router.get(
    "/dialogue/{dialogue_id}/nodes/{node_id}/context-relevance",
    response_model=ContextRelevanceReportResponse,
    status_code=status.HTTP_200_OK,
)
async def get_node_context_relevance(
    dialogue_id: str,
    node_id: str,
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> ContextRelevanceReportResponse:
    """Rapport de pertinence contexte GDD pour un nœud généré (Story 3.6)."""
    try:
        raw = usage_service.get_context_relevance_for_node(dialogue_id, node_id)
        if raw is None:
            return ContextRelevanceReportResponse(
                record_present=False,
                dialogue_id=dialogue_id,
                node_id=node_id,
                request_id=None,
                score_percent=0.0,
                breakdown_by_type={},
                reflected_types=[],
                weak_types=[],
                low_context_warning=False,
                low_threshold_percent=30.0,
                method="none",
                computation_ms=0,
                computed_at="",
                suggestions_hints=[],
            )
        return ContextRelevanceReportResponse(
            record_present=True,
            dialogue_id=dialogue_id,
            node_id=node_id,
            request_id=raw.get("request_id"),
            score_percent=float(raw["score_percent"]),
            breakdown_by_type=dict(raw.get("breakdown_by_type", {})),
            reflected_types=list(raw.get("reflected_types", [])),
            weak_types=list(raw.get("weak_types", [])),
            low_context_warning=bool(raw.get("low_context_warning", False)),
            low_threshold_percent=float(raw.get("low_threshold_percent", 30.0)),
            method=str(raw.get("method", "unknown")),
            computation_ms=int(raw.get("computation_ms", 0)),
            computed_at=str(raw.get("computed_at", "")),
            suggestions_hints=list(raw.get("suggestions_hints", [])),
        )
    except Exception as e:
        logger.exception(
            "Erreur context-relevance (dialogue_id=%s, node_id=%s, request_id=%s)",
            dialogue_id,
            node_id,
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la récupération de la pertinence contexte",
            details={"error": str(e), "dialogue_id": dialogue_id, "node_id": node_id},
            request_id=request_id,
        )


@router.get(
    "/dialogue/{dialogue_id}/nodes/{node_id}/context-usage",
    response_model=ContextSectionUsageReportResponse,
    status_code=status.HTTP_200_OK,
)
async def get_node_context_section_usage(
    dialogue_id: str,
    node_id: str,
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> ContextSectionUsageReportResponse:
    """Rapport d’usage des sections GDD injectées pour un nœud (Story 3.7, FR17)."""
    try:
        raw = usage_service.get_context_section_usage_for_node(dialogue_id, node_id)
        if raw is None:
            return ContextSectionUsageReportResponse(
                record_present=False,
                dialogue_id=dialogue_id,
                node_id=node_id,
                request_id=None,
                method="none",
                computation_ms=0,
                computed_at="",
                reflected_threshold_percent=40.0,
                entity_groups=[],
                weak_sections=[],
                reflected_sections=[],
                weak_section_count=0,
                reflected_section_count=0,
                generated_plain_preview="",
                parser_note=None,
            )
        record = usage_service.get_record_for_dialogue_node(dialogue_id, node_id)
        preview = ""
        if record and record.response:
            preview = extract_generated_plain_text(record.response)[:4000]
        return _context_section_usage_to_response(
            dialogue_id, node_id, raw, preview
        )
    except Exception as e:
        logger.exception(
            "Erreur context-usage (dialogue_id=%s, node_id=%s, request_id=%s)",
            dialogue_id,
            node_id,
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la récupération de l’usage contexte par section",
            details={"error": str(e), "dialogue_id": dialogue_id, "node_id": node_id},
            request_id=request_id,
        )


@router.get(
    "/dialogue/{dialogue_id}/context-relevance-history",
    response_model=ContextRelevanceHistoryResponse,
    status_code=status.HTTP_200_OK,
)
async def get_dialogue_context_relevance_history(
    dialogue_id: str,
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> ContextRelevanceHistoryResponse:
    """Historique des scores de pertinence pour un dialogue (Story 3.6)."""
    try:
        rows = usage_service.list_context_relevance_history(dialogue_id)
        entries = [
            ContextRelevanceHistoryEntry(
                request_id=r["request_id"],
                node_id=r.get("node_id"),
                timestamp=r["timestamp"],
                score_percent=float(r["score_percent"]),
                low_context_warning=bool(r.get("low_context_warning", False)),
                breakdown_by_type=dict(r.get("breakdown_by_type", {})),
            )
            for r in rows
        ]
        return ContextRelevanceHistoryResponse(
            dialogue_id=dialogue_id,
            entries=entries,
            total_count=len(entries),
        )
    except Exception as e:
        logger.exception(
            "Erreur context-relevance-history (dialogue_id=%s, request_id=%s)",
            dialogue_id,
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la récupération de l’historique de pertinence",
            details={"error": str(e), "dialogue_id": dialogue_id},
            request_id=request_id,
        )


@router.get(
    "/dialogues/costs",
    response_model=AllDialoguesCostResponse,
    status_code=status.HTTP_200_OK,
)
async def get_all_dialogues_costs(
    request: Request,
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> AllDialoguesCostResponse:
    """Liste tous les dialogues avec leurs coûts agrégés, triés par coût décroissant (AC#3).

    Args:
        request: La requête HTTP.
        usage_service: Service de tracking injecté.
        request_id: ID de la requête.

    Returns:
        Liste de résumés de coûts par dialogue, triés du plus coûteux au moins coûteux.

    Raises:
        InternalServerException: Si la récupération échoue.
    """
    try:
        summaries = usage_service.get_all_dialogues_costs()
        return AllDialoguesCostResponse(
            dialogues=[DialogueCostSummaryEntry(**s) for s in summaries],
            total_dialogues=len(summaries),
        )
    except Exception as e:
        logger.exception(
            f"Erreur lors de la récupération des coûts multi-dialogues (request_id: {request_id})"
        )
        raise InternalServerException(
            message="Erreur lors de la récupération des coûts de tous les dialogues",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/nodes/{node_id}/mark-deleted",
    status_code=status.HTTP_200_OK,
)
async def mark_node_deleted(
    node_id: str,
    request: Request,
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> dict:
    """Marque un nœud comme supprimé dans l'historique des coûts (AC#5).

    Appelé lors du rejet d'un nœud pour mettre à jour l'indicateur 'Nœud supprimé'
    dans le breakdown sans supprimer l'entrée de l'historique.

    Args:
        node_id: ID du nœud supprimé.
        request: La requête HTTP.
        usage_service: Service de tracking injecté.
        request_id: ID de la requête.

    Returns:
        Confirmation avec found=True si le record a été mis à jour.

    Raises:
        InternalServerException: Si la mise à jour échoue.
    """
    try:
        found = usage_service.mark_node_deleted(node_id)
        return {"success": True, "node_id": node_id, "found": found}
    except Exception as e:
        logger.exception(
            f"Erreur lors du marquage nœud supprimé (node_id: {node_id}, "
            f"request_id: {request_id})"
        )
        raise InternalServerException(
            message="Erreur lors du marquage du nœud comme supprimé",
            details={"error": str(e), "node_id": node_id},
            request_id=request_id,
        )


@router.get(
    "/statistics",
    response_model=LLMUsageStatisticsResponse,
    status_code=status.HTTP_200_OK
)
async def get_usage_statistics(
    request: Request,
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)],
    start_date: Optional[date] = Query(
        default=None,
        description="Date de début (incluse). Par défaut: 30 jours avant aujourd'hui."
    ),
    end_date: Optional[date] = Query(
        default=None,
        description="Date de fin (incluse). Par défaut: aujourd'hui."
    ),
    model: Optional[str] = Query(
        default=None,
        alias="model",
        description="Filtrer par nom de modèle (ex: gpt-4o)"
    )
) -> LLMUsageStatisticsResponse:
    """Récupère les statistiques agrégées d'utilisation LLM.
    
    Args:
        request: La requête HTTP.
        usage_service: Service de tracking injecté.
        request_id: ID de la requête.
        start_date: Date de début (optionnel).
        end_date: Date de fin (optionnel).
        model: Filtrer par modèle (optionnel).
        
    Returns:
        Statistiques agrégées d'utilisation.
        
    Raises:
        InternalServerException: Si le calcul échoue.
    """
    try:
        # Définir les dates par défaut si non fournies
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=30)
        
        # Récupérer les statistiques
        stats = usage_service.get_statistics(
            start_date=start_date,
            end_date=end_date,
            model_name=model
        )
        
        return LLMUsageStatisticsResponse(
            total_tokens=stats["total_tokens"],
            total_prompt_tokens=stats["total_prompt_tokens"],
            total_completion_tokens=stats["total_completion_tokens"],
            total_cost=stats["total_cost"],
            calls_count=stats["calls_count"],
            success_count=stats["success_count"],
            error_count=stats["error_count"],
            success_rate=stats["success_rate"],
            avg_duration_ms=stats["avg_duration_ms"],
            start_date=start_date,
            end_date=end_date,
            model_name=model
        )
        
    except Exception as e:
        logger.exception(f"Erreur lors du calcul des statistiques LLM (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors du calcul des statistiques d'utilisation LLM",
            details={"error": str(e)},
            request_id=request_id
        )


"""Router pour les endpoints de cost governance."""
import logging
from datetime import date, datetime, timedelta
from typing import Annotated, Dict, Any

from fastapi import APIRouter, Depends, Request, status

from api.routers.auth import get_current_user

from api.dependencies import get_cost_governance_service, get_llm_usage_service, get_request_id
from api.exceptions import InternalServerException
from api.schemas.costs import BudgetResponse, UpdateBudgetRequest, UsageResponse, DailyCost
from services.cost_governance_service import CostGovernanceService
from services.llm_usage_service import LLMUsageService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


def _billable_scope_id(user: Dict[str, Any]) -> str:
    """Identifiant stable pour quota / agrégation (username ou id)."""
    return str(user.get("username") or user.get("id") or "default_user")


@router.get(
    "/budget",
    response_model=BudgetResponse,
    status_code=status.HTTP_200_OK
)
async def get_budget(
    current_user: Annotated[dict, Depends(get_current_user)],
    request: Request,
    cost_service: Annotated[CostGovernanceService, Depends(get_cost_governance_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> BudgetResponse:
    """Récupère le budget actuel (quota, amount, percentage).
    
    Args:
        request: La requête HTTP.
        cost_service: Service de cost governance injecté.
        request_id: ID de la requête.
        
    Returns:
        Statut du budget actuel.
        
    Raises:
        InternalServerException: Si la récupération échoue.
    """
    try:
        uid = _billable_scope_id(current_user)
        status_data = cost_service.get_budget_status(user_id=uid)
        
        return BudgetResponse(
            quota=status_data["quota"],
            amount=status_data["amount"],
            percentage=status_data["percentage"],
            remaining=status_data["remaining"]
        )
    except Exception as e:
        logger.error(f"Erreur lors de la récupération du budget: {e}", exc_info=True)
        raise InternalServerException(
            message="Erreur lors de la récupération du budget",
            request_id=request_id
        )


@router.put(
    "/budget",
    response_model=BudgetResponse,
    status_code=status.HTTP_200_OK
)
async def update_budget(
    current_user: Annotated[dict, Depends(get_current_user)],
    request: Request,
    budget_request: UpdateBudgetRequest,
    cost_service: Annotated[CostGovernanceService, Depends(get_cost_governance_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> BudgetResponse:
    """Met à jour le quota budget.
    
    Args:
        request: La requête HTTP.
        budget_request: Nouveau quota à définir.
        cost_service: Service de cost governance injecté.
        request_id: ID de la requête.
        
    Returns:
        Statut du budget mis à jour.
        
    Raises:
        InternalServerException: Si la mise à jour échoue.
    """
    try:
        uid = _billable_scope_id(current_user)
        cost_service.update_quota(user_id=uid, new_quota=budget_request.quota)
        
        status_data = cost_service.get_budget_status(user_id=uid)
        
        return BudgetResponse(
            quota=status_data["quota"],
            amount=status_data["amount"],
            percentage=status_data["percentage"],
            remaining=status_data["remaining"]
        )
    except Exception as e:
        logger.error(f"Erreur lors de la mise à jour du budget: {e}", exc_info=True)
        raise InternalServerException(
            message="Erreur lors de la mise à jour du budget",
            request_id=request_id
        )


@router.get(
    "/usage",
    response_model=UsageResponse,
    status_code=status.HTTP_200_OK
)
async def get_usage(
    current_user: Annotated[dict, Depends(get_current_user)],
    request: Request,
    cost_service: Annotated[CostGovernanceService, Depends(get_cost_governance_service)],
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> UsageResponse:
    """Récupère l'usage avec graphique (coûts quotidiens).
    
    Args:
        request: La requête HTTP.
        cost_service: Service de cost governance injecté.
        usage_service: Service de tracking d'utilisation LLM injecté.
        request_id: ID de la requête.
        
    Returns:
        Usage avec coûts quotidiens pour le graphique.
        
    Raises:
        InternalServerException: Si la récupération échoue.
    """
    try:
        uid = _billable_scope_id(current_user)
        budget_status = cost_service.get_budget_status(user_id=uid)
        
        # Récupérer l'historique du mois actuel
        current_month = datetime.now()
        start_date = date(current_month.year, current_month.month, 1)
        end_date = date.today()
        
        records = usage_service.get_usage_history(
            start_date=start_date,
            end_date=end_date,
            billable_user_id=uid,
        )
        
        # Calculer les coûts quotidiens
        daily_costs_dict: Dict[str, float] = {}
        total_cost = 0.0
        
        for record in records:
            record_date = record.timestamp.date()
            date_str = record_date.isoformat()
            
            if date_str not in daily_costs_dict:
                daily_costs_dict[date_str] = 0.0
            
            daily_costs_dict[date_str] += record.estimated_cost
            total_cost += record.estimated_cost
        
        # Convertir en liste triée par date
        daily_costs = [
            DailyCost(date=date_str, cost=cost)
            for date_str, cost in sorted(daily_costs_dict.items())
        ]
        
        # Calculer le pourcentage
        quota = budget_status["quota"]
        percentage = (total_cost / quota * 100.0) if quota > 0.0 else 0.0
        
        return UsageResponse(
            daily_costs=daily_costs,
            total=total_cost,
            percentage=percentage
        )
    except Exception as e:
        logger.error(f"Erreur lors de la récupération de l'usage: {e}", exc_info=True)
        raise InternalServerException(
            message="Erreur lors de la récupération de l'usage",
            request_id=request_id
        )

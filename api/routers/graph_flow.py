"""Router API — simulation de flux et layout du graphe."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, status

from api.dependencies import get_request_id
from api.exceptions import InternalServerException
from api.schemas.graph import (
    CalculateLayoutRequest,
    CalculateLayoutResponse,
    SimulateFlowRequest,
    SimulateFlowResponse,
    ValidationErrorDetail,
)
from services.graph_conversion_service import GraphConversionService
from services.graph_validation_service import GraphValidationService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/simulate-flow",
    response_model=SimulateFlowResponse,
    status_code=status.HTTP_200_OK,
)
async def simulate_flow(
    request_data: SimulateFlowRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> SimulateFlowResponse:
    """Simule le flux de dialogue et retourne dead ends + cul-de-sacs (FR46)."""
    try:
        flow_result = GraphValidationService.simulate_flow(
            request_data.nodes,
            request_data.edges,
        )
        dead_ends = [ValidationErrorDetail(**e.to_dict()) for e in flow_result.errors]
        cul_de_sacs = [ValidationErrorDetail(**w.to_dict()) for w in flow_result.warnings]
        has_entry = not any(e.type == "missing_start" for e in flow_result.errors)
        dead_end_ids = [e.node_id for e in flow_result.errors if e.node_id] if has_entry else []
        coverage = GraphValidationService.compute_coverage_stats(
            request_data.nodes if has_entry else [], dead_end_ids, len(cul_de_sacs)
        )

        logger.info(
            "simulate-flow: %d dead ends, %d cul-de-sacs (request_id: %s)",
            len(dead_ends),
            len(cul_de_sacs),
            request_id,
        )
        return SimulateFlowResponse(dead_ends=dead_ends, cul_de_sacs=cul_de_sacs, coverage=coverage)

    except Exception as e:
        logger.exception(
            "Erreur lors de simulate-flow (request_id: %s)",
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la simulation de flux",
            details={"error": str(e)},
            request_id=request_id,
        ) from e


@router.post(
    "/calculate-layout",
    response_model=CalculateLayoutResponse,
    status_code=status.HTTP_200_OK,
)
async def calculate_layout(
    request_data: CalculateLayoutRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> CalculateLayoutResponse:
    """Calcule un layout automatique pour le graphe."""
    try:
        laid_out_nodes = GraphConversionService.calculate_layout(
            request_data.nodes,
            request_data.edges,
            request_data.algorithm,
            request_data.direction,
        )

        logger.info(
            "Layout calculé: %s nœuds, algorithme: %s (request_id: %s)",
            len(laid_out_nodes),
            request_data.algorithm,
            request_id,
        )

        return CalculateLayoutResponse(nodes=laid_out_nodes)

    except Exception as e:
        logger.exception("Erreur lors du calcul de layout (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors du calcul de layout",
            details={"error": str(e)},
            request_id=request_id,
        )

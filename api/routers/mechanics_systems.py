"""Router du catalogue d'intégration systèmes de jeu."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, status

from api.dependencies import get_request_id
from api.exceptions import InternalServerException
from api.routers.auth import get_current_user
from api.schemas.game_systems import GameSystemsIntegrationCatalogResponse
from services.game_systems_integration_service import GameSystemsIntegrationService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/mechanics/systems",
    tags=["Mechanics - Systems"],
    dependencies=[Depends(get_current_user)],
)


def get_game_systems_integration_service() -> GameSystemsIntegrationService:
    """Retourne le service de catalogue systèmes."""
    return GameSystemsIntegrationService()


@router.get(
    "/integration",
    response_model=GameSystemsIntegrationCatalogResponse,
    status_code=status.HTTP_200_OK,
)
async def get_systems_integration_catalog(
    service: Annotated[
        GameSystemsIntegrationService,
        Depends(get_game_systems_integration_service),
    ],
    request_id: Annotated[str, Depends(get_request_id)],
) -> GameSystemsIntegrationCatalogResponse:
    """Expose les familles FR94 et l'état de connexion runtime non bloquant."""
    try:
        return service.get_catalog()
    except Exception as exc:
        logger.exception(
            "Erreur lors de la récupération du catalogue systèmes (request_id: %s)",
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la récupération du catalogue systèmes",
            details={"error": str(exc)},
            request_id=request_id,
        ) from exc

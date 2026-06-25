"""Router du catalogue d'intégration systèmes de jeu."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, status

from api.dependencies import get_request_id, get_skill_catalog_service
from api.exceptions import InternalServerException
from api.routers.auth import get_current_user
from api.schemas.game_systems import (
    GameSystemsIntegrationCatalogResponse,
    SkillCheckCatalogEntrySchema,
    SkillCheckCatalogResponse,
)
from services.game_systems_integration_service import GameSystemsIntegrationService
from services.skill_catalog_service import SkillCatalogService
from services.skill_check_catalog import load_attribute_entries

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


@router.get(
    "/skill-check-catalog",
    response_model=SkillCheckCatalogResponse,
    status_code=status.HTTP_200_OK,
)
async def get_skill_check_catalog(
    skill_service: Annotated[SkillCatalogService, Depends(get_skill_catalog_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> SkillCheckCatalogResponse:
    """Expose caractéristiques et compétences (id Unity + libellé) pour l'éditeur."""
    try:
        attributes = [
            SkillCheckCatalogEntrySchema(id=entry.id, label=entry.label)
            for entry in load_attribute_entries()
        ]
        skills = [
            SkillCheckCatalogEntrySchema(id=entry.id, label=entry.label)
            for entry in skill_service.load_skill_entries()
        ]
        return SkillCheckCatalogResponse(attributes=attributes, skills=skills)
    except Exception as exc:
        logger.exception(
            "Erreur catalogue skill-check (request_id: %s)",
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la récupération du catalogue skill-check",
            details={"error": str(exc)},
            request_id=request_id,
        ) from exc

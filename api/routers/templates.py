"""Router FastAPI pour les endpoints /api/v1/templates (GET liste + POST créer)."""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import get_template_service
from api.routers.auth import get_current_user
from api.schemas.template import Template, TemplateCreate, TemplateCreateResponse
from services.template_service import TemplateService

router = APIRouter(dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)


@router.get("", response_model=List[Template])
def list_templates(
    template_service: TemplateService = Depends(get_template_service),
) -> List[Template]:
    """Liste tous les templates custom.

    Returns:
        Liste des templates (vide si aucun).
    """
    try:
        templates = template_service.list_templates()
        logger.info("Liste templates retournée: %s templates", len(templates))
        return templates
    except Exception as exc:
        logger.exception("Erreur liste templates")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing templates",
        ) from exc


@router.post("", response_model=TemplateCreateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    template_data: TemplateCreate,
    template_service: TemplateService = Depends(get_template_service),
) -> TemplateCreateResponse:
    """Crée un template custom.

    Args:
        template_data: Nom, description, catégorie, icône et configuration snapshotée.

    Returns:
        Template créé avec ``warnings`` (tableau, éventuellement vide).

    Raises:
        500: Erreur d'écriture disque ou permissions.
    """
    try:
        template, warnings = template_service.create_template(template_data.model_dump())
        logger.info("Template créé: %s (ID: %s)", template.name, template.id)
        return TemplateCreateResponse(
            **template.model_dump(),
            warnings=warnings,
        )
    except PermissionError as exc:
        logger.exception("Permission denied creating template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Permission denied",
        ) from exc
    except OSError as exc:
        logger.exception("Disk error creating template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Disk error",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur création template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating template",
        ) from exc

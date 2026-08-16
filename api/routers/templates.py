"""Router FastAPI pour les endpoints /api/v1/templates (CRUD)."""
import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import (
    get_template_marketplace_service,
    get_template_service,
    require_non_guest,
)
from api.routers.auth import get_current_user
from api.schemas.preset import PresetValidationResult
from api.schemas.template import (
    MarketplaceListing,
    MarketplacePublishRequest,
    MarketplaceRatingRequest,
    PrebuiltTemplate,
    Template,
    TemplateCreate,
    TemplateCreateResponse,
    TemplateUpdate,
)
from services.template_marketplace_service import (
    MarketplaceForbiddenError,
    OwnListingRatingError,
    TemplateMarketplaceService,
)
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


@router.get("/prebuilt", response_model=List[PrebuiltTemplate])
def list_prebuilt_templates(
    template_service: TemplateService = Depends(get_template_service),
) -> List[PrebuiltTemplate]:
    """Liste les templates pré-built Alteir (lecture seule).

    Returns:
        Catalogue versionné (vide si fichier absent).
    """
    try:
        templates = template_service.list_prebuilt_templates()
        logger.info("Liste pré-built retournée: %s fiches", len(templates))
        return templates
    except ValueError as exc:
        logger.exception("Catalogue pré-built invalide")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing prebuilt templates",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur liste pré-built")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing prebuilt templates",
        ) from exc


@router.get("/prebuilt/{slug}", response_model=PrebuiltTemplate)
def get_prebuilt_template(
    slug: str,
    template_service: TemplateService = Depends(get_template_service),
) -> PrebuiltTemplate:
    """Charge une fiche pré-built par slug.

    Raises:
        404: Slug absent.
    """
    try:
        return template_service.get_prebuilt_template(slug)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prebuilt template not found",
        ) from exc
    except ValueError as exc:
        logger.exception("Catalogue pré-built invalide")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error loading prebuilt template",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur chargement pré-built")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error loading prebuilt template",
        ) from exc


@router.get("/marketplace", response_model=List[MarketplaceListing])
def list_marketplace_templates(
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> List[MarketplaceListing]:
    """Liste les fiches marketplace publiées."""
    try:
        return marketplace_service.browse_templates()
    except Exception as exc:
        logger.exception("Erreur liste marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing marketplace templates",
        ) from exc


@router.get("/marketplace/{listing_id}", response_model=MarketplaceListing)
def get_marketplace_template(
    listing_id: str,
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> MarketplaceListing:
    """Charge une fiche marketplace."""
    try:
        return marketplace_service.get_listing(listing_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marketplace listing not found",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur chargement marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error loading marketplace listing",
        ) from exc


@router.post(
    "/marketplace",
    response_model=MarketplaceListing,
    status_code=status.HTTP_201_CREATED,
)
def publish_marketplace_template(
    body: MarketplacePublishRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> MarketplaceListing:
    """Publie un template custom (upsert si déjà publié par le même auteur)."""
    require_non_guest(current_user)
    try:
        listing = marketplace_service.share_template(body.templateId, current_user)
        logger.info("Template publié marketplace: %s", listing.id)
        return listing
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc
    except MarketplaceForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Marketplace publish forbidden",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur publication marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error publishing marketplace template",
        ) from exc


@router.post(
    "/marketplace/{listing_id}/use",
    response_model=TemplateCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def use_marketplace_template(
    listing_id: str,
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> TemplateCreateResponse:
    """Copie une fiche vers Mes templates et incrémente les usages."""
    try:
        return marketplace_service.use_listing(listing_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marketplace listing not found",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur copie marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error using marketplace listing",
        ) from exc


@router.put("/marketplace/{listing_id}/rating", response_model=MarketplaceListing)
def rate_marketplace_template(
    listing_id: str,
    body: MarketplaceRatingRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> MarketplaceListing:
    """Note une fiche (1–5, pas soi-même)."""
    require_non_guest(current_user)
    try:
        return marketplace_service.rate_listing(listing_id, body.stars, current_user)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marketplace listing not found",
        ) from exc
    except OwnListingRatingError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot rate own marketplace listing",
        ) from exc
    except MarketplaceForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Marketplace rating forbidden",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur notation marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error rating marketplace listing",
        ) from exc


@router.delete("/marketplace/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def unpublish_marketplace_template(
    listing_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> None:
    """Retire une fiche (auteur ou admin)."""
    require_non_guest(current_user)
    try:
        marketplace_service.unpublish_listing(listing_id, current_user)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marketplace listing not found",
        ) from exc
    except MarketplaceForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Marketplace unpublish forbidden",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur retrait marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error unpublishing marketplace listing",
        ) from exc


@router.get("/{template_id}/validate", response_model=PresetValidationResult)
def validate_template(
    template_id: str,
    template_service: TemplateService = Depends(get_template_service),
) -> PresetValidationResult:
    """Valide les références GDD d'un template (sans muter le JSON).

    Raises:
        404: Template absent.
    """
    try:
        result = template_service.validate_template_references(template_id)
        if not result.valid:
            logger.warning(
                "Template %s has %s obsolete references",
                template_id,
                len(result.obsoleteRefs),
            )
        return result
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur validation template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error validating template",
        ) from exc


@router.get("/{template_id}", response_model=Template)
def get_template(
    template_id: str,
    template_service: TemplateService = Depends(get_template_service),
) -> Template:
    """Charge un template par UUID.

    Raises:
        404: Template absent.
    """
    try:
        return template_service.get_template(template_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur chargement template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error loading template",
        ) from exc


@router.put("/{template_id}", response_model=TemplateCreateResponse)
def update_template(
    template_id: str,
    update_data: TemplateUpdate,
    template_service: TemplateService = Depends(get_template_service),
) -> TemplateCreateResponse:
    """Met à jour un template (même UUID).

    Returns:
        Template persisté avec ``warnings`` GDD.

    Raises:
        404: Template absent.
        500: Erreur disque.
    """
    try:
        template, warnings = template_service.update_template(
            template_id,
            update_data.model_dump(exclude_none=True),
        )
        logger.info("Template mis à jour: %s (ID: %s)", template.name, template.id)
        return TemplateCreateResponse(
            **template.model_dump(),
            warnings=warnings,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc
    except PermissionError as exc:
        logger.exception("Permission denied updating template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Permission denied",
        ) from exc
    except OSError as exc:
        logger.exception("Disk error updating template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Disk error",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur mise à jour template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating template",
        ) from exc


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: str,
    template_service: TemplateService = Depends(get_template_service),
) -> None:
    """Supprime un template.

    Raises:
        404: Template absent.
    """
    try:
        template_service.delete_template(template_id)
        logger.info("Template supprimé: %s", template_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur suppression template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error deleting template",
        ) from exc

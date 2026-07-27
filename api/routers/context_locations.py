"""Router contexte GDD — lieux, régions et sous-lieux.

L'ordre de déclaration est significatif : les chemins statiques (``/locations/regions``,
``/locations/scene/...``) doivent précéder ``/locations/{name}``, sinon le paramètre de
chemin capture les segments statiques.
"""
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Request, status
from api.routers.auth import get_current_user
from api.schemas.context import (
    LocationListResponse,
    LocationResponse,
    RegionListResponse,
    SubLocationListResponse,
)
from api.dependencies import get_context_builder, get_request_id
from api.exceptions import NotFoundException
from core.context.context_builder import ContextBuilder

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get(
    "/locations",
    response_model=LocationListResponse,
    status_code=status.HTTP_200_OK
)
async def list_locations(
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)],
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> LocationListResponse:
    """Liste tous les lieux disponibles avec pagination optionnelle.
    
    Args:
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        page: Numéro de page (1-indexed). Si None, retourne tous les lieux.
        page_size: Taille de page. Si None, utilise la valeur par défaut (50).
        
    Returns:
        Liste des lieux (paginée si page fourni, sinon tous).
    """
    from api.utils.pagination import get_pagination_params, paginate_list
    
    locations = context_builder.locations
    location_responses = [
        LocationResponse(name=loc.get("Nom", "Unknown"), data=loc)
        for loc in locations
    ]
    total = len(location_responses)
    
    # Appliquer la pagination si demandée
    pagination_params = get_pagination_params(page=page, page_size=page_size)
    paginated_responses = paginate_list(location_responses, pagination_params)
    
    # Construire la réponse avec métadonnées de pagination
    if pagination_params.is_enabled:
        total_pages = (total + pagination_params.page_size - 1) // pagination_params.page_size
        return LocationListResponse(
            locations=paginated_responses,
            total=total,
            page=pagination_params.page,
            page_size=pagination_params.page_size,
            total_pages=total_pages
        )
    else:
        # Rétrocompatibilité : pas de pagination
        return LocationListResponse(
            locations=paginated_responses,
            total=total,
            page=None,
            page_size=None,
            total_pages=None
        )


@router.get(
    "/locations/regions",
    response_model=RegionListResponse,
    status_code=status.HTTP_200_OK
)
async def list_regions(
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> RegionListResponse:
    """Liste les noms du catalogue lieux (régions typées ou toutes les fiches).
    
    Args:
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        Liste des noms (champ ``regions`` pour compatibilité client).
    """
    regions = context_builder.get_regions()
    
    return RegionListResponse(
        regions=regions,
        total=len(regions)
    )


@router.get(
    "/locations/scene/regions",
    response_model=RegionListResponse,
    status_code=status.HTTP_200_OK,
)
async def list_scene_regions(
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> RegionListResponse:
    """Liste les noms pour le sélecteur « région » (Scène principale).

    Diffère du catalogue « Lieux » : priorité aux régions typées ou aux parents avec ``Contient``.
    """
    regions = context_builder.get_scene_region_names()
    return RegionListResponse(regions=regions, total=len(regions))


@router.get(
    "/locations/scene/sub-locations/{name}",
    response_model=SubLocationListResponse,
    status_code=status.HTTP_200_OK,
)
async def get_scene_sub_locations(
    name: str,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> SubLocationListResponse:
    """Sous-lieux pour la scène : noms du champ ``Contient`` du lieu parent."""
    if context_builder.get_location_details_by_name(name) is None:
        raise NotFoundException(
            resource_type="Lieu",
            resource_id=name,
            request_id=request_id,
        )
    sub_locations = context_builder.get_scene_sub_location_names(name)
    return SubLocationListResponse(
        sub_locations=sub_locations,
        total=len(sub_locations),
        region_name=name,
    )


@router.get(
    "/locations/regions/{name}/sub-locations",
    response_model=SubLocationListResponse,
    status_code=status.HTTP_200_OK
)
async def get_sub_locations(
    name: str,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> SubLocationListResponse:
    """Récupère les noms du champ ``Contient`` pour une fiche lieu.
    
    Args:
        name: Nom de la fiche lieu.
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        Liste des sous-lieux de la région.
        
    Raises:
        NotFoundException: Si la région n'existe pas.
    """
    region_details = context_builder.get_location_details_by_name(name)
    if region_details is None:
        raise NotFoundException(
            resource_type="Lieu",
            resource_id=name,
            request_id=request_id
        )

    sub_locations = context_builder.get_sub_locations(name)
    
    return SubLocationListResponse(
        sub_locations=sub_locations,
        total=len(sub_locations),
        region_name=name
    )


@router.get(
    "/locations/{name}",
    response_model=LocationResponse,
    status_code=status.HTTP_200_OK
)
async def get_location(
    name: str,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> LocationResponse:
    """Récupère un lieu par son nom.
    
    Args:
        name: Nom du lieu.
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        Le lieu demandé.
        
    Raises:
        NotFoundException: Si le lieu n'existe pas.
    """
    location_data = context_builder.get_location_details_by_name(name)
    if location_data is None:
        raise NotFoundException(
            resource_type="Lieu",
            resource_id=name,
            request_id=request_id
        )
    
    return LocationResponse(name=name, data=location_data)

"""Router contexte GDD — entités simples (personnages, objets, espèces, communautés, sources narratives).
"""
from typing import Annotated, Any, Optional
from fastapi import APIRouter, Depends, Request, status
from api.routers.auth import get_current_user
from api.schemas.context import (
    CharacterListResponse,
    CharacterResponse,
    ItemListResponse,
    ItemResponse,
    SpeciesListResponse,
    SpeciesResponse,
    CommunityListResponse,
    CommunityResponse,
    NarrativeContextListResponse,
    NarrativeContextResponse,
)
from api.dependencies import get_context_builder, get_request_id
from api.exceptions import NotFoundException
from core.context.context_builder import ContextBuilder

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get(
    "/characters",
    response_model=CharacterListResponse,
    status_code=status.HTTP_200_OK
)
async def list_characters(
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)],
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> CharacterListResponse:
    """Liste tous les personnages disponibles avec pagination optionnelle.
    
    Args:
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        page: Numéro de page (1-indexed). Si None, retourne tous les personnages.
        page_size: Taille de page. Si None, utilise la valeur par défaut (50).
        
    Returns:
        Liste des personnages (paginée si page fourni, sinon tous).
    """
    from api.utils.pagination import get_pagination_params, paginate_list
    
    characters = context_builder.characters
    character_responses = [
        CharacterResponse(name=char.get("Nom", "Unknown"), data=char)
        for char in characters
    ]
    total = len(character_responses)
    
    # Appliquer la pagination si demandée
    pagination_params = get_pagination_params(page=page, page_size=page_size)
    paginated_responses = paginate_list(character_responses, pagination_params)
    
    # Construire la réponse avec métadonnées de pagination
    if pagination_params.is_enabled:
        total_pages = (total + pagination_params.page_size - 1) // pagination_params.page_size
        return CharacterListResponse(
            characters=paginated_responses,
            total=total,
            page=pagination_params.page,
            page_size=pagination_params.page_size,
            total_pages=total_pages
        )
    else:
        # Rétrocompatibilité : pas de pagination
        return CharacterListResponse(
            characters=paginated_responses,
            total=total,
            page=None,
            page_size=None,
            total_pages=None
        )


@router.get(
    "/characters/{name}",
    response_model=CharacterResponse,
    status_code=status.HTTP_200_OK
)
async def get_character(
    name: str,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> CharacterResponse:
    """Récupère un personnage par son nom.
    
    Args:
        name: Nom du personnage.
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        Le personnage demandé.
        
    Raises:
        NotFoundException: Si le personnage n'existe pas.
    """
    character_data = context_builder.get_character_details_by_name(name)
    if character_data is None:
        raise NotFoundException(
            resource_type="Personnage",
            resource_id=name,
            request_id=request_id
        )
    
    return CharacterResponse(name=name, data=character_data)


@router.get(
    "/narrative-contexts",
    response_model=NarrativeContextListResponse,
    status_code=status.HTTP_200_OK,
)
async def list_narrative_contexts(
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> NarrativeContextListResponse:
    """Liste les sources narratives spécialisées disponibles pour le contexte GDD."""
    sources: list[tuple[str, str, list[dict[str, Any]]]] = [
        ("narrative_structures", "Structure narrative", getattr(context_builder, "narrative_structures", [])),
        ("chapters", "Chapitres", getattr(context_builder, "chapters", [])),
        ("scenes", "Scènes", getattr(context_builder, "scenes", [])),
    ]
    items: list[NarrativeContextResponse] = []
    for category, label, records in sources:
        for record in records:
            if not isinstance(record, dict):
                continue
            name = record.get("Nom") or record.get("Titre") or record.get("ID")
            if not name:
                continue
            items.append(
                NarrativeContextResponse(
                    name=str(name),
                    category=category,
                    label=label,
                    data=record,
                )
            )
    return NarrativeContextListResponse(items=items, total=len(items))


@router.get(
    "/items",
    response_model=ItemListResponse,
    status_code=status.HTTP_200_OK
)
async def list_items(
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)],
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> ItemListResponse:
    """Liste tous les objets disponibles avec pagination optionnelle.
    
    Args:
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        page: Numéro de page (1-indexed). Si None, retourne tous les objets.
        page_size: Taille de page. Si None, utilise la valeur par défaut (50).
        
    Returns:
        Liste des objets (paginée si page fourni, sinon tous).
    """
    from api.utils.pagination import get_pagination_params, paginate_list
    
    items = context_builder.items
    item_responses = [
        ItemResponse(name=item.get("Nom", "Unknown"), data=item)
        for item in items
    ]
    total = len(item_responses)
    
    # Appliquer la pagination si demandée
    pagination_params = get_pagination_params(page=page, page_size=page_size)
    paginated_responses = paginate_list(item_responses, pagination_params)
    
    # Construire la réponse avec métadonnées de pagination
    if pagination_params.is_enabled:
        total_pages = (total + pagination_params.page_size - 1) // pagination_params.page_size
        return ItemListResponse(
            items=paginated_responses,
            total=total,
            page=pagination_params.page,
            page_size=pagination_params.page_size,
            total_pages=total_pages
        )
    else:
        # Rétrocompatibilité : pas de pagination
        return ItemListResponse(
            items=paginated_responses,
            total=total,
            page=None,
            page_size=None,
            total_pages=None
        )


@router.get(
    "/items/{name}",
    response_model=ItemResponse,
    status_code=status.HTTP_200_OK
)
async def get_item(
    name: str,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> ItemResponse:
    """Récupère un objet par son nom.

    Args:
        name: Nom de l'objet.
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.

    Returns:
        L'objet demandé.

    Raises:
        NotFoundException: Si l'objet n'existe pas.
    """
    item_data = context_builder.get_item_details_by_name(name)
    if item_data is None:
        raise NotFoundException(
            resource_type="Objet",
            resource_id=name,
            request_id=request_id
        )
    return ItemResponse(name=name, data=item_data)


@router.get(
    "/species",
    response_model=SpeciesListResponse,
    status_code=status.HTTP_200_OK
)
async def list_species(
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> SpeciesListResponse:
    """Liste toutes les espèces disponibles.
    
    Args:
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        Liste des espèces.
    """
    species = context_builder.species
    species_responses = [
        SpeciesResponse(name=spec.get("Nom", "Unknown"), data=spec)
        for spec in species
    ]
    
    return SpeciesListResponse(
        species=species_responses,
        total=len(species_responses)
    )


@router.get(
    "/species/{name}",
    response_model=SpeciesResponse,
    status_code=status.HTTP_200_OK
)
async def get_species(
    name: str,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> SpeciesResponse:
    """Récupère une espèce par son nom.
    
    Args:
        name: Nom de l'espèce.
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        L'espèce demandée.
        
    Raises:
        NotFoundException: Si l'espèce n'existe pas.
    """
    species_data = context_builder.get_species_details_by_name(name)
    if species_data is None:
        raise NotFoundException(
            resource_type="Espèce",
            resource_id=name,
            request_id=request_id
        )

    return SpeciesResponse(name=name, data=species_data)


@router.get(
    "/communities",
    response_model=CommunityListResponse,
    status_code=status.HTTP_200_OK
)
async def list_communities(
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)],
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> CommunityListResponse:
    """Liste toutes les communautés disponibles avec pagination optionnelle.
    
    Args:
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        page: Numéro de page (1-indexed). Si None, retourne toutes les communautés.
        page_size: Taille de page. Si None, utilise la valeur par défaut (50).
        
    Returns:
        Liste des communautés (paginée si page fourni, sinon toutes).
    """
    from api.utils.pagination import get_pagination_params, paginate_list
    
    communities = context_builder.communities
    community_responses = [
        CommunityResponse(name=comm.get("Nom", "Unknown"), data=comm)
        for comm in communities
    ]
    total = len(community_responses)
    
    # Appliquer la pagination si demandée
    pagination_params = get_pagination_params(page=page, page_size=page_size)
    paginated_responses = paginate_list(community_responses, pagination_params)
    
    # Construire la réponse avec métadonnées de pagination
    if pagination_params.is_enabled:
        total_pages = (total + pagination_params.page_size - 1) // pagination_params.page_size
        return CommunityListResponse(
            communities=paginated_responses,
            total=total,
            page=pagination_params.page,
            page_size=pagination_params.page_size,
            total_pages=total_pages
        )
    else:
        # Rétrocompatibilité : pas de pagination
        return CommunityListResponse(
            communities=paginated_responses,
            total=total,
            page=None,
            page_size=None,
            total_pages=None
        )


@router.get(
    "/communities/{name}",
    response_model=CommunityResponse,
    status_code=status.HTTP_200_OK
)
async def get_community(
    name: str,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> CommunityResponse:
    """Récupère une communauté par son nom.
    
    Args:
        name: Nom de la communauté.
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        La communauté demandée.
        
    Raises:
        NotFoundException: Si la communauté n'existe pas.
    """
    community_data = context_builder.get_community_details_by_name(name)
    if community_data is None:
        raise NotFoundException(
            resource_type="Communauté",
            resource_id=name,
            request_id=request_id
        )
    
    return CommunityResponse(name=name, data=community_data)

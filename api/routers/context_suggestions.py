"""Router contexte GDD — éléments liés et suggestions de sélection.
"""
import logging
from typing import Annotated
from fastapi import APIRouter, Depends, Request, status
from api.routers.auth import get_current_user
from api.schemas.context import (
    LinkedElementsRequest,
    LinkedElementsResponse,
    SuggestionsRequest,
    SuggestionsResponse,
    SuggestionItem,
)
from api.dependencies import (
    get_context_builder,
    get_linked_selector_service,
    get_request_id,
    get_context_rule_service,
)
from api.exceptions import InternalServerException
from core.context.context_builder import ContextBuilder
from services.linked_selector import LinkedSelectorService
from services.context_rule_service import ContextRuleService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post(
    "/linked-elements",
    response_model=LinkedElementsResponse,
    status_code=status.HTTP_200_OK
)
async def get_linked_elements(
    request_data: LinkedElementsRequest,
    request: Request,
    linked_selector: Annotated[LinkedSelectorService, Depends(get_linked_selector_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> LinkedElementsResponse:
    """Suggère des éléments liés à partir de personnages et lieux.
    
    Args:
        request_data: Données de la requête (personnages, lieux).
        request: La requête HTTP.
        linked_selector: LinkedSelectorService injecté.
        request_id: ID de la requête.
        
    Returns:
        Liste des éléments liés à sélectionner.
    """
    try:
        elements_to_select = linked_selector.get_elements_to_select(
            character_a=request_data.character_a,
            character_b=request_data.character_b,
            scene_region=request_data.scene_region,
            sub_location=request_data.sub_location
        )
        
        # Convertir le set en liste pour la réponse JSON
        linked_elements_list = list(elements_to_select)
        
        return LinkedElementsResponse(
            linked_elements=linked_elements_list,
            total=len(linked_elements_list)
        )
        
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération des éléments liés (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération des éléments liés",
            details={"error": str(e)},
            request_id=request_id
        )


def _resolve_already_selected(already_selected: "ContextSelection | None") -> dict[str, set[str]]:
    """Construit un mapping type → noms sélectionnés à partir de la sélection courante.

    Args:
        already_selected: Sélection actuelle (peut être None).

    Returns:
        Dictionnaire {type_singulier: {noms}} pour filtrage des doublons.
    """
    if already_selected is None:
        return {}
    return {
        "character": set((already_selected.characters_full or []) + (already_selected.characters_excerpt or [])),
        "location": set((already_selected.locations_full or []) + (already_selected.locations_excerpt or [])),
        "item": set((already_selected.items_full or []) + (already_selected.items_excerpt or [])),
        "species": set((already_selected.species_full or []) + (already_selected.species_excerpt or [])),
        "community": set((already_selected.communities_full or []) + (already_selected.communities_excerpt or [])),
    }


_LINKED_CATEGORY_TO_SUGGESTION_TYPE: dict[str, str] = {
    "characters": "character",
    "locations": "location",
    "items": "item",
    "species": "species",
    "communities": "community",
}


def _filter_suggestions_by_types(
    linked: dict[str, set[str]],
    already_selected: dict[str, set[str]],
    trigger_name: str,
    allowed_types: "set[str] | None",
) -> list[SuggestionItem]:
    """Filtre les entités GDD liées pour construire la liste de suggestions.

    Args:
        linked: Entités liées groupées par catégorie GDD (ex. "characters": {"Bob"}).
        already_selected: Mapping type singulier → noms déjà sélectionnés.
        trigger_name: Nom de l'entité trigger (exclue des suggestions).
        allowed_types: Types autorisés par les règles, ou None si aucune règle active
            (→ tous les types sont autorisés).

    Returns:
        Liste des SuggestionItem filtrés.
    """
    suggestions: list[SuggestionItem] = []
    for category, names in linked.items():
        suggestion_type = _LINKED_CATEGORY_TO_SUGGESTION_TYPE.get(category)
        if not suggestion_type:
            continue
        if allowed_types is not None and suggestion_type not in allowed_types:
            continue
        selected_in_category = already_selected.get(suggestion_type, set())
        for name in names:
            if name == trigger_name:
                continue
            if name in selected_in_category:
                continue
            suggestions.append(SuggestionItem(type=suggestion_type, name=name))
    return suggestions


@router.post(
    "/suggestions",
    response_model=SuggestionsResponse,
    status_code=status.HTTP_200_OK,
)
async def get_context_suggestions(
    request_data: SuggestionsRequest,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> SuggestionsResponse:
    """Retourne des suggestions d'entités GDD liées à l'entité trigger.

    Déclenché lors de la sélection d'une entité — retourne les entités GDD
    liées (via les relations du GDD) non encore sélectionnées.

    Si des règles de contexte actives existent et matchent le trigger, seules
    les entités dont le type est dans les ``suggested_types`` des règles matchées
    sont retournées. En l'absence de règles actives, toutes les entités liées
    sont proposées (comportement Story 3.3).

    Args:
        request_data: Type + nom de l'entité trigger + sélections existantes.
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        rule_service: ContextRuleService injecté.
        request_id: ID de la requête.

    Returns:
        Liste de suggestions groupables par type, sans doublons.
    """
    try:
        # Obtenir les éléments liés selon le type de trigger
        linked: dict[str, set[str]] = {}
        if request_data.trigger_type == "character":
            linked = context_builder.get_linked_elements(character_name=request_data.trigger_name)
        elif request_data.trigger_type == "location":
            linked = context_builder.get_linked_elements(location_names=[request_data.trigger_name])
        # item / species / community non supportés comme triggers → liste vide

        already_selected = _resolve_already_selected(request_data.already_selected)

        # Évaluation des règles : détermine les types autorisés
        already_selected_sets: dict[str, set[str]] = already_selected
        allowed_types = rule_service.evaluate_rules(
            trigger_type=request_data.trigger_type,
            trigger_name=request_data.trigger_name,
            already_selected=already_selected_sets,
            dialogue_type=request_data.dialogue_type,
        )
        # None → pas de règles actives → comportement par défaut (tous les types)

        suggestions: list[SuggestionItem] = _filter_suggestions_by_types(
            linked=linked,
            already_selected=already_selected,
            trigger_name=request_data.trigger_name,
            allowed_types=allowed_types,
        )

        return SuggestionsResponse(suggestions=suggestions)

    except Exception as e:
        logger.exception(
            f"Erreur lors de la récupération des suggestions (request_id: {request_id})"
        )
        raise InternalServerException(
            message="Erreur lors de la récupération des suggestions",
            details={"error": str(e)},
            request_id=request_id,
        )

"""Router pour le contexte GDD."""
import hashlib
import logging
from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Request, status

from api.routers.auth import get_current_user
from api.schemas.context import (
    CharacterListResponse,
    CharacterResponse,
    LocationListResponse,
    LocationResponse,
    ItemListResponse,
    ItemResponse,
    SpeciesListResponse,
    SpeciesResponse,
    CommunityListResponse,
    CommunityResponse,
    NarrativeContextListResponse,
    NarrativeContextResponse,
    RegionListResponse,
    SubLocationListResponse,
    LinkedElementsRequest,
    LinkedElementsResponse,
    BuildContextRequest,
    BuildContextResponse,
    SuggestionsRequest,
    SuggestionsResponse,
    SuggestionItem,
)
from api.schemas.context_rules import (
    ContextRule,
    CreateRuleRequest,
    UpdateRuleRequest,
    RulesListResponse,
    DialogueTypeRulesResponse,
)
from api.schemas.dialogue import (
    EstimateTokensRequest,
    EstimateTokensResponse,
    OptimizeContextRequest,
    OptimizeContextResponse,
    PrecomputedEntityTokensRequest,
    PrecomputedEntityTokensResponse,
    PrecomputedEntityTokenRow,
)
from api.schemas.gdd_context_stale import (
    GddContentFingerprintRequest,
    GddContentFingerprintResponse,
    GddEntityHistoryResponse,
    GddEntityHistoryEventPublic,
)
from constants import Defaults
from models.prompt_structure import PromptMetadata, PromptSection, PromptStructure
from services.context_token_budget import compute_context_selection_token_metrics
from services.context_truncator import (
    cap_context_text_to_budget,
    count_tokens_in_prompt_context_element,
)
from services.context_selection_optimizer import optimize_context_selection
from api.dependencies import (
    get_context_builder,
    get_linked_selector_service,
    get_request_id,
    get_dialogue_generation_service,
    get_prompt_engine,
    get_skill_catalog_service,
    get_trait_catalog_service,
    get_context_rule_service,
)
from api.exceptions import NotFoundException, InternalServerException, ValidationException
from core.context.context_builder import ContextBuilder
from services.linked_selector import LinkedSelectorService
from services.dialogue_generation_service import DialogueGenerationService
from services.context_rule_service import ContextRuleService
from core.prompt.prompt_engine import PromptEngine, PromptInput
from utils.xml_utils import extract_text_from_element
from services.skill_catalog_service import SkillCatalogService
from services.trait_catalog_service import TraitCatalogService
from services.prompt_catalog_loader import load_prompt_catalogs
from services.scene_dramatis import resolve_scene_dramatis

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


def _resolve_dramatis(request_data: EstimateTokensRequest) -> "SceneDramatis":
    """Résout PJ/PNJ selon les règles Alteir."""
    return resolve_scene_dramatis(
        player_character_id=request_data.player_character_id,
        npc_speaker_id=request_data.npc_speaker_id,
        context_selections=request_data.context_selections.model_dump(),
    )


def _resolve_npc_speaker_id(
    request_data: EstimateTokensRequest,
) -> str:
    """Détermine le speaker PNJ avec la même convention que le flux prompt."""
    return _resolve_dramatis(request_data).npc_speaker_id


def _build_prompt_input_without_structured_context(
    request_data: EstimateTokensRequest,
    *,
    context_text: Optional[str],
    skills_list: List[str],
    attributes_list: List[str],
    traits_list: List[str],
) -> PromptInput:
    """Construit l'input prompt pour les sections non-GDD uniquement."""
    dramatis = _resolve_dramatis(request_data)
    return PromptInput(
        user_instructions=request_data.user_instructions,
        npc_speaker_id=dramatis.npc_speaker_id,
        player_character_id=dramatis.player_character_id,
        context_summary=context_text,
        structured_context=None,
        scene_location=None,
        max_choices=request_data.max_choices,
        choices_mode=request_data.choices_mode,
        narrative_tags=request_data.narrative_tags,
        author_profile=request_data.author_profile,
        game_rules=request_data.game_rules,
        vocabulary_config=request_data.vocabulary_config,
        include_narrative_guides=request_data.include_narrative_guides,
        skills_list=skills_list,
        attributes_list=attributes_list,
        traits_list=traits_list,
        in_game_flags=None,
        max_context_tokens=request_data.max_context_tokens,
        llm_model_identifier=request_data.llm_model_identifier,
    )


def _build_lightweight_prompt_structure(
    request_data: EstimateTokensRequest,
    prompt_engine: PromptEngine,
    skill_service: SkillCatalogService,
    trait_service: TraitCatalogService,
    structured_context: PromptStructure,
    context_text: str,
) -> tuple[int, PromptStructure]:
    """Construit une structure prompt affichable sans créer le raw XML complet."""
    skills_list, attributes_list, traits_list = load_prompt_catalogs(skill_service, trait_service)
    prompt_input = _build_prompt_input_without_structured_context(
        request_data,
        context_text=context_text,
        skills_list=skills_list,
        attributes_list=attributes_list,
        traits_list=traits_list,
    )
    builder = getattr(prompt_engine, "_prompt_builder", None)
    if builder is None:
        raise RuntimeError("PromptBuilder non initialisé dans PromptEngine")

    section_specs = (
        (builder._build_contract_section, "other", "SECTION 0. CONTRAT GLOBAL"),
        (builder._build_technical_section, "other", "SECTION 1. INSTRUCTIONS TECHNIQUES (NORMATIVES)"),
        (builder._build_narrative_guides_section, "other", "SECTION 2B. GUIDES NARRATIFS"),
        (builder._build_vocabulary_section, "other", "SECTION 2C. VOCABULAIRE ALTEIR"),
        (builder._build_scene_instructions_section, "instruction", "SECTION 3. INSTRUCTIONS DE SCÈNE (PRIORITÉ EFFECTIVE)"),
    )

    sections: List[PromptSection] = []
    prompt_overhead_tokens = 0
    model_id = request_data.llm_model_identifier or "gpt-5.6-terra"
    for build_section, section_type, title in section_specs:
        elem = build_section(prompt_input)
        if elem is None:
            continue
        content = extract_text_from_element(elem)
        if not content:
            continue
        token_count = prompt_engine._count_tokens(content, model_id)
        prompt_overhead_tokens += token_count
        sections.append(
            PromptSection(
                type=section_type,
                title=title,
                content=content,
                tokenCount=token_count,
            )
        )

    for section in structured_context.sections:
        sections.append(section)

    total_tokens = prompt_overhead_tokens + int(structured_context.metadata.totalTokens or 0)
    generated_at = getattr(structured_context.metadata, "generatedAt", None)
    if not isinstance(generated_at, str):
        generated_at = datetime.now().isoformat()
    organization_mode = getattr(structured_context.metadata, "organizationMode", None)
    if not isinstance(organization_mode, str):
        organization_mode = request_data.organization_mode or "narrative"

    prompt_structure = PromptStructure(
        sections=sections,
        metadata=PromptMetadata(
            totalTokens=total_tokens,
            generatedAt=generated_at,
            organizationMode=organization_mode,
        ),
    )
    return prompt_overhead_tokens, prompt_structure


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


@router.post(
    "/build",
    response_model=BuildContextResponse,
    status_code=status.HTTP_200_OK
)
async def build_context(
    request_data: BuildContextRequest,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> BuildContextResponse:
    """Construit un contexte personnalisé à partir de sélections GDD.
    
    Args:
        request_data: Données de la requête (sélections, instructions).
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        Le contexte construit.
    """
    try:
        # Convertir ContextSelection en dict pour le service (avec préfixes underscore)
        context_selections_dict = request_data.context_selections.to_service_dict()
        
        # Construire le contexte JSON (obligatoire, plus de fallback)
        structured_context = context_builder.build_context_json(
            selected_elements=context_selections_dict,
            scene_instruction=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
            max_tokens=request_data.max_tokens,
            include_dialogue_type=request_data.include_dialogue_type,
            element_modes=context_selections_dict.get("_element_modes")
        )
        context_text = context_builder.serialize_context_to_text(structured_context)
        capped = cap_context_text_to_budget(context_text, request_data.max_tokens)
        token_count = context_builder._count_tokens(capped)

        return BuildContextResponse(
            context=capped,
            token_count=token_count,
        )
        
    except Exception as e:
        logger.exception(f"Erreur lors de la construction du contexte (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la construction du contexte",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/precomputed-entity-tokens",
    response_model=PrecomputedEntityTokensResponse,
    status_code=status.HTTP_200_OK,
)
async def precomputed_entity_tokens(
    request_data: PrecomputedEntityTokensRequest,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    prompt_engine: Annotated[PromptEngine, Depends(get_prompt_engine)],
    skill_service: Annotated[SkillCatalogService, Depends(get_skill_catalog_service)],
    trait_service: Annotated[TraitCatalogService, Depends(get_trait_catalog_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> PrecomputedEntityTokensResponse:
    """Tokens précompilés par fiche (cache disque) — ajout/retrait incrémental UI.

    Ne reconstruit pas la sélection entière : lecture O(1) par fiche en cache hit.
    """
    from services.gdd_context_precompile import lookup_precomputed_entity_tokens

    try:
        raw_entities = [e.model_dump() for e in request_data.entities]
        rows = lookup_precomputed_entity_tokens(
            context_builder,
            raw_entities,
            organization_mode=request_data.organization_mode or "narrative",
            field_configs=request_data.field_configs,
        )
        parsed = [PrecomputedEntityTokenRow.model_validate(r) for r in rows]
        total = sum(r.token_count for r in parsed)
        overhead_tokens = 0
        overhead_sections: Optional[List[Dict[str, Any]]] = None
        if request_data.include_prompt_overhead:
            from api.schemas.dialogue import ContextSelection, EstimateTokensRequest

            empty_selection = ContextSelection()
            overhead_request = EstimateTokensRequest(
                user_instructions=request_data.user_instructions or " ",
                context_selections=empty_selection,
                organization_mode=request_data.organization_mode or "narrative",
                include_narrative_guides=request_data.include_narrative_guides,
                system_prompt_override=request_data.system_prompt_override,
                game_rules=request_data.game_rules,
                author_profile=request_data.author_profile,
                vocabulary_config=request_data.vocabulary_config,
                field_configs=request_data.field_configs,
            )
            empty_context = PromptStructure(
                sections=[
                    PromptSection(
                        type="context",
                        title="CONTEXTE GÉNÉRAL DE LA SCÈNE",
                        content="",
                        tokenCount=0,
                        categories=[],
                    )
                ],
                metadata=PromptMetadata(
                    totalTokens=0,
                    generatedAt=datetime.now().isoformat(),
                    organizationMode=request_data.organization_mode or "narrative",
                ),
            )
            overhead_tokens, overhead_structure = _build_lightweight_prompt_structure(
                overhead_request,
                prompt_engine,
                skill_service,
                trait_service,
                structured_context=empty_context,
                context_text="",
            )
            overhead_sections = [
                section.model_dump()
                for section in overhead_structure.sections
                if section.type != "context"
            ]
        return PrecomputedEntityTokensResponse(
            entities=parsed,
            selection_tokens_sum=total,
            prompt_overhead_tokens=overhead_tokens,
            prompt_overhead_sections=overhead_sections,
        )
    except Exception as e:
        logger.exception(
            "Erreur lookup tokens précompilés (request_id: %s)",
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la lecture des tokens précompilés",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/estimate-tokens",
    response_model=EstimateTokensResponse,
    status_code=status.HTTP_200_OK
)
async def estimate_context_tokens(
    request_data: EstimateTokensRequest,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    prompt_engine: Annotated[PromptEngine, Depends(get_prompt_engine)],
    skill_service: Annotated[SkillCatalogService, Depends(get_skill_catalog_service)],
    trait_service: Annotated[TraitCatalogService, Depends(get_trait_catalog_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> EstimateTokensResponse:
    """Estime les tokens de la sélection GDD (panneau budget contexte, FR20).

    Chemin léger : un seul build contexte + breakdown dérivé de la structure déjà construite.
    Ne construit pas le prompt LLM complet (réservé à ``/dialogues/estimate-tokens``).

    Args:
        request_data: Données de la requête (sélections, instructions).
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.

    Returns:
        Estimation du nombre de tokens. Voir ``EstimateTokensResponse`` pour la distinction
        ``context_tokens`` (tronqué au budget requête) vs ``selection_tokens`` (mesure pleine).
    """
    try:
        service_dict = request_data.context_selections.to_service_dict()
        structured_context = context_builder.build_context_json(
            selected_elements=service_dict,
            scene_instruction=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
            max_tokens=Defaults.MAX_CONTEXT_TOKENS,
            include_dialogue_type=True,
            element_modes=service_dict.get("_element_modes"),
        )
        metrics = compute_context_selection_token_metrics(
            context_builder,
            full_selection=request_data.context_selections,
            user_instructions=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
            measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
            user_budget_max_tokens=request_data.max_context_tokens,
            prebuilt_structure=structured_context,
        )

        context_only_hash = hashlib.sha256(
            f"{metrics.context_tokens}:{metrics.selection_tokens}".encode("utf-8")
        ).hexdigest()
        context_text = cap_context_text_to_budget(
            metrics.serialized_text or context_builder.serialize_context_to_text(structured_context),
            request_data.max_context_tokens,
        )
        prompt_overhead_tokens, structured_prompt = _build_lightweight_prompt_structure(
            request_data,
            prompt_engine,
            skill_service,
            trait_service,
            structured_context=structured_context,
            context_text=context_text,
        )
        prompt_token_count = metrics.context_tokens + prompt_overhead_tokens

        return EstimateTokensResponse(
            context_tokens=metrics.context_tokens,
            selection_tokens=metrics.selection_tokens,
            context_token_breakdown=metrics.breakdown,
            context_breakdown_note=metrics.breakdown_note,
            token_count=prompt_token_count,
            total_estimated_tokens=prompt_token_count,
            raw_prompt="",
            prompt_hash=context_only_hash,
            structured_prompt=structured_prompt.model_dump(),
        )
        
    except ValidationException:
        # Re-raise les ValidationException telles quelles
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de l'estimation de tokens (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de l'estimation de tokens",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/optimize",
    response_model=OptimizeContextResponse,
    status_code=status.HTTP_200_OK,
)
async def optimize_context(
    request_data: OptimizeContextRequest,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> OptimizeContextResponse:
    """Propose une sélection GDD réduite pour respecter le budget tokens (FR21).

    Mesure via le même pipeline que ``/estimate-tokens`` (``selection_tokens``).

    Args:
        request_data: Sélection + paramètres alignés estimate-tokens + règles d'optimisation.
        request: Requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de corrélation.

    Returns:
        Sélection proposée, métriques et avertissements éventuels.
    """
    try:
        return optimize_context_selection(
            context_builder,
            initial_selection=request_data.context_selections,
            user_instructions=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
            budget_tokens=request_data.max_context_tokens,
            rules=request_data.optimization_rules,
        )
    except Exception as e:
        logger.exception(
            "Erreur lors de l'optimisation de contexte (request_id: %s)", request_id
        )
        raise InternalServerException(
            message="Erreur lors de l'optimisation de contexte",
            details={"error": str(e)},
            request_id=request_id,
        ) from e


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


# ---------------------------------------------------------------------------
# Règles de sélection de contexte — CRUD (Story 3.4)
# ---------------------------------------------------------------------------


@router.get(
    "/rules",
    response_model=RulesListResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
)
async def list_context_rules(
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> RulesListResponse:
    """Liste toutes les règles de sélection de contexte.

    Args:
        request: La requête HTTP.
        rule_service: ContextRuleService injecté.
        request_id: ID de la requête.

    Returns:
        Liste des règles triées par priorité.
    """
    rules = rule_service.list_rules()
    return RulesListResponse(rules=rules, total=len(rules))


@router.post(
    "/rules",
    response_model=ContextRule,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_context_rule(
    request_data: CreateRuleRequest,
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> ContextRule:
    """Crée une nouvelle règle de sélection de contexte.

    Args:
        request_data: Corps de la requête (nom, conditions, types suggérés).
        request: La requête HTTP.
        rule_service: ContextRuleService injecté.
        request_id: ID de la requête.

    Returns:
        La règle créée avec son identifiant généré.
    """
    try:
        return rule_service.create_rule(request_data)
    except Exception as e:
        logger.exception(f"Erreur lors de la création d'une règle (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la création de la règle",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.put(
    "/rules/{rule_id}",
    response_model=ContextRule,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
)
async def update_context_rule(
    rule_id: str,
    request_data: UpdateRuleRequest,
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> ContextRule:
    """Met à jour une règle de sélection de contexte.

    Args:
        rule_id: Identifiant de la règle à modifier.
        request_data: Champs à modifier (tous optionnels).
        request: La requête HTTP.
        rule_service: ContextRuleService injecté.
        request_id: ID de la requête.

    Returns:
        La règle mise à jour.

    Raises:
        NotFoundException: Si la règle n'existe pas.
    """
    updated = rule_service.update_rule(rule_id, request_data)
    if updated is None:
        raise NotFoundException(
            resource_type="Règle de contexte",
            resource_id=rule_id,
            request_id=request_id,
        )
    return updated


@router.delete(
    "/rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_context_rule(
    rule_id: str,
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> None:
    """Supprime une règle de sélection de contexte.

    Args:
        rule_id: Identifiant de la règle à supprimer.
        request: La requête HTTP.
        rule_service: ContextRuleService injecté.
        request_id: ID de la requête.

    Raises:
        NotFoundException: Si la règle n'existe pas.
    """
    deleted = rule_service.delete_rule(rule_id)
    if not deleted:
        raise NotFoundException(
            resource_type="Règle de contexte",
            resource_id=rule_id,
            request_id=request_id,
        )


@router.get(
    "/rules/by-dialogue-type/{dialogue_type}",
    response_model=DialogueTypeRulesResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
)
async def get_context_rules_by_dialogue_type(
    dialogue_type: str,
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> DialogueTypeRulesResponse:
    """Retourne les règles spécifiques d'un type de dialogue avec fallback global."""
    source, rules = rule_service.get_rules_for_dialogue_type(dialogue_type)
    return DialogueTypeRulesResponse(
        dialogue_type=dialogue_type,
        source=source,
        rules=rules,
    )


@router.put(
    "/rules/by-dialogue-type/{dialogue_type}",
    response_model=DialogueTypeRulesResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
)
async def put_context_rules_by_dialogue_type(
    dialogue_type: str,
    request_data: list[CreateRuleRequest],
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> DialogueTypeRulesResponse:
    """Remplace l'ensemble des règles d'un type de dialogue donné."""
    normalized_type = dialogue_type.strip().lower()

    # Supprimer les anciennes règles spécifiques au type.
    current_rules = rule_service.list_rules()
    for rule in [r for r in current_rules if r.dialogue_type == normalized_type]:
        rule_service.delete_rule(rule.id)

    # Créer le nouvel ensemble de règles spécifiques.
    for rule in request_data:
        rule_service.create_rule(
            CreateRuleRequest(
                name=rule.name,
                enabled=rule.enabled,
                priority=rule.priority,
                condition_operator=rule.condition_operator,
                conditions=rule.conditions,
                suggested_types=rule.suggested_types,
                dialogue_type=normalized_type,
            )
        )

    source, rules = rule_service.get_rules_for_dialogue_type(normalized_type)
    return DialogueTypeRulesResponse(
        dialogue_type=normalized_type,
        source=source,
        rules=rules,
    )


@router.post(
    "/gdd-content-fingerprint",
    response_model=GddContentFingerprintResponse,
    status_code=status.HTTP_200_OK,
)
async def post_gdd_content_fingerprint(
    request_data: GddContentFingerprintRequest,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> GddContentFingerprintResponse:
    """Calcule l'empreinte du contenu GDD pour une sélection (Story 3.9, détection stale)."""
    from services.gdd_context_fingerprint import compute_gdd_content_fingerprint

    try:
        fp = compute_gdd_content_fingerprint(
            context_builder,
            request_data.context_selections,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
        )
    except Exception as exc:
        logger.warning(
            "post_gdd_content_fingerprint échoué (request_id=%s): %s",
            request_id,
            exc,
        )
        raise ValidationException(
            message="Impossible de calculer l'empreinte GDD pour cette sélection.",
            request_id=request_id,
        ) from exc
    return GddContentFingerprintResponse(fingerprint=fp)


@router.get(
    "/gdd-entity-history",
    response_model=GddEntityHistoryResponse,
    status_code=status.HTTP_200_OK,
)
async def get_gdd_entity_history(
    category: str,
    name: str,
    request_id: Annotated[str, Depends(get_request_id)],
    include_snapshots: bool = False,
) -> GddEntityHistoryResponse:
    """Timeline locale des modifications d'une entité GDD (alimentée par sync Notion)."""
    from core.context.context_builder import PROJECT_ROOT_DIR
    from services.gdd_category_entity_lookup import live_gdd_entity_exists
    from services.gdd_entity_history import diff_snapshots_json, load_entity_history

    cat = (category or "").strip()
    nom = (name or "").strip()
    if not cat or not nom:
        raise ValidationException(
            message="Paramètres category et name requis.",
            request_id=request_id,
        )

    raw = load_entity_history(PROJECT_ROOT_DIR, cat, nom)
    if not raw and not live_gdd_entity_exists(PROJECT_ROOT_DIR, cat, nom):
        raise NotFoundException(
            resource_type="Entité GDD",
            resource_id=f"{cat}/{nom}",
            request_id=request_id,
        )

    events_pub: List[GddEntityHistoryEventPublic] = []
    for i, e in enumerate(raw):
        if not isinstance(e, dict):
            continue
        snap: Optional[Dict[str, Any]] = None
        diff_prev: Optional[str] = None
        if include_snapshots:
            s = e.get("snapshot")
            if isinstance(s, dict):
                snap = s
            if i > 0 and isinstance(raw[i - 1], dict):
                ps = raw[i - 1].get("snapshot")
                if isinstance(ps, dict) and isinstance(snap, dict):
                    diff_prev = diff_snapshots_json(ps, snap)
        events_pub.append(
            GddEntityHistoryEventPublic(
                at=str(e.get("at", "")),
                source=str(e.get("source", "")),
                summary=str(e.get("summary", "")),
                snapshot=snap,
                diff_from_previous=diff_prev,
            )
        )

    diff_hint: Optional[str] = None
    prev_snap: Optional[Dict[str, Any]] = None
    cur_snap: Optional[Dict[str, Any]] = None
    if len(raw) >= 2:
        a = raw[-2]
        b = raw[-1]
        if isinstance(a, dict) and isinstance(b, dict):
            sa = a.get("snapshot")
            sb = b.get("snapshot")
            if isinstance(sa, dict) and isinstance(sb, dict):
                prev_snap = sa
                cur_snap = sb
                diff_hint = diff_snapshots_json(sa, sb)

    return GddEntityHistoryResponse(
        category=cat,
        name=nom,
        events=events_pub,
        diff_hint=diff_hint,
        previous_snapshot=prev_snap,
        current_snapshot=cur_snap,
    )


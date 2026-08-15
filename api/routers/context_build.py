"""Router contexte GDD — construction du contexte et comptage de tokens.
"""
import asyncio
import hashlib
import logging
from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Request, status
from api.routers.auth import get_current_user
from api.schemas.context import BuildContextRequest, BuildContextResponse
from api.schemas.dialogue import (
    EstimateTokensRequest,
    EstimateTokensResponse,
    OptimizeContextRequest,
    OptimizeContextResponse,
    PrecomputedEntityTokensRequest,
    PrecomputedEntityTokensResponse,
    PrecomputedEntityTokenRow,
)
from constants import Defaults
from models.prompt_structure import PromptMetadata, PromptSection, PromptStructure
from services.context_token_budget import compute_context_selection_token_metrics
from services.context_truncator import cap_context_text_to_budget
from services.context_selection_optimizer import optimize_context_selection
from api.dependencies import (
    get_context_builder,
    get_request_id,
    get_prompt_engine,
    get_skill_catalog_service,
    get_trait_catalog_service,
)
from api.exceptions import InternalServerException, ValidationException
from core.context.context_builder import ContextBuilder
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
    def _run() -> BuildContextResponse:
        """Corps synchrone déporté sur un thread (ContextBuilder est bloquant)."""
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

    try:
        return await asyncio.to_thread(_run)
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
    def _run() -> EstimateTokensResponse:
        """Corps synchrone déporté sur un thread (build contexte + breakdown, tout bloquant)."""
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

    try:
        return await asyncio.to_thread(_run)
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
    def _run() -> OptimizeContextResponse:
        """Corps synchrone déporté sur un thread (passe par ContextBuilder, bloquant)."""
        return optimize_context_selection(
            context_builder,
            initial_selection=request_data.context_selections,
            user_instructions=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
            budget_tokens=request_data.max_context_tokens,
            rules=request_data.optimization_rules,
        )

    try:
        return await asyncio.to_thread(_run)
    except Exception as e:
        logger.exception(
            "Erreur lors de l'optimisation de contexte (request_id: %s)", request_id
        )
        raise InternalServerException(
            message="Erreur lors de l'optimisation de contexte",
            details={"error": str(e)},
            request_id=request_id,
        ) from e

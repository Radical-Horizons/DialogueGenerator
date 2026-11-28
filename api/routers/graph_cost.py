"""Router API — estimation de coût LLM pour le graphe (cache + helpers partagés)."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import Annotated, Iterable, Optional, Union

from cachetools import TTLCache
from fastapi import APIRouter, Depends, status

from api.dependencies import (
    get_config_service,
    get_context_builder,
    get_graph_prompt_context_factory,
    get_llm_pricing_service,
    get_llm_usage_service,
    get_request_id,
    get_token_estimation_service,
)
from api.routers.graph_router_helpers import resolve_and_enrich_graph_context
from services.graph_choice_slots import count_parent_open_slots
from services.graph_prompt_context import (
    GraphPromptContextFactory,
    MemoizedPromptContextFactory,
)
from api.exceptions import InternalServerException
from api.schemas.graph import (
    EstimateCostPerNodeBreakdown,
    EstimateCostRequest,
    EstimateCostResponse,
)
from core.context.context_builder import ContextBuilder
from services.configuration_service import ConfigurationService
from services.llm_pricing_service import LLMPricingService
from services.token_estimation_service import TokenEstimationService
from constants import PlayableCharacters
from services.scene_dramatis import resolve_scene_dramatis

logger = logging.getLogger(__name__)

# Taux de conversion USD → EUR (à mettre à jour périodiquement, voir llm_pricing.json note).
_USD_TO_EUR_RATE: float = 0.92

# Provider alternatif de comparaison pour l'AC #3 (Mistral: -X% vs OpenAI).
_ALTERNATIVE_MODEL: dict[str, str] = {
    "openai": "mistral-small-latest",
    "mistral": "gpt-4o",
}


def fingerprint_for_selections_safe(
    context_builder: ContextBuilder,
    selections: dict,
) -> Optional[str]:
    """Empreinte des fiches GDD sélectionnées ; None si vide ou erreur.

    Prend la sélection brute du front : c'est elle que le nœud garde en snapshot et que le
    contrôle de péremption reprend, pas le contexte enrichi pour la génération.
    """
    if not selections:
        return None
    try:
        from services.gdd_context_fingerprint import compute_gdd_content_fingerprint

        return compute_gdd_content_fingerprint(context_builder, selections)
    except Exception as exc:
        logger.warning("Empreinte contexte GDD omise: %s", exc)
        return None


def _build_representative_prompt_for_estimate(
    parent_node_content: dict,
    user_instructions: str,
    context_selections: dict,
    *,
    parent_node_id: Optional[str] = None,
    dialogue_nodes: Optional[list] = None,
    player_choice_label: str = PlayableCharacters.DEFAULT_PLAYER,
    prompt_context_factory: Optional[GraphPromptContextFactory] = None,
    context_builder: Optional[ContextBuilder] = None,
    npc_speaker_id: Optional[str] = None,
    narrative_tags: Optional[list[str]] = None,
    author_profile: Optional[str] = None,
    model_id: Optional[str] = None,
    max_choices: Optional[int] = None,
) -> str:
    """Construit un prompt représentatif pour l'estimation (sans appel LLM).

    Avec ``prompt_context_factory``, c'est le prompt réellement envoyé par
    ``generate-node`` : fiches GDD, catalogues et historique. Sans elle, repli sur
    l'historique précédé des seuls noms sélectionnés (sous-estimation).
    """
    from services.dialogue_path_context import (
        ancestor_path_node_ids,
        build_enriched_generation_prompt,
        format_dialogue_reference,
    )

    prompt_body = build_enriched_generation_prompt(
        nodes=dialogue_nodes if parent_node_id else None,
        parent_node_id=parent_node_id or "",
        parent_speaker=str(parent_node_content.get("speaker") or "PNJ"),
        parent_line=str(parent_node_content.get("line") or ""),
        user_instructions=user_instructions or "",
        player_choice_label=player_choice_label,
    )
    if parent_node_id:
        prompt_body = (
            format_dialogue_reference(
                dialogue_nodes,
                ancestor_path_node_ids(dialogue_nodes, parent_node_id),
                player_choice_label=player_choice_label,
            )
            + prompt_body
        )
    if prompt_context_factory is not None:
        dramatis, enriched = resolve_and_enrich_graph_context(
            context_selections or {},
            player_character_id=player_choice_label,
            npc_speaker_id=npc_speaker_id,
            context_builder=context_builder,
        )
        prompt_context = prompt_context_factory.build(
            enriched,
            npc_speaker_id=dramatis.npc_speaker_id,
            player_character_id=dramatis.player_character_id,
            scene_instruction=user_instructions or "",
            narrative_tags=narrative_tags,
            author_profile=author_profile,
            llm_model_identifier=model_id,
        )
        system_prompt = prompt_context_factory.default_system_prompt()
        return f"{system_prompt}\n\n{prompt_context.render(prompt_body, max_choices)}"

    context_blob = json.dumps(context_selections, ensure_ascii=False) if context_selections else ""
    return f"{context_blob}\n\n{prompt_body}" if context_blob else prompt_body


def _resolve_model_and_provider(
    llm_model_identifier: Optional[str],
    config_service: ConfigurationService,
) -> tuple[str, str]:
    """Retourne (model_id, provider) pour l'estimation (défaut si besoin)."""
    if llm_model_identifier and llm_model_identifier.strip():
        model_id = llm_model_identifier.strip()
    else:
        models = config_service.get_available_llm_models()
        if models:
            model_id = (
                models[0].get("api_identifier")
                or models[0].get("model_identifier")
                or "gpt-4o"
            )
        else:
            model_id = "gpt-4o"
    provider = "mistral" if "mistral" in model_id.lower() else "openai"
    return (model_id, provider)


def _batch_count_from_request(request_data: EstimateCostRequest) -> int:
    """Nombre de nœuds à estimer (1 si single, les emplacements vides si en lot)."""
    if not request_data.generate_all_choices:
        return 1
    return max(1, count_parent_open_slots(request_data.parent_node_content))


def estimate_tokens_per_node(
    request_data: EstimateCostRequest,
    model_id: str,
    *,
    token_service: TokenEstimationService,
    prompt_context_factory: Union[GraphPromptContextFactory, MemoizedPromptContextFactory],
    context_builder: ContextBuilder,
) -> tuple[int, int]:
    """Tokens (prompt, réponse) d'un nœud de cette requête, sans appel LLM (bloquant).

    Estimation commune à ``estimate-cost`` (montrée à l'auteur) et au contrôle de budget.
    """
    dramatis = resolve_scene_dramatis(
        player_character_id=request_data.player_character_id,
        npc_speaker_id=request_data.npc_speaker_id,
        context_selections=request_data.context_selections,
    )
    prompt = _build_representative_prompt_for_estimate(
        request_data.parent_node_content,
        request_data.user_instructions,
        request_data.context_selections,
        parent_node_id=request_data.parent_node_id,
        dialogue_nodes=request_data.dialogue_nodes,
        player_choice_label=dramatis.player_character_id,
        prompt_context_factory=prompt_context_factory,
        context_builder=context_builder,
        npc_speaker_id=dramatis.npc_speaker_id,
        narrative_tags=request_data.narrative_tags,
        author_profile=request_data.author_profile,
        model_id=model_id,
        max_choices=request_data.max_choices,
    )
    return token_service.estimate_tokens(prompt, model_id)


def estimate_lot_tokens(
    requests: Iterable[EstimateCostRequest],
    model_id: str,
    *,
    token_service: TokenEstimationService,
    prompt_context_factory: GraphPromptContextFactory,
    context_builder: ContextBuilder,
) -> tuple[int, int, int]:
    """Total (prompt, réponse, emplacements) d'un lot de choix, une requête par parent.

    Chaque emplacement vide est un appel LLM qui renvoie le prompt complet (bloquant).
    """
    factory = MemoizedPromptContextFactory(prompt_context_factory)
    prompt_total = completion_total = slot_total = 0
    for request_data in requests:
        slots = count_parent_open_slots(request_data.parent_node_content)
        if not slots:
            continue
        prompt_tokens, completion_tokens = estimate_tokens_per_node(
            request_data,
            model_id,
            token_service=token_service,
            prompt_context_factory=factory,
            context_builder=context_builder,
        )
        prompt_total += prompt_tokens * slots
        completion_total += completion_tokens * slots
        slot_total += slots
    return prompt_total, completion_total, slot_total


# Cache estimation coût par hash (contexte + instructions + model_id), TTL 60s (AC #1 <1s).
_estimate_cost_cache: TTLCache[str, dict] = TTLCache(maxsize=200, ttl=60)


def _estimate_cost_cache_key(request_payload: str, model_id: str, batch_count: int) -> str:
    """Clé de cache pour estimate-cost : la requête, pas le prompt (coûteux à construire)."""
    blob = f"{request_payload}|{model_id}|{batch_count}"
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


router = APIRouter()


@router.post(
    "/estimate-cost",
    response_model=EstimateCostResponse,
    status_code=status.HTTP_200_OK,
)
async def estimate_cost(
    request_data: EstimateCostRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    token_service: Annotated[TokenEstimationService, Depends(get_token_estimation_service)],
    pricing_service: Annotated[LLMPricingService, Depends(get_llm_pricing_service)],
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    prompt_context_factory: Annotated[
        GraphPromptContextFactory, Depends(get_graph_prompt_context_factory)
    ],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> EstimateCostResponse:
    """Estime le coût LLM avant génération (pas d'appel LLM).

    Construit le prompt que ``generate-node`` enverrait (contexte GDD, catalogues,
    historique), estime les tokens et calcule le coût via TokenEstimationService +
    LLMPricingService.
    """
    try:
        model_id, provider = _resolve_model_and_provider(
            request_data.llm_model_identifier,
            config_service,
        )
        batch_count = _batch_count_from_request(request_data)
        cache_key = _estimate_cost_cache_key(
            request_data.model_dump_json(), model_id, batch_count
        )
        cached = _estimate_cost_cache.get(cache_key)
        if cached is not None:
            return EstimateCostResponse(**cached)
        prompt_tokens_per_node, completion_tokens_per_node = await asyncio.to_thread(
            estimate_tokens_per_node,
            request_data,
            model_id,
            token_service=token_service,
            prompt_context_factory=prompt_context_factory,
            context_builder=context_builder,
        )
        # Un nœud = un appel LLM : le prompt complet est renvoyé à chaque fois.
        prompt_tokens = prompt_tokens_per_node * batch_count
        total_completion_tokens = completion_tokens_per_node * batch_count
        cost_usd = pricing_service.calculate_cost(
            model_id, prompt_tokens, total_completion_tokens
        )
        estimated_cost_eur = round(cost_usd * _USD_TO_EUR_RATE, 6)
        per_node_breakdown = None
        if batch_count > 1:
            node_cost_eur = round(
                pricing_service.calculate_cost(
                    model_id, prompt_tokens_per_node, completion_tokens_per_node
                )
                * _USD_TO_EUR_RATE,
                6,
            )
            per_node_breakdown = [
                EstimateCostPerNodeBreakdown(
                    choice_index=i,
                    prompt_tokens=prompt_tokens_per_node,
                    completion_tokens=completion_tokens_per_node,
                    estimated_cost_eur=node_cost_eur,
                )
                for i in range(batch_count)
            ]

        # AC #3 : comparaison avec le provider alternatif.
        alt_model = _ALTERNATIVE_MODEL.get(provider)
        alternative_provider: Optional[str] = None
        alternative_model_id: Optional[str] = None
        alternative_cost_eur: Optional[float] = None
        cost_difference_pct: Optional[float] = None
        if alt_model:
            alt_cost_usd = pricing_service.calculate_cost(
                alt_model, prompt_tokens, total_completion_tokens
            )
            if alt_cost_usd > 0 or estimated_cost_eur == 0:
                alt_cost_eur = round(alt_cost_usd * _USD_TO_EUR_RATE, 6)
                alternative_provider = "mistral" if "mistral" in alt_model.lower() else "openai"
                alternative_model_id = alt_model
                alternative_cost_eur = alt_cost_eur
                if estimated_cost_eur > 0:
                    cost_difference_pct = round(
                        (alt_cost_eur - estimated_cost_eur) / estimated_cost_eur * 100, 1
                    )
                else:
                    cost_difference_pct = 0.0

        response = EstimateCostResponse(
            estimated_cost_eur=estimated_cost_eur,
            prompt_tokens=prompt_tokens,
            completion_tokens=total_completion_tokens,
            model_id=model_id,
            provider=provider,
            batch_count=batch_count if batch_count > 1 else None,
            per_node_breakdown=per_node_breakdown,
            alternative_provider=alternative_provider,
            alternative_model_id=alternative_model_id,
            alternative_cost_eur=alternative_cost_eur,
            cost_difference_pct=cost_difference_pct,
        )
        _estimate_cost_cache[cache_key] = response.model_dump()
        return response
    except Exception as e:
        logger.exception(
            "Erreur lors de l'estimation de coût (request_id: %s): %s",
            request_id,
            e,
        )
        raise InternalServerException(
            message="Erreur lors de l'estimation de coût",
            details={"error": str(e)},
            request_id=request_id,
        )

"""Router API — estimation de coût LLM pour le graphe (cache + helpers partagés)."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Annotated, Optional

from cachetools import TTLCache
from fastapi import APIRouter, Depends, status

from api.dependencies import (
    get_config_service,
    get_context_builder,
    get_llm_pricing_service,
    get_llm_usage_service,
    get_request_id,
    get_token_estimation_service,
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
from services.llm_usage_service import LLMUsageService
from services.token_estimation_service import TokenEstimationService

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
    """Empreinte du contexte GDD pour les sélections ; None si vide ou erreur."""
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
) -> str:
    """Construit un prompt représentatif pour l'estimation (sans appel LLM)."""
    parent_speaker = parent_node_content.get("speaker", "PNJ")
    parent_line = parent_node_content.get("line", "")
    context_blob = json.dumps(context_selections, ensure_ascii=False) if context_selections else ""
    return (
        f"{context_blob}\n\n"
        f"Contexte précédent:\n{parent_speaker}: {parent_line}\n\n"
        f"Instructions pour la suite:\n{user_instructions or ''}"
    )


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
    """Nombre de nœuds à estimer (1 si single, N si generate_all_choices).

    Chaque choix avec test non vide génère 4 nœuds (issues de test) ; les autres 1.
    """
    if not request_data.generate_all_choices:
        return 1
    choices = request_data.parent_node_content.get("choices", [])
    count = 0
    for c in choices:
        target = c.get("targetNode")
        if not target or target == "END":
            tv = c.get("test")
            has_test = tv is not None and (not isinstance(tv, str) or str(tv).strip())
            count += 4 if has_test else 1
    return max(1, count)


# Cache estimation coût par hash (contexte + instructions + model_id), TTL 60s (AC #1 <1s).
_estimate_cost_cache: TTLCache[str, dict] = TTLCache(maxsize=200, ttl=60)


def _estimate_cost_cache_key(representative_prompt: str, model_id: str, batch_count: int) -> str:
    """Clé de cache pour estimate-cost."""
    blob = f"{representative_prompt}|{model_id}|{batch_count}"
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def try_compute_context_relevance(
    usage_service: LLMUsageService,
    request_id: str,
) -> None:
    """Calcule la pertinence contexte sans impacter la réponse HTTP (Story 3.6)."""
    try:
        usage_service.compute_and_persist_context_relevance(request_id)
    except Exception as exc:
        logger.warning(
            "Pertinence contexte non enregistrée (request_id=%s): %s",
            request_id,
            exc,
        )


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
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> EstimateCostResponse:
    """Estime le coût LLM avant génération (pas d'appel LLM).

    Construit un prompt représentatif, estime les tokens et calcule le coût
    via TokenEstimationService + LLMPricingService.
    """
    try:
        model_id, provider = _resolve_model_and_provider(
            request_data.llm_model_identifier,
            config_service,
        )
        representative_prompt = _build_representative_prompt_for_estimate(
            request_data.parent_node_content,
            request_data.user_instructions,
            request_data.context_selections,
        )
        batch_count = _batch_count_from_request(request_data)
        cache_key = _estimate_cost_cache_key(representative_prompt, model_id, batch_count)
        cached = _estimate_cost_cache.get(cache_key)
        if cached is not None:
            return EstimateCostResponse(**cached)
        prompt_tokens, completion_tokens_per_node = token_service.estimate_tokens(
            representative_prompt, model_id
        )
        total_completion_tokens = completion_tokens_per_node * batch_count
        cost_usd = pricing_service.calculate_cost(
            model_id, prompt_tokens, total_completion_tokens
        )
        estimated_cost_eur = round(cost_usd * _USD_TO_EUR_RATE, 6)
        per_node_breakdown = None
        if batch_count > 1:
            first_node_cost_eur = round(
                pricing_service.calculate_cost(model_id, prompt_tokens, completion_tokens_per_node)
                * _USD_TO_EUR_RATE,
                6,
            )
            next_node_cost_eur = round(
                pricing_service.calculate_cost(model_id, 0, completion_tokens_per_node)
                * _USD_TO_EUR_RATE,
                6,
            )
            per_node_breakdown = [
                EstimateCostPerNodeBreakdown(
                    choice_index=0,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens_per_node,
                    estimated_cost_eur=first_node_cost_eur,
                )
            ]
            for i in range(1, batch_count):
                per_node_breakdown.append(
                    EstimateCostPerNodeBreakdown(
                        choice_index=i,
                        prompt_tokens=0,
                        completion_tokens=completion_tokens_per_node,
                        estimated_cost_eur=next_node_cost_eur,
                    )
                )

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

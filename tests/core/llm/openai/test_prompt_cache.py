"""Cache de prompt OpenAI : point de coupure, lecture des tokens en cache, tarification."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from constants import ModelNames
from core.llm.openai.prompt_cache import SCENE_INSTRUCTIONS_TAG, build_user_message
from core.llm.openai.usage_tracker import OpenAIUsageTracker
from services.llm_pricing_service import LLMPricingService

PROMPT = "<prompt><context>Fiches stables</context>\n<scene_instructions>Consigne du nœud</scene_instructions></prompt>"


def test_prompt_is_cut_before_scene_instructions_for_gpt_5_6() -> None:
    """Sur GPT-5.6, la partie stable porte le point de coupure, la consigne vient après."""
    message = build_user_message(PROMPT, ModelNames.GPT_5_6_SOL)

    stable, scene = message["content"]
    assert stable["prompt_cache_breakpoint"] == {"mode": "explicit"}
    assert stable["text"].endswith("</context>\n")
    assert scene["text"].startswith(SCENE_INSTRUCTIONS_TAG)
    assert "prompt_cache_breakpoint" not in scene
    assert stable["text"] + scene["text"] == PROMPT


@pytest.mark.parametrize(
    ("prompt", "model"),
    [
        (PROMPT, "gpt-4o"),
        ("<prompt>Sans consigne de scène</prompt>", ModelNames.GPT_5_6_SOL),
        (f"{SCENE_INSTRUCTIONS_TAG}Rien avant</scene_instructions>", ModelNames.GPT_5_6_LUNA),
    ],
)
def test_prompt_stays_a_single_text_when_no_cut_applies(prompt: str, model: str) -> None:
    """Modèle sans point de coupure explicite, ou rien de stable avant la consigne : texte inchangé."""
    assert build_user_message(prompt, model) == {"role": "user", "content": prompt}


def test_usage_tracker_reads_cache_reads_and_writes() -> None:
    """Les tokens relus et écrits en cache sont extraits de ``input_tokens_details``."""
    response = SimpleNamespace(
        usage=SimpleNamespace(
            input_tokens=36740,
            output_tokens=64,
            input_tokens_details=SimpleNamespace(cached_tokens=36295, cache_write_tokens=442),
        )
    )

    metrics = OpenAIUsageTracker.extract_usage_metrics(response)

    assert metrics["prompt_tokens"] == 36740
    assert metrics["cached_tokens"] == 36295
    assert metrics["cache_write_tokens"] == 442


def test_usage_tracker_defaults_cache_fields_to_zero() -> None:
    """Sans détail d'entrée (ancien modèle), les champs de cache valent 0."""
    response = SimpleNamespace(usage=SimpleNamespace(input_tokens=100, output_tokens=10))

    metrics = OpenAIUsageTracker.extract_usage_metrics(response)

    assert metrics["cached_tokens"] == 0 and metrics["cache_write_tokens"] == 0


@pytest.fixture
def pricing_service(tmp_path: Path) -> LLMPricingService:
    """Grille d'un modèle avec cache (lecture 0,1 ×, écriture 1,25 ×) et d'un modèle sans."""
    config = tmp_path / "llm_pricing.json"
    config.write_text(
        json.dumps(
            {
                "models": {
                    "avec-cache": {
                        "input_price_per_1M": 4.0,
                        "output_price_per_1M": 20.0,
                        "cached_input_rate": 0.1,
                        "cache_write_rate": 1.25,
                    },
                    "sans-cache": {"input_price_per_1M": 4.0, "output_price_per_1M": 20.0},
                }
            }
        ),
        encoding="utf-8",
    )
    return LLMPricingService(config_path=config)


def test_cost_bills_cache_reads_writes_and_ordinary_input_separately(
    pricing_service: LLMPricingService,
) -> None:
    """Coût = entrée ordinaire + lecture (0,1 ×) + écriture (1,25 ×) + sortie."""
    cost = pricing_service.calculate_cost(
        "avec-cache", 12000, 1000, cached_tokens=4000, cache_write_tokens=7000
    )

    expected = (1000 * 4.0 + 4000 * 0.4 + 7000 * 5.0 + 1000 * 20.0) / 1_000_000
    assert cost == pytest.approx(expected)


def test_model_without_cache_rates_bills_everything_at_input_price(
    pricing_service: LLMPricingService,
) -> None:
    """Sans coefficient de cache, toute l'entrée est au prix d'entrée."""
    assert pricing_service.calculate_cost(
        "sans-cache", 12000, 0, cached_tokens=4000, cache_write_tokens=7000
    ) == pytest.approx(12000 * 4.0 / 1_000_000)


def test_admin_price_update_keeps_cache_rates(pricing_service: LLMPricingService) -> None:
    """Modifier le prix d'un modèle depuis l'admin garde ses coefficients de cache."""
    pricing_service.upsert_model_pricing("avec-cache", 5.0, 30.0)

    pricing = pricing_service.get_model_pricing("avec-cache")
    assert pricing is not None
    assert pricing["cached_input_rate"] == 0.1
    assert pricing["cache_write_rate"] == 1.25

"""Cohérence du catalogue de modèles : ce qui doit tenir à chaque changement de famille.

Garde-fous de la migration GPT-5.6 → GPT-6.x (2026-11-19) et des mises à jour suivantes :
un modèle retiré resté dans la chaîne de repli (``labs-mistral-small-creative``, retiré le
2026-04-30) faisait échouer le secours en silence.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from constants import Defaults, ModelNames
from core.llm.openai.parameter_builder import OpenAIParameterBuilder

ROOT = Path(__file__).resolve().parents[3]
LLM_CONFIG = json.loads((ROOT / "config" / "llm_config.json").read_text(encoding="utf-8"))
PRICING = json.loads((ROOT / "config" / "llm_pricing.json").read_text(encoding="utf-8"))["models"]
CONFIGURED = [m["api_identifier"] for m in LLM_CONFIG["available_models"]]


def test_roles_point_to_configured_models() -> None:
    """Chaque rôle et chaque défaut désigne un modèle proposé par la config."""
    for model in (ModelNames.STANDARD, ModelNames.MID, ModelNames.ECONOMY):
        assert model in CONFIGURED
    assert LLM_CONFIG["default_model"] in CONFIGURED
    assert Defaults.MODEL_ID in CONFIGURED


def test_fallback_chain_only_names_configured_models() -> None:
    """La chaîne de repli ne contient que des modèles configurés, défaut en tête."""
    chain = LLM_CONFIG["fallback_chain"]
    assert chain[0] == LLM_CONFIG["default_model"]
    assert all(model in CONFIGURED for model in chain)


def test_every_configured_model_has_a_price() -> None:
    """Sans prix, l'estimation et le budget comptent 0 pour ce modèle."""
    assert [m for m in CONFIGURED if m not in PRICING] == []


def test_no_legacy_slug_is_still_offered() -> None:
    """Un ancien identifiant migré ne reste pas proposé dans le sélecteur."""
    assert [m for m in CONFIGURED if m in ModelNames.LEGACY_MODEL_ID_MAP] == []


@pytest.mark.parametrize(
    ("legacy", "current"),
    [
        ("gpt-5.6-terra", ModelNames.STANDARD),
        ("gpt-5.6-sol", ModelNames.STANDARD),
        ("gpt-6.2-astra", ModelNames.STANDARD),
        ("gpt-5.6-luna", ModelNames.ECONOMY),
        ("labs-mistral-small-creative", ModelNames.STANDARD),
    ],
)
def test_saved_legacy_choices_migrate_by_role(legacy: str, current: str) -> None:
    """Un réglage enregistré sur l'ancienne famille retombe sur le successeur de même rôle."""
    assert ModelNames.normalize_model_id(legacy) == current


@pytest.mark.parametrize("model", ModelNames.CURRENT_OPENAI_MODELS)
def test_current_models_never_receive_temperature(model: str) -> None:
    """temperature / top_p sont omis pour toute la famille courante, même avec effort « none »."""
    params = OpenAIParameterBuilder.build_responses_params(
        model_name=model,
        messages=[{"role": "user", "content": "x"}],
        response_model=None,
        max_tokens=100,
        temperature=0.7,
        reasoning_effort="none",
        reasoning_summary=None,
        instructions="sys",
        top_p=0.9,
    )
    assert "temperature" not in params
    assert "top_p" not in params


def test_effort_none_becomes_low_where_refused() -> None:
    """GPT-6.2 refuse « none » : ramené à « low » ; Luna l'accepte et le garde."""
    for model in ModelNames.MODELS_WITHOUT_REASONING_NONE:
        config = OpenAIParameterBuilder.build_reasoning_config(model, "none", None)
        assert config["effort"] == "low"
    luna = OpenAIParameterBuilder.build_reasoning_config(ModelNames.GPT_6_LUNA, "none", None)
    assert luna["effort"] == "none"

"""Ce que le juge voit et ce qu'il réfléchit font partie de son identité.

Le 2026-09-21, deux défauts de la même famille : un réglage déterminant inscrit
*dans* la mesure mais absent de sa *clé*, donc sans effet. Côté candidats,
`reasoning_effort` n'était jamais envoyé ; côté juge, l'effort reste au défaut du
fournisseur et n'apparaît nulle part. Ces tests verrouillent le second.
"""

from __future__ import annotations

import pytest

import core.prompt.benchmark_judge as judge_module
from core.llm.openrouter_client import OpenRouterClient
from core.prompt.benchmark_judge import (
    BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT,
    JUDGE_REASONING_EFFORT,
    judge_prompt_fingerprint,
)
from factories.llm_factory import LLMClientFactory

_OPENROUTER_MODELS = [
    {
        "api_identifier": "openai/gpt-5.6-luna",
        "client_type": "openrouter",
    }
]
_OPENROUTER_CONFIG = {"openrouter_api_key_env_var": "OPENROUTER_API_KEY"}


def test_the_judge_effort_is_pinned_not_left_to_the_provider() -> None:
    """Le banc déclare l'effort du juge au lieu de subir un défaut.

    Un juge au défaut du fournisseur est un juge dont on ne sait pas ce qu'il a
    mis à réfléchir — et qui peut changer sans que rien ne bouge dans le dépôt.
    """
    assert JUDGE_REASONING_EFFORT in {"none", "low", "medium", "high"}


def test_changing_the_judge_effort_changes_the_judge() -> None:
    """Deux efforts, deux empreintes : leurs notes ne s'agrégeront pas.

    L'empreinte commande le répertoire des verdicts. Sans l'effort dedans, une
    passe relancée à un autre effort retomberait sur les anciens verdicts, que
    `_verdict_is_usable` validerait — la passe sauterait tout et se dirait finie.
    """
    reference = judge_prompt_fingerprint(BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT)
    original = judge_module.JUDGE_REASONING_EFFORT
    try:
        judge_module.JUDGE_REASONING_EFFORT = "none"
        lazy = judge_prompt_fingerprint(BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT)
    finally:
        judge_module.JUDGE_REASONING_EFFORT = original

    assert reference != lazy


def test_the_factory_forwards_an_imposed_effort(monkeypatch: pytest.MonkeyPatch) -> None:
    """L'effort passé à la fabrique atteint le client, et l'emporte sur la config.

    C'est le seul chemin possible : poser l'effort dans `llm_config.json`
    épinglerait aussi Luna **candidat**, dont l'effort doit rester piloté par le run.
    """
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test-not-a-real-key")
    config = {**_OPENROUTER_CONFIG, "reasoning_effort": "low"}

    client = LLMClientFactory.create_client(
        model_id="openai/gpt-5.6-luna",
        config=config,
        available_models=_OPENROUTER_MODELS,
        reasoning_effort="high",
    )

    assert isinstance(client, OpenRouterClient)
    assert client.reasoning_effort == "high"


def test_the_factory_leaves_the_config_alone_when_nothing_is_imposed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sans consigne explicite, la configuration du modèle garde la main.

    La génération ordinaire de l'application ne passe pas d'effort : elle ne doit
    pas hériter du réglage choisi pour mesurer.
    """
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test-not-a-real-key")
    config = {**_OPENROUTER_CONFIG, "reasoning_effort": "low"}

    client = LLMClientFactory.create_client(
        model_id="openai/gpt-5.6-luna",
        config=config,
        available_models=_OPENROUTER_MODELS,
    )

    assert client.reasoning_effort == "low"

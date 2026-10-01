"""Un nom hérité désigne le même modèle : le banc doit le savoir avant de mesurer.

Vécu le 2026-10-01 : `POST /runs/preview` avec `gpt-5.6-luna` répondait « Modèle
hors whitelist de génération Unity (structured output requis) ». Faux — Luna
supporte les sorties structurées ; seul son slug a changé à la bascule OpenRouter.

Le danger n'était pas le message. `LLMClientFactory.create_client` normalise, lui :
un run lancé sur l'ancien nom **appelait** le modèle courant tout en
s'**enregistrant** sous l'ancien. Le répertoire des verdicts, le regroupement du
rapport et la recherche de tarif s'indexent sur le nom enregistré — le run aurait
mesuré un modèle et classé, facturé, diagnostiqué un autre.
"""

from __future__ import annotations

import pytest

from api.schemas.benchmark import BenchmarkAutoJudgeConfig, BenchmarkRunConfig
from api.schemas.benchmark_judging import JudgePassConfig
from api.schemas.benchmark_report import BenchmarkRunPreviewRequest
from constants import ModelNames

LEGACY = "gpt-5.6-luna"
CANONICAL = "openai/gpt-5.6-luna"


def test_the_legacy_map_still_covers_the_bare_slug() -> None:
    """Le test suivant ne vaut que si la table de correspondance dit bien ça."""
    assert ModelNames.normalize_model_id(LEGACY) == CANONICAL


def test_a_run_records_the_model_it_will_actually_call() -> None:
    """C'est l'invariant : le nom enregistré est celui que le client appellera."""
    config = BenchmarkRunConfig(
        suite_id="alteir-smoke", models=[LEGACY], budget_cap_usd=1.0
    )

    assert config.models == [CANONICAL]


def test_the_preview_canonicalizes_like_the_run() -> None:
    """Sinon l'aperçu chiffrerait un modèle et le run en mesurerait un autre."""
    assert BenchmarkRunPreviewRequest(
        suite_id="alteir-smoke", models=[LEGACY]
    ).models == [CANONICAL]


def test_two_spellings_of_one_model_are_a_duplicate() -> None:
    """Normaliser **avant** de compter resserre la détection de doublons.

    Avant, les deux écritures passaient et le modèle était généré deux fois : le
    nombre de générations, donc l'estimation et la dépense, étaient faux.
    """
    with pytest.raises(ValueError):
        BenchmarkRunConfig(
            suite_id="alteir-smoke",
            models=[LEGACY, CANONICAL],
            budget_cap_usd=1.0,
        )


def test_the_judge_is_canonicalized_too() -> None:
    """Son nom commande le répertoire des verdicts : deux écritures, deux dossiers."""
    chained = BenchmarkAutoJudgeConfig(
        grid_id="grille-dialogue-fr", judge_model=LEGACY, budget_cap_usd=1.0
    )
    separate = JudgePassConfig(
        grid_id="grille-dialogue-fr", judge_model=LEGACY, budget_cap_usd=1.0
    )

    assert chained.judge_model == CANONICAL
    assert separate.judge_model == CANONICAL


def test_an_unknown_model_passes_through_untouched() -> None:
    """La normalisation ne doit pas inventer : un slug inconnu reste tel quel.

    Le diagnostic de modèles est là pour dire qu'il est inutilisable, avec un motif
    juste — pas pour être contourné par une réécriture optimiste.
    """
    assert BenchmarkRunConfig(
        suite_id="alteir-smoke", models=["z-ai/glm-5.3"], budget_cap_usd=1.0
    ).models == ["z-ai/glm-5.3"]

"""L'estimation de notation doit **majorer**, sinon elle ne protège rien.

`estimate_max_cost` sert deux usages : chiffrer avant de lancer, et garder la
passe au démarrage. Le second est le piège — quand l'estimation sous-compte, la
garde laisse partir une passe que le plafond coupe à mi-course, et on paie une
notation à moitié faite. C'est exactement le « run à moitié noté » que
l'invariant cherche à empêcher.

Les constantes valaient 2000 tokens d'entrée pour 11 325 réels, et 800 en
sortie de duel pour 3 351. Ce fichier épingle les valeurs mesurées : si un
prompt de juge grossit encore, le test tombe avant la facture.
"""

from __future__ import annotations

from typing import Dict, Optional

import pytest

from services.benchmark_judge_pass_service import (
    DEFAULT_DUEL_COMPLETION_TOKENS_ESTIMATE,
    DEFAULT_JUDGE_COMPLETION_TOKENS_ESTIMATE,
    DEFAULT_JUDGE_PROMPT_TOKENS_ESTIMATE,
)

# Maxima relevés sur le run 20260921T090302-e4e6e842 (25 verdicts, 50 duels),
# juge gpt-5.6-luna, grille grille-dialogue-fr à 17 critères.
MESURE_RUBRIQUE_PROMPT_MAX = 11_325
MESURE_RUBRIQUE_COMPLETION_MAX = 1_380
MESURE_DUEL_PROMPT_MAX = 24_550
MESURE_DUEL_COMPLETION_MAX = 3_351


def test_the_rubric_prompt_estimate_covers_what_was_measured() -> None:
    """Le prompt du juge porte le contexte GDD complet du candidat."""
    assert DEFAULT_JUDGE_PROMPT_TOKENS_ESTIMATE > MESURE_RUBRIQUE_PROMPT_MAX


def test_the_rubric_completion_estimate_covers_what_was_measured() -> None:
    """Une note et un commentaire pour chacun des dix-sept critères."""
    assert DEFAULT_JUDGE_COMPLETION_TOKENS_ESTIMATE > MESURE_RUBRIQUE_COMPLETION_MAX


def test_the_duel_prompt_estimate_covers_two_candidates() -> None:
    """Un duel porte deux textes : le doublement du prompt est structurel."""
    assert DEFAULT_JUDGE_PROMPT_TOKENS_ESTIMATE * 2 > MESURE_DUEL_PROMPT_MAX


def test_the_duel_completion_has_its_own_constant() -> None:
    """Comparer demande plus de raisonnement que noter — ×2,7 mesuré.

    Ce n'est pas un doublement structurel, d'où une constante distincte plutôt
    qu'un multiple de celle de la rubrique.
    """
    assert DEFAULT_DUEL_COMPLETION_TOKENS_ESTIMATE > MESURE_DUEL_COMPLETION_MAX
    assert DEFAULT_DUEL_COMPLETION_TOKENS_ESTIMATE > DEFAULT_JUDGE_COMPLETION_TOKENS_ESTIMATE


class _PricingService:
    """Tarif de Luna, seul juge employé jusqu'ici."""

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        return {"input_price_per_1M": 0.20, "output_price_per_1M": 1.20}

    def calculate_cost(
        self, model_name: str, prompt_tokens: int, completion_tokens: int
    ) -> float:
        return (prompt_tokens * 0.20 + completion_tokens * 1.20) / 1_000_000


@pytest.mark.parametrize(
    ("verdicts", "reel_usd"),
    [
        # Dépense réelle du run, ramenée aux tarifs corrigés (la config
        # surévaluait Luna d'un facteur cinq au moment de la mesure).
        (25, 0.407174 / 5),
    ],
)
def test_the_rubric_estimate_majorates_the_real_spend(
    verdicts: int, reel_usd: float
) -> None:
    """Une borne qui passe sous le réel n'est pas une borne."""
    from services.benchmark_judge_pass_service import BenchmarkJudgePassService

    service = BenchmarkJudgePassService.__new__(BenchmarkJudgePassService)
    service._pricing_service = _PricingService()  # noqa: SLF001 — on n'exerce que le chiffrage

    assert service.estimate_max_cost("gpt-5.6-luna", verdicts) > reel_usd

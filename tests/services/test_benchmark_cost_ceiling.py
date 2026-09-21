"""Un modèle hors budget de production est écarté par défaut, jamais déclaré en panne.

Le benchmark répond à « quel modèle employer pour écrire nos dialogues **en
nombre** ». Un modèle à 0,16 $ la génération n'est pas cette réponse, même s'il
note bien — constaté le 2026-09-21 : `gpt-5.6-sol` coûte 5× Luna et finit 4ᵉ sur 5.

Le piège à éviter est de ranger « trop cher » avec « inutilisable ». Ce sont
deux verdicts distincts : un modèle cher reste parfaitement mesurable, et
toucher à `usable` le sortirait du taux de validité — un arbitrage économique
déguisé en défaut technique.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from api.schemas.benchmark import (
    MAX_COST_PER_GENERATION_USD,
    BenchmarkCase,
    BenchmarkSuite,
)

CHEAP = "gpt-5.6-luna"
EXPENSIVE = "gpt-5.6-sol"
UNPRICED = "modele-sans-tarif"
EXCLUDED = "mistralai/mistral-medium-3-5"

# Tarifs réels du catalogue, en USD par million de tokens.
PRICES: Dict[str, Dict[str, float]] = {
    CHEAP: {"input_price_per_1M": 1.0, "output_price_per_1M": 6.0},
    EXPENSIVE: {"input_price_per_1M": 5.0, "output_price_per_1M": 30.0},
    EXCLUDED: {"input_price_per_1M": 1.5, "output_price_per_1M": 7.5},
}


class _PricingService:
    """Tarification calquée sur `config/llm_pricing.json`."""

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        return PRICES.get(model_name)

    def calculate_cost(
        self, model_name: str, prompt_tokens: int, completion_tokens: int
    ) -> float:
        price = PRICES[model_name]
        return (
            prompt_tokens * price["input_price_per_1M"]
            + completion_tokens * price["output_price_per_1M"]
        ) / 1_000_000


def _suite() -> BenchmarkSuite:
    """Suite d'un cas, aux plafonds réels du semis."""
    case = BenchmarkCase.model_validate(
        {
            "case_id": "voknir-premiere-rencontre",
            "title": "Première rencontre",
            "request": {
                "llm_model_identifier": CHEAP,
                "user_instructions": "Écris le fragment d'ouverture.",
                "context_selections": {"characters_full": ["Uresaïr"]},
                "max_context_tokens": 18000,
                "max_completion_tokens": 6000,
            },
        }
    )
    return BenchmarkSuite.model_validate(
        {"suite_id": "alteir-smoke", "version": 1, "name": "Fumée", "cases": [case.model_dump()]}
    )


def _run_service() -> Any:
    """Moteur de run réduit à ce que le chiffrage utilise."""
    from services.benchmark_run_service import BenchmarkRunService

    service = BenchmarkRunService.__new__(BenchmarkRunService)
    service._pricing_service = _PricingService()  # noqa: SLF001 — chiffrage isolé
    return service


def test_expensive_model_is_over_the_ceiling() -> None:
    """Sol dépasse le seuil : c'est le cas qui motive la règle."""
    unit = _run_service().estimate_cost_per_generation(_suite(), EXPENSIVE)

    assert unit is not None and unit > MAX_COST_PER_GENERATION_USD


def test_cheap_model_stays_under_the_ceiling() -> None:
    """Luna reste employable en nombre — c'est tout l'enjeu du seuil."""
    unit = _run_service().estimate_cost_per_generation(_suite(), CHEAP)

    assert unit is not None and unit < MAX_COST_PER_GENERATION_USD


def test_unknown_price_is_never_read_as_free() -> None:
    """Sans tarif, la réponse est « on ne sait pas », pas « gratuit »."""
    assert _run_service().estimate_cost_per_generation(_suite(), UNPRICED) is None


def _selection(models: List[str]) -> Dict[str, Any]:
    """Applique la sélection par défaut et rend un état lisible par modèle."""
    from api.schemas.benchmark import BenchmarkModelDiagnostic
    from services.benchmark_report_service import BenchmarkReportService

    service = BenchmarkReportService.__new__(BenchmarkReportService)
    service._run_service = _run_service()  # noqa: SLF001 — on n'exerce que le marquage
    diagnostics = [BenchmarkModelDiagnostic(model_id=m, usable=True) for m in models]
    service._apply_default_selection(diagnostics, _suite())  # noqa: SLF001
    return {d.model_id: d for d in diagnostics}


def test_arbitration_never_touches_usable() -> None:
    """Un arbitrage ne doit pas se déguiser en panne technique.

    Marquer `usable=False` sortirait le modèle du dénominateur du taux de
    validité et flatterait tous les autres.
    """
    state = _selection([EXPENSIVE, CHEAP, UNPRICED, EXCLUDED])

    assert all(d.usable for d in state.values())


def test_expensive_model_is_unchecked_with_a_reason() -> None:
    """Décoché, et on dit pourquoi : une exclusion muette se périme en silence."""
    entry = _selection([EXPENSIVE])[EXPENSIVE]

    assert entry.recommended is False
    assert "par génération" in (entry.not_recommended_reason or "")


def test_named_exclusion_carries_its_own_motive() -> None:
    """Un modèle écarté pour ce qu'il écrit, pas pour ce qu'il coûte."""
    entry = _selection([EXCLUDED])[EXCLUDED]

    assert entry.recommended is False
    assert "code" in (entry.not_recommended_reason or "").lower()


def test_cheap_and_unpriced_models_stay_proposed() -> None:
    """Sans motif, on ne décoche pas — surtout pas sur un tarif inconnu."""
    state = _selection([CHEAP, UNPRICED])

    assert state[CHEAP].recommended is True
    assert state[UNPRICED].recommended is True

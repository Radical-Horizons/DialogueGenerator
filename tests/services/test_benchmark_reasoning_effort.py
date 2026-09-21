"""Un banc compare des modèles, pas des réglages.

Au run du 2026-09-21, `reasoning_effort` n'était fixé nulle part : les modèles
OpenAI tournaient à `medium` — leur défaut — et `z-ai/glm-5.3` comme
`moonshotai/kimi-k3` au défaut de leur fournisseur. Résultat, dix fois plus de
tokens facturés chez les seconds, et une conclusion « GLM coûte plus cher que
Terra » qui comparait deux configurations différentes.

L'effort est donc imposé à tous les candidats d'un run, et enregistré dans son
identité : comme `narration_mode`, ce qui change ce qu'on mesure fait partie de
la mesure.
"""

from __future__ import annotations

import pytest

from api.schemas.benchmark import BenchmarkRunConfig, BenchmarkRunIdentity
from tests.services.benchmark_fixtures import MODEL, _case, _service


def _config(**overrides) -> BenchmarkRunConfig:
    """Configuration de run minimale."""
    payload = {
        "suite_id": "alteir-smoke",
        "models": [MODEL],
        "repetitions": 1,
        "budget_cap_usd": 1.0,
    }
    payload.update(overrides)
    return BenchmarkRunConfig(**payload)


def test_the_effort_defaults_to_what_was_measured_until_now() -> None:
    """`medium` est le défaut d'OpenAI — donc ce que le banc mesurait déjà."""
    assert _config().reasoning_effort == "medium"


@pytest.mark.parametrize("effort", ["none", "low", "medium", "high"])
def test_every_generation_carries_the_run_effort(tmp_path, effort: str) -> None:
    """Chaque requête porte l'effort du run, pas le défaut du fournisseur."""
    service = _service(tmp_path, None)
    request = service._build_request(  # noqa: SLF001
        _case(), MODEL, "sans", reasoning_effort=effort
    )

    assert request.reasoning_effort == effort


def test_the_effort_belongs_to_the_run_identity() -> None:
    """Deux runs à efforts différents ne se comparent pas.

    L'identité le porte au même titre que `narration_mode` : sans cela, deux
    mesures inconciliables se liraient comme une série.
    """
    identity = BenchmarkRunIdentity(
        suite_id="alteir-smoke",
        suite_version=1,
        suite_fingerprint="abc",
        models=[MODEL],
        repetitions=1,
        reasoning_effort="high",
        narration_mode="sans",
    )

    assert identity.reasoning_effort == "high"


def test_an_unknown_effort_is_refused() -> None:
    """Un effort fantaisiste passerait en silence au fournisseur."""
    with pytest.raises(ValueError):
        _config(reasoning_effort="turbo")

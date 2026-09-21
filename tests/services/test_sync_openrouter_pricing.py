"""Le script de tarifs ne doit jamais écraser un prix qu'il ne facture pas.

`gpt-5.6-sol` coûte 5/30 chez OpenAI et 2/10 via OpenRouter. Le prix dépend de
la **route**, pas du nom du modèle : synchroniser aveuglément poserait un
plafond budgétaire faux, c'est-à-dire un garde-fou qui ne garde rien.

Le script n'applique donc que les modèles réellement routés par OpenRouter, et
se contente de signaler l'écart pour les autres.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, Tuple

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import sync_openrouter_pricing as sync  # noqa: E402

REMOTE: Dict[str, Tuple[float, float]] = {
    "aion-labs/aion-2.0": (0.8, 1.6),
    "z-ai/glm-5.3": (0.91, 2.86),
    "openai/gpt-5.6-sol": (2.0, 10.0),
}


@pytest.fixture
def bench(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Catalogue et tarifs de projet, isolés dans un dossier temporaire."""
    config = {
        "available_models": [
            {"api_identifier": "aion-labs/aion-2.0", "client_type": "openrouter"},
            {"api_identifier": "z-ai/glm-5.3", "client_type": "openrouter"},
            {"api_identifier": "gpt-5.6-sol", "client_type": "openai"},
        ]
    }
    pricing = {
        "aion-labs/aion-2.0": {
            "input_price_per_1M": 9.9,
            "output_price_per_1M": 9.9,
            "description": "périmé",
        },
        "gpt-5.6-sol": {
            "input_price_per_1M": 5.0,
            "output_price_per_1M": 30.0,
            "description": "route OpenAI directe",
        },
    }
    config_path = tmp_path / "llm_config.json"
    pricing_path = tmp_path / "llm_pricing.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    pricing_path.write_text(json.dumps(pricing), encoding="utf-8")

    monkeypatch.setattr(sync, "CONFIG_PATH", config_path)
    monkeypatch.setattr(sync, "PRICING_PATH", pricing_path)
    monkeypatch.setattr(sync, "fetch_openrouter_prices", lambda: dict(REMOTE))
    return pricing_path


def _run(apply: bool, monkeypatch: pytest.MonkeyPatch) -> None:
    """Exécute le script avec ou sans `--apply`."""
    argv = ["sync_openrouter_pricing.py"] + (["--apply"] if apply else [])
    monkeypatch.setattr(sys, "argv", argv)
    sync.main()


def test_a_direct_route_price_is_never_overwritten(
    bench: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Le cas qui motive tout le script : Sol ne passe pas par OpenRouter."""
    _run(apply=True, monkeypatch=monkeypatch)
    pricing = json.loads(bench.read_text(encoding="utf-8"))

    assert pricing["gpt-5.6-sol"]["input_price_per_1M"] == 5.0
    assert pricing["gpt-5.6-sol"]["output_price_per_1M"] == 30.0


def test_a_routed_model_is_realigned(bench: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Un tarif périmé sur une route OpenRouter se corrige tout seul."""
    _run(apply=True, monkeypatch=monkeypatch)
    pricing = json.loads(bench.read_text(encoding="utf-8"))

    assert pricing["aion-labs/aion-2.0"]["input_price_per_1M"] == 0.8
    assert pricing["aion-labs/aion-2.0"]["output_price_per_1M"] == 1.6


def test_a_missing_model_is_added(bench: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Ajouter un candidat au catalogue ne doit pas demander de saisir son prix."""
    _run(apply=True, monkeypatch=monkeypatch)
    pricing = json.loads(bench.read_text(encoding="utf-8"))

    assert pricing["z-ai/glm-5.3"]["output_price_per_1M"] == 2.86


def test_without_apply_nothing_is_written(
    bench: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """L'aperçu reste un aperçu : un script qui écrit des tarifs doit le demander."""
    before = bench.read_text(encoding="utf-8")
    _run(apply=False, monkeypatch=monkeypatch)

    assert bench.read_text(encoding="utf-8") == before


def test_float_noise_is_not_read_as_a_price_change(
    bench: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Les tarifs arrivent par token : 0,8 y devient 0,7999999999999999.

    Sans arrondi, chaque exécution réécrirait le fichier en annonçant un écart
    qui n'existe pas — et on cesserait de lire ses avertissements.
    """
    monkeypatch.setattr(
        sync,
        "fetch_openrouter_prices",
        lambda: {k: (round(v[0], 6), round(v[1], 6)) for k, v in REMOTE.items()},
    )
    _run(apply=True, monkeypatch=monkeypatch)
    after_first = bench.read_text(encoding="utf-8")

    _run(apply=True, monkeypatch=monkeypatch)

    assert bench.read_text(encoding="utf-8") == after_first

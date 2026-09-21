"""Aligne `config/llm_pricing.json` sur les tarifs publiés par OpenRouter.

Pourquoi ce script existe : les tarifs saisis à la main se périment en silence.
Relevé le 2026-09-21, `gpt-5.6-luna` était facturée 1 $/6 $ dans la config pour
0,20 $/1,20 $ réels — un facteur cinq, qui faisait conclure « Luna 2,3× moins
chère que Terra » là où elle l'est 9,4×.

**Le prix dépend de la route, pas du modèle.** `gpt-5.6-sol` coûte 5/30 chez
OpenAI et 2/10 via OpenRouter : écraser l'un par l'autre introduirait un
tarif faux, donc un plafond budgétaire faux. Le script n'applique donc
automatiquement que les modèles réellement routés par OpenRouter
(`client_type: openrouter`), et se contente de **signaler** l'écart pour les
autres — à l'humain de trancher, en connaissant la route.

Usage :
    python scripts/sync_openrouter_pricing.py            # rapport seul
    python scripts/sync_openrouter_pricing.py --apply    # écrit les routés OpenRouter
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
REPO_ROOT = Path(__file__).resolve().parents[1]
PRICING_PATH = REPO_ROOT / "config" / "llm_pricing.json"
CONFIG_PATH = REPO_ROOT / "config" / "llm_config.json"
PER_MILLION = 1_000_000


def fetch_openrouter_prices() -> Dict[str, Tuple[float, float]]:
    """Récupère les tarifs OpenRouter, en dollars par million de tokens.

    Returns:
        Un dictionnaire ``slug -> (entrée, sortie)``.

    Raises:
        httpx.HTTPError: Si le catalogue est injoignable — mieux vaut échouer
            que repartir sur des tarifs partiels.
    """
    response = httpx.get(OPENROUTER_MODELS_URL, timeout=30)
    response.raise_for_status()
    prices: Dict[str, Tuple[float, float]] = {}
    for model in response.json()["data"]:
        pricing = model.get("pricing") or {}
        try:
            # Arrondi obligatoire : les tarifs arrivent en dollars par token, et
            # la multiplication par un million produit du bruit flottant
            # (0,8 devient 0,7999999999999999) que l'on prendrait pour un écart.
            prices[model["id"]] = (
                round(float(pricing["prompt"]) * PER_MILLION, 6),
                round(float(pricing["completion"]) * PER_MILLION, 6),
            )
        except (KeyError, TypeError, ValueError):
            continue
    return prices


def routed_via_openrouter() -> Dict[str, str]:
    """Modèles du catalogue projet réellement servis par OpenRouter.

    Returns:
        Un dictionnaire ``api_identifier -> slug OpenRouter``. L'identifiant du
        projet **est** le slug pour ces modèles : c'est ce qui rend la
        synchronisation exacte plutôt qu'approchée.
    """
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return {
        model["api_identifier"]: model["api_identifier"]
        for model in config.get("available_models", [])
        if model.get("client_type") == "openrouter"
    }


def _entry(pricing: Dict[str, Any], model_id: str) -> Optional[Dict[str, Any]]:
    """Retourne l'entrée de tarif d'un modèle, ou ``None``."""
    root = pricing.get("models", pricing)
    entry = root.get(model_id)
    return entry if isinstance(entry, dict) else None


def main() -> int:
    """Compare, rapporte, et applique si demandé."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="écrit les modèles routés OpenRouter")
    args = parser.parse_args()

    remote = fetch_openrouter_prices()
    pricing = json.loads(PRICING_PATH.read_text(encoding="utf-8"))
    openrouter_models = routed_via_openrouter()

    applied, diverging, missing = [], [], []
    for model_id, slug in sorted(openrouter_models.items()):
        if slug not in remote:
            missing.append(model_id)
            continue
        inp, out = remote[slug]
        entry = _entry(pricing, model_id)
        if entry is None:
            root = pricing.get("models", pricing)
            root[model_id] = {
                "input_price_per_1M": inp,
                "output_price_per_1M": out,
                "description": f"Tarif OpenRouter synchronisé ({slug})",
            }
            applied.append((model_id, None, (inp, out)))
            continue
        before = (
            round(float(entry["input_price_per_1M"]), 6),
            round(float(entry["output_price_per_1M"]), 6),
        )
        if before != (inp, out):
            entry["input_price_per_1M"], entry["output_price_per_1M"] = inp, out
            applied.append((model_id, before, (inp, out)))

    # Routes non-OpenRouter : on regarde sans toucher.
    root = pricing.get("models", pricing)
    for model_id, entry in sorted(root.items()):
        if model_id in openrouter_models or not isinstance(entry, dict):
            continue
        for slug in (model_id, f"openai/{model_id}", f"mistralai/{model_id}"):
            if slug in remote:
                inp, out = remote[slug]
                before = (
                    round(float(entry["input_price_per_1M"]), 6),
                    round(float(entry["output_price_per_1M"]), 6),
                )
                if before != (inp, out):
                    diverging.append((model_id, slug, before, (inp, out)))
                break

    for model_id, before, after in applied:
        origin = "absent" if before is None else f"{before[0]}/{before[1]}"
        print(f"[openrouter] {model_id}: {origin} -> {after[0]}/{after[1]}")
    for model_id, slug, before, after in diverging:
        print(
            f"[écart, NON appliqué] {model_id}: config {before[0]}/{before[1]} · "
            f"{slug} chez OpenRouter {after[0]}/{after[1]} — routes différentes, à trancher"
        )
    for model_id in missing:
        print(f"[introuvable chez OpenRouter] {model_id}")

    if not applied:
        print("Tarifs OpenRouter déjà à jour.")
        return 0
    if args.apply:
        PRICING_PATH.write_text(
            json.dumps(pricing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"\n{len(applied)} tarif(s) écrit(s) dans {PRICING_PATH.name}.")
    else:
        print(f"\nAperçu seul — relancer avec --apply pour écrire ({len(applied)} en attente).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

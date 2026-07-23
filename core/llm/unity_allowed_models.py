"""Modèles autorisés pour la génération Unity (structured output)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Set

from constants import ModelNames

logger = logging.getLogger(__name__)

_LLM_CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "llm_config.json"


def get_unity_structured_output_allowed_models(
    config_path: Path | None = None,
) -> Set[str]:
    """Retourne les slugs autorisés pour la gen Unity.

    Inclut les tiers GPT-5.6 et tous les modèles ``client_type=openrouter``
    présents dans ``llm_config.json``.

    Args:
        config_path: Chemin optionnel vers ``llm_config.json``.

    Returns:
        Ensemble d'identifiants API autorisés.
    """
    allowed: Set[str] = set(ModelNames.UNITY_STRUCTURED_OUTPUT_MODELS)
    path = config_path or _LLM_CONFIG_PATH
    try:
        with open(path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
    except FileNotFoundError:
        logger.warning("llm_config introuvable pour whitelist Unity: %s", path)
        return allowed
    except json.JSONDecodeError as exc:
        logger.error("llm_config JSON invalide (%s): %s", path, exc)
        return allowed

    models = config.get("available_models", [])
    if not isinstance(models, list):
        return allowed

    for model in models:
        if not isinstance(model, dict):
            continue
        if model.get("client_type") != "openrouter":
            continue
        identifier = model.get("api_identifier") or model.get("model_identifier")
        if isinstance(identifier, str) and identifier.strip():
            allowed.add(identifier.strip())

    return allowed

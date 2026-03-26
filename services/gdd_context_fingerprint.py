"""Empreinte du contenu GDD utilisé pour une sélection de contexte (Story 3.9 FR19)."""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Limite haute pour éviter la troncature contextuelle dans l'empreinte (cohérence « contenu entité »).
_FINGERPRINT_MAX_CONTEXT_TOKENS = 999_999


def structured_context_fingerprint(structured: Dict[str, Any]) -> str:
    """Calcule une empreinte SHA-256 stable du contexte structuré.

    Args:
        structured: Résultat de ``ContextBuilder.build_context_json``.

    Returns:
        Chaîne hexadécimale SHA-256.
    """
    canonical = json.dumps(structured, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_gdd_content_fingerprint(
    context_builder: Any,
    context_selections: Dict[str, Any],
    *,
    field_configs: Optional[Dict[str, List[str]]] = None,
    organization_mode: str = "narrative",
    element_modes: Optional[Dict[str, Any]] = None,
) -> str:
    """Construit le JSON de contexte puis son empreinte (même pipeline que génération).

    Recharge les fichiers GDD via ``load_gdd_files()`` pour refléter le disque courant.

    Args:
        context_builder: Instance ``ContextBuilder``.
        context_selections: Sélections brutes (peuvent contenir ``_element_modes``).
        field_configs: Champs par type (optionnel).
        organization_mode: Mode d'organisation du contexte.
        element_modes: Modes par élément si non fournis dans les sélections.

    Returns:
        Empreinte SHA-256 hex.

    Raises:
        RuntimeError: Si le context builder n'est pas initialisé après chargement.
    """
    context_builder.load_gdd_files()
    payload = dict(context_selections) if isinstance(context_selections, dict) else {}
    modes = element_modes
    if "_element_modes" in payload:
        extracted = payload.pop("_element_modes", None)
        if modes is None and isinstance(extracted, dict):
            modes = extracted
    structured = context_builder.build_context_json(
        selected_elements=payload,
        scene_instruction="",
        field_configs=field_configs,
        organization_mode=organization_mode,
        max_tokens=_FINGERPRINT_MAX_CONTEXT_TOKENS,
        include_dialogue_type=True,
        element_modes=modes,
    )
    return structured_context_fingerprint(structured)

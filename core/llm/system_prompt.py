"""Message système envoyé par les clients LLM quand l'appelant n'en fournit pas."""

from __future__ import annotations

FALLBACK_SYSTEM_PROMPT = "Tu es dialoguiste pour un jeu de rôle narratif."
"""Repli si le fichier de configuration est introuvable : une consigne minimale plutôt
qu'aucune, et sans aucune règle de format qui pourrait contredire le mode du run."""


def default_system_prompt() -> str:
    """Retourne le message système par défaut, lu dans `config/system_prompts/default.txt`.

    Returns:
        Le texte configuré, ou `FALLBACK_SYSTEM_PROMPT` s'il est introuvable.
    """
    from services.configuration_service import read_default_system_prompt

    return read_default_system_prompt() or FALLBACK_SYSTEM_PROMPT

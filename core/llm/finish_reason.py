"""Pourquoi le modèle a cessé d'écrire.

Sans cette information, un fragment incomplet est indiscernable d'un modèle qui
écrit mal : « il a mal répondu » et « on l'a coupé » produisent exactement la
même sortie tronquée. Le banc du 2026-08-08 s'est arrêté là — cinq échecs dont
deux fragments d'un seul panneau, sans rien pour trancher, alors que le plafond
de complétion datait de l'ère du panneau unique. Attribuer au modèle un défaut
du harnais est le pire résultat possible pour un outil dont la seule question
est « quel modèle employer ».

Les deux familles d'API disent la même chose de deux façons :

- **Chat Completions** (Mistral, OpenRouter) : ``choices[0].finish_reason``.
- **Responses** (OpenAI) : ``status`` plus ``incomplete_details.reason``.

On normalise sur le vocabulaire de Chat Completions, le plus répandu, pour que
le benchmark n'ait qu'un seul mot à comparer.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

TRUNCATED = "length"
"""Coupé par le plafond de complétion — un défaut du harnais, pas du modèle."""

COMPLETED = "stop"
"""Le modèle a fini sa phrase de lui-même."""

_RESPONSES_INCOMPLETE_REASONS = {
    "max_output_tokens": TRUNCATED,
    "content_filter": "content_filter",
}


def _field(source: Any, name: str) -> Any:
    """Lit un champ, que la réponse soit un objet SDK ou un dictionnaire.

    Le streaming OpenAI livre l'événement ``response.incomplete`` sous forme de
    dictionnaire brut, là où l'appel bloquant rend un objet typé. C'est
    justement l'événement de troncature : le manquer viderait de son sens tout
    ce module.

    Args:
        source: Objet de réponse ou dictionnaire.
        name: Nom du champ.

    Returns:
        La valeur, ou ``None``.
    """
    if isinstance(source, dict):
        return source.get(name)
    return getattr(source, name, None)


def _incomplete_reason(response: Any) -> str:
    """Traduit ``incomplete_details`` de la Responses API.

    Args:
        response: Réponse OpenAI de statut ``incomplete``.

    Returns:
        Le motif normalisé, ou le motif brut s'il est inconnu. Jamais une
        supposition : un ``incomplete`` sans motif reste ``incomplete``.
    """
    details = _field(response, "incomplete_details")
    raw = _field(details, "reason")
    if not raw:
        return "incomplete"
    return _RESPONSES_INCOMPLETE_REASONS.get(str(raw), str(raw))


def extract_finish_reason(response: Any) -> Optional[str]:
    """Lit la raison d'arrêt d'une réponse, quelle que soit l'API.

    Args:
        response: Objet de réponse d'un SDK LLM.

    Returns:
        ``stop``, ``length``, ``content_filter``, ``tool_calls``… ou ``None``
        quand la réponse ne le dit pas. ``None`` signifie « on ne sait pas » et
        ne doit jamais être lu comme « tout va bien ».
    """
    try:
        choices = _field(response, "choices")
        if choices:
            reason = _field(choices[0], "finish_reason")
            if reason:
                return str(reason)

        status = _field(response, "status")
        if status:
            if status == "completed":
                return COMPLETED
            if status == "incomplete":
                return _incomplete_reason(response)
            return str(status)
    except Exception as exc:  # sortie exotique : ne jamais casser une génération pour ça
        logger.debug("Raison d'arrêt illisible : %s", exc)
    return None


def is_truncated(reason: Optional[str]) -> bool:
    """La génération a-t-elle été coupée par le plafond de complétion ?

    Args:
        reason: Raison d'arrêt normalisée.

    Returns:
        ``True`` uniquement sur une troncature avérée.
    """
    return reason == TRUNCATED

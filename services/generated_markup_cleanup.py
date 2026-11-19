"""Mise en forme des choix générés : actions du PJ en *[…]* sans espace parasite.

Le modèle écrit parfois « * [Vous observez…]* » : l'espace après l'astérisque casse
l'italique markdown, et le texte part tel quel dans le JSON Unity. Vu sur Voknir avec
GPT-5.6 Luna le 2026-11-19. Seule la forme *[action]* des choix est touchée.
"""
from __future__ import annotations

import re

_OPENING = re.compile(r"^(\s*)\*\s*\[")
_CLOSING = re.compile(r"\]\s+\*(?=\s|$|«)")


def tidy_choice_action_markup(text: str) -> str:
    """Recolle les marqueurs d'une action de choix : « * [Vous …] * » → « *[Vous …]* ».

    Args:
        text: Texte d'un choix généré.

    Returns:
        Le texte, marqueurs recollés quand il s'ouvre sur une action entre crochets.
    """
    if not text or not _OPENING.match(text):
        return text
    return _CLOSING.sub("]*", _OPENING.sub(r"\1*[", text, count=1), count=1)

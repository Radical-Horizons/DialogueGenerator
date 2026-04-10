"""Constantes et profils pour la détection context dropping (FR44).

Story 4.10 pourra étendre ``rules_profile`` / ``tolerance`` ; valeurs par défaut sûres ici.
"""
from __future__ import annotations

from typing import Literal

RulesProfile = Literal["strict", "light"]

DEFAULT_RULES_PROFILE: RulesProfile = "strict"

# Longueur minimale d'un libellé extrait des sélections (caractères visibles).
MIN_LABEL_LEN_STRICT: int = 3
MIN_LABEL_LEN_LIGHT: int = 4

# Au moins ce nombre de « mots significatifs » (len>=3) pour analyser la branche « subtil ».
MIN_WORDS_FOR_SUBTLETY: int = 2

GLOBAL_NODE_ID: str = "__dialogue_scope__"

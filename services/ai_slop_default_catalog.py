"""Catalogues par défaut pour la détection « AI slop » (FR43).

Séparés de la logique de scan pour faciliter les tests et l’extension.
"""

from __future__ import annotations

from typing import Final, List, Tuple

# (sous-chaîne insensible à la casse pour recherche, suggestion heuristique)
DEFAULT_GPT_ISMS: Final[List[Tuple[str, str]]] = [
    (
        "ah, je vois",
        "Préférer une réaction concrète (action, ton, enjeu) plutôt qu’une réaction méta.",
    ),
    (
        "c'est intéressant",
        "Remplacer par un jugement ou une question ancrée dans la scène.",
    ),
    (
        "permettez-moi de",
        "Aller droit au fait ou reformuler sans formule de politesse générique.",
    ),
    (
        "comme vous le savez",
        "Exposer l’info en jeu ou laisser le joueur déduire.",
    ),
    (
        "en tant qu'",
        "Nommer le rôle ou le contexte sans tournure administrative.",
    ),
    (
        "il est important de noter",
        "Intégrer l’info dans le dialogue ou l’action plutôt qu’un rappel scolaire.",
    ),
]

# Phrases génériques / remplissage (sous-chaîne, suggestion)
DEFAULT_GENERIC_PHRASES: Final[List[Tuple[str, str]]] = [
    (
        "bonjour et bienvenue",
        "Accrocher l’accueil à un détail de lieu, d’humeur ou de tension.",
    ),
    (
        "comment allez-vous",
        "Remplacer par un conflit latent, un objectif ou un obstacle concret.",
    ),
    (
        "je suis là pour vous aider",
        "Montrer l’aide par un geste ou une offre spécifique au problème.",
    ),
    (
        "n'hésitez pas",
        "Proposer une option claire ou une conséquence plutôt qu’une formule creuse.",
    ),
]

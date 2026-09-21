"""Le prompt contredit-il ce que le run demande ?

Un banc ne mesure un modèle que si la consigne qu'il reçoit est cohérente. Deux
fois en une journée, elle ne l'était pas, et les deux fois le modèle **le plus
obéissant** a été le plus pénalisé :

- le bloc ``<output_format>`` imposait « génère UN SEUL nœud » en mode fragment,
  où le schéma réclame deux niveaux. `mistral-medium-3-5` a rendu un panneau sur
  quatre cas sur cinq, puis a perdu ses duels contre des fragments complets ;
- le mode « sans didascalies » arrivait après quatre lignes qui les autorisaient.
  Un modèle qui en plaçait suivait la majorité de son prompt.

Aucun test ne pouvait les voir : chaque morceau de prompt était correct
isolément, la contradiction naissait de leur assemblage. L'audit porte donc sur
le **texte assemblé**, juste avant de dépenser.

Un prompt incohérent ne rend pas la mesure imprécise : il la rend fausse dans
une direction précise, contre les modèles qui suivent les instructions. Mieux
vaut refuser le run.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Pattern

_ASSEMBLED_MARKERS = ("<output_format>", "<generation_instructions>")
"""Signature d'un prompt réellement produit par `PromptBuilder`.

L'audit ne porte que sur ces prompts-là. Un texte qui n'en porte aucune marque
n'est pas un prompt incohérent : c'est autre chose — un double de test, un
gabarit, une chaîne de diagnostic — et prétendre l'auditer reviendrait à
inventer des contradictions dans un texte qui n'a jamais eu vocation à
contraindre un modèle.

Le cas voisin, un prompt assemblé mais **vide de contexte**, n'est pas couvert
ici : il l'est déjà en amont, par `tests/services/test_benchmark_suite_seed.py`,
qui vérifie que toute entité GDD citée par un cas existe sous son nom canonique
exact. Dédoubler ce contrôle ici n'ajouterait rien et ferait échouer des runs
pour la mauvaise raison.
"""


@dataclass(frozen=True)
class _Rule:
    """Une formulation interdite dans un mode donné."""

    pattern: Pattern[str]
    message: str


_FRAGMENT_FORBIDDEN: tuple[_Rule, ...] = (
    _Rule(
        re.compile(r"UN SEUL n[œoe]ud", re.I),
        "le prompt demande un nœud unique alors que le run attend un fragment",
    ),
    _Rule(
        re.compile(r"Ne g[ée]n[èe]re PAS de s[ée]quence", re.I),
        "le prompt interdit la séquence de nœuds que le schéma du fragment exige",
    ),
    _Rule(
        re.compile(r"un n[œoe]ud par requ[êe]te", re.I),
        "le prompt décrit l'expansion nœud par nœud, propre au mode mono-nœud",
    ),
)

_FRAGMENT_REQUIRED: tuple[_Rule, ...] = (
    _Rule(
        re.compile(r"FRAGMENT de DEUX niveaux", re.I),
        "le prompt ne dit nulle part que la sortie attendue est un fragment",
    ),
)

_NO_STAGE_DIRECTIONS_FORBIDDEN: tuple[_Rule, ...] = (
    _Rule(
        re.compile(r"Didascalies autoris[ée]es", re.I),
        "le prompt autorise les didascalies alors que le run les interdit",
    ),
    _Rule(
        re.compile(r"didascalies?\s+\*italique\*", re.I),
        "le prompt décrit le format des didascalies alors que le run les interdit",
    ),
    _Rule(
        re.compile(r"didascalie \+ r[ée]plique", re.I),
        "le prompt compte les didascalies dans la longueur alors qu'il n'en attend pas",
    ),
)


def audit_prompt(
    prompt: str, *, fragment_mode: bool, allow_stage_directions: bool
) -> List[str]:
    """Relève les contradictions entre un prompt assemblé et le run demandé.

    Args:
        prompt: Le texte réellement envoyé au modèle.
        fragment_mode: Le run attend un fragment de deux niveaux.
        allow_stage_directions: Le run accepte les didascalies.

    Returns:
        Les contradictions, en clair. Liste vide si le prompt est cohérent —
        ou s'il ne provient pas de `PromptBuilder`, auquel cas il n'y a rien à
        auditer.
    """
    if not prompt or not any(marker in prompt for marker in _ASSEMBLED_MARKERS):
        return []

    problems: List[str] = []
    if fragment_mode:
        problems += [r.message for r in _FRAGMENT_FORBIDDEN if r.pattern.search(prompt)]
        problems += [
            r.message for r in _FRAGMENT_REQUIRED if not r.pattern.search(prompt)
        ]
    if not allow_stage_directions:
        problems += [
            r.message for r in _NO_STAGE_DIRECTIONS_FORBIDDEN if r.pattern.search(prompt)
        ]
    return problems

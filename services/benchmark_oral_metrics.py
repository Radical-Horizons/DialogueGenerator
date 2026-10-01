"""Mesures déterministes de l'oralité d'une génération, sans juge.

Le juge note le naturel de l'oral, mais il est **comprimé** : au run du
2026-10-01, 28 notes sur 48 valaient exactement 6. Un gain réel peut s'y perdre,
et une campagne d'amélioration du prompt qui ne lirait que lui réglerait ses
consignes sur la préférence d'un seul modèle juge.

Ces mesures ne remplacent pas le juge : elles le recoupent. Elles sont tirées de ce
qu'il reprochait, et corrèlent avec sa note sur les 47 générations lisibles de ce
run — mots par phrase −0,38, `;` et `:` par réplique −0,40, ruptures (… —) +0,34.
Elles sont **normalisées** par phrase et par 100 mots, pour qu'un panneau plus long
ne les déplace pas à lui seul.

La recopie mesure autre chose : la part du texte reprise mot pour mot dans le
prompt. La grille récompense la reprise des formules de la fiche ; sans compteur
indépendant, des exemples ajoutés au prompt pourraient faire monter la note de voix
par simple copie.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Iterable, List, Optional, Set, Tuple

COPY_NGRAM_SIZE = 8
"""Longueur, en mots, d'une séquence comptée comme recopiée.

Assez long pour qu'une formule signature de la fiche (« les angles mentent, mais
les courbes révèlent ») n'y suffise pas, assez court pour attraper une phrase
d'exemple reprise à l'identique.
"""

_SENTENCE_END = re.compile(r"[.!?…]+(?=\s|$)")
_WORD = re.compile(r"[\wÀ-ÿ’'-]+", re.UNICODE)
_JOINS = re.compile(r"[;:]")
_BREAKS = re.compile(r"…|\.\.\.|\s—\s|\s–\s|—$|^—")


@dataclass(frozen=True)
class OralTally:
    """Comptes bruts d'un ensemble de répliques, additionnables entre générations."""

    words: int = 0
    sentences: int = 0
    joins: int = 0
    breaks: int = 0

    def __add__(self, other: "OralTally") -> "OralTally":
        """Additionne deux comptes."""
        return OralTally(
            self.words + other.words,
            self.sentences + other.sentences,
            self.joins + other.joins,
            self.breaks + other.breaks,
        )


def npc_lines(json_content: Optional[str]) -> List[str]:
    """Extrait les répliques du PNJ (`line`) d'une génération Unity.

    Args:
        json_content: Génération brute.

    Returns:
        Les répliques non vides, dans l'ordre des nœuds.
    """
    if not json_content:
        return []
    try:
        parsed = json.loads(json_content)
    except json.JSONDecodeError:
        return []
    nodes = parsed.get("nodes") if isinstance(parsed, dict) else parsed
    if not isinstance(nodes, list):
        return []
    return [
        node["line"].strip()
        for node in nodes
        if isinstance(node, dict) and isinstance(node.get("line"), str) and node["line"].strip()
    ]


def _words(text: str) -> List[str]:
    """Mots d'un texte, en minuscules."""
    return [word.lower() for word in _WORD.findall(text)]


def tally(lines: Iterable[str]) -> OralTally:
    """Compte mots, phrases, jointures (`;` `:`) et ruptures d'un lot de répliques.

    Args:
        lines: Répliques du PNJ.

    Returns:
        Les comptes bruts.
    """
    total = OralTally()
    for line in lines:
        text = line.replace("«", " ").replace("»", " ").strip()
        if not text:
            continue
        sentences = max(1, len(_SENTENCE_END.findall(text)))
        total = total + OralTally(
            words=len(_words(text)),
            sentences=sentences,
            joins=len(_JOINS.findall(text)),
            breaks=len(_BREAKS.findall(text)),
        )
    return total


def _ngrams(words: List[str], size: int) -> Set[Tuple[str, ...]]:
    """Séquences de ``size`` mots consécutifs."""
    return {tuple(words[i : i + size]) for i in range(len(words) - size + 1)}


def copied_ngrams(lines: Iterable[str], prompt: Optional[str], size: int = COPY_NGRAM_SIZE) -> int:
    """Compte les séquences de répliques reprises mot pour mot dans le prompt.

    Args:
        lines: Répliques du PNJ.
        prompt: Prompt réellement envoyé.
        size: Longueur des séquences, en mots.

    Returns:
        Nombre de séquences distinctes présentes à l'identique dans le prompt.
    """
    if not prompt:
        return 0
    produced: Set[Tuple[str, ...]] = set()
    for line in lines:
        produced |= _ngrams(_words(line), size)
    if not produced:
        return 0
    return len(produced & _ngrams(_words(prompt), size))

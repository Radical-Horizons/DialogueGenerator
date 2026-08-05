"""Porte de langue : la génération est-elle bien en français ?

Le dépôt n'avait aucune détection de langue avant cette brique. Deux chemins :
``langdetect`` quand la dépendance est installée (graine fixée, sinon la
bibliothèque est non déterministe), et un repli lexical par mots-outils qui
fonctionne sans réseau ni dépendance — indispensable pour que les tests et un
poste sans installation complète restent honnêtes plutôt que muets.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional, Set

logger = logging.getLogger(__name__)

MIN_CHARS_FOR_DETECTION = 40
"""En dessous, aucun détecteur n'est fiable : on ne rejette pas sur du bruit."""

FALLBACK_MIN_FRENCH_MARKERS = 3
"""Nombre de marqueurs français distincts exigés par le repli lexical."""

_WORD_RE = re.compile(r"[a-zà-öø-ÿœæ]+", re.IGNORECASE)
"""L'apostrophe est un séparateur, pas une lettre : sans cela « j'ai », « l'ombre »
et « qu'il » formeraient un seul mot introuvable parmi les marqueurs, et un dialogue
français naturel — donc riche en élisions — pourrait totaliser zéro marqueur."""

_FRENCH_MARKERS: Set[str] = {
    # « qu » (de « qu'il », « qu'elle ») : seule forme élidée sans homographe anglais.
    # Les autres lettres isolées apparaissent aussi dans les contractions anglaises
    # (« don't » → t, « it's » → s) et discrimineraient mal. La découpe sur
    # l'apostrophe suffit du reste à exposer le mot suivant : « l'ombre » → « ombre ».
    "qu",
    "le", "la", "les", "un", "une", "des", "du", "au", "aux", "et", "ou", "mais",
    "donc", "car", "que", "qui", "quoi", "dont", "où", "je", "tu", "il", "elle",
    "nous", "vous", "ils", "elles", "ne", "pas", "plus", "moins", "très", "tout",
    "toute", "cette", "ces", "mon", "ton", "son", "notre", "votre", "leur", "avec",
    "sans", "pour", "dans", "sur", "sous", "vers", "chez", "est", "sont", "était",
    "être", "avoir", "fait", "faire", "peux", "peut", "veux", "veut", "dois", "doit",
    "alors", "encore", "jamais", "toujours", "ici", "là", "oui", "non", "merci",
}

_ENGLISH_MARKERS: Set[str] = {
    "the", "and", "you", "your", "are", "is", "was", "were", "have", "has", "will",
    "would", "should", "could", "with", "from", "this", "that", "these", "those",
    "what", "when", "where", "why", "how", "not", "but", "for", "about", "there",
    "they", "them", "their", "here", "yes", "thanks", "please", "don't", "doesn't",
}


@dataclass(frozen=True)
class LanguageVerdict:
    """Verdict de la porte de langue.

    Attributes:
        is_french: ``True`` si le texte est considéré comme français.
        detected: Code de langue détecté, ou ``None`` si indécidable.
        detector: Détecteur ayant tranché (``langdetect``, ``lexical`` ou ``too_short``).
        reason: Explication lisible quand ``is_french`` est ``False``.
    """

    is_french: bool
    detected: Optional[str]
    detector: str
    reason: Optional[str] = None


def _lexical_verdict(text: str) -> LanguageVerdict:
    """Tranche par comptage de mots-outils français contre anglais.

    Args:
        text: Texte à analyser.

    Returns:
        Le verdict lexical.
    """
    words = {match.group(0).lower() for match in _WORD_RE.finditer(text)}
    french_hits = len(words & _FRENCH_MARKERS)
    english_hits = len(words & _ENGLISH_MARKERS)

    if french_hits >= FALLBACK_MIN_FRENCH_MARKERS and french_hits >= english_hits:
        return LanguageVerdict(is_french=True, detected="fr", detector="lexical")
    if english_hits > french_hits:
        return LanguageVerdict(
            is_french=False,
            detected="en",
            detector="lexical",
            reason=(
                f"Marqueurs anglais dominants ({english_hits} anglais / {french_hits} français)"
            ),
        )
    return LanguageVerdict(
        is_french=False,
        detected=None,
        detector="lexical",
        reason=(
            f"Trop peu de marqueurs français ({french_hits} < {FALLBACK_MIN_FRENCH_MARKERS})"
        ),
    )


def detect_language(text: str) -> LanguageVerdict:
    """Détecte la langue d'un texte de génération.

    Args:
        text: Texte concaténé de la génération (répliques et choix).

    Returns:
        Le verdict de langue. Un texte trop court est accepté faute de signal :
        rejeter sur trois mots produirait des faux positifs qui écarteraient à tort
        des générations valides.
    """
    stripped = (text or "").strip()
    if len(stripped) < MIN_CHARS_FOR_DETECTION:
        return LanguageVerdict(
            is_french=True,
            detected=None,
            detector="too_short",
            reason=None,
        )

    try:
        from langdetect import DetectorFactory, LangDetectException, detect

        DetectorFactory.seed = 0
        code = detect(stripped)
        if code == "fr":
            return LanguageVerdict(is_french=True, detected="fr", detector="langdetect")
        return LanguageVerdict(
            is_french=False,
            detected=code,
            detector="langdetect",
            reason=f"Langue détectée : '{code}' au lieu de 'fr'",
        )
    except ImportError:
        logger.debug("langdetect absent — repli lexical pour la porte de langue")
    except LangDetectException as exc:  # type: ignore[misc]
        logger.debug("langdetect n'a pas pu trancher (%s) — repli lexical", exc)

    return _lexical_verdict(stripped)


def is_french(text: str) -> bool:
    """Raccourci booléen sur :func:`detect_language`.

    Args:
        text: Texte à analyser.

    Returns:
        ``True`` si le texte est considéré comme français.
    """
    return detect_language(text).is_french

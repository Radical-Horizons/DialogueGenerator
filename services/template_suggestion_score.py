"""Scorer déterministe des suggestions de templates (Story 6.9, miroir TS)."""

from __future__ import annotations

import hashlib
import unicodedata
from dataclasses import dataclass
import re
from typing import Iterable, Sequence

REASON_KW = "Correspond aux mots-clés du brief"
REASON_GDD = "Même personnages ou lieux que votre contexte"
REASON_RENCONTRE = "Première rencontre (fiche ou flag catalogue)"
REASON_PERSO = "Souvent chargé"
REASON_CONTEXT = "Déjà choisi dans un scénario similaire"

_TOKEN_RE = re.compile(r"[^a-z0-9]+")
MAX_SUGGESTIONS = 10


@dataclass(frozen=True)
class SuggestionQuery:
    """Signaux envoyés par le client (pas de rechargement GDD)."""

    instructions: str
    scene_type: str
    characters: tuple[str, ...]
    locations: tuple[str, ...]
    has_rencontre_initiale: bool


@dataclass(frozen=True)
class SuggestionCandidateFeatures:
    """Champs d'un candidat utilisés par le scorer pur."""

    name: str
    description: str
    category: str
    scene_type_hint: str
    scene_type: str
    instructions: str
    characters: tuple[str, ...]
    locations: tuple[str, ...]
    use_count: int
    context_use_count: int = 0


@dataclass(frozen=True)
class SuggestionScore:
    """Résultat du scorer : entier 0–100 et raisons FR."""

    score: int
    reasons: tuple[str, ...]


def _fold(text: str) -> str:
    """Minuscule sans diacritiques."""
    decomposed = unicodedata.normalize("NFD", str(text).casefold())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def normalize_tokens(text: str) -> frozenset[str]:
    """Tokens alphanumériques de longueur ≥ 2."""
    if not text:
        return frozenset()
    stripped = _fold(text)
    return frozenset(token for token in _TOKEN_RE.split(stripped) if len(token) >= 2)


def _norm_name(value: str) -> str:
    """Nom GDD comparable (casefold, sans accents)."""
    return _fold(value).strip()


def _half_up(value: float) -> int:
    """Arrondi half-up pour rester aligné avec ``Math.floor(x + 0.5)``."""
    return int(value + 0.5)


def keyword_score(query_tokens: frozenset[str], candidate_tokens: frozenset[str]) -> int:
    """Recouvrement de tokens, plafonné à 40."""
    if not query_tokens:
        return 0
    overlap = len(query_tokens & candidate_tokens)
    return min(40, _half_up(40 * overlap / len(query_tokens)))


def gdd_score(
    request_characters: Sequence[str],
    request_locations: Sequence[str],
    template_characters: Sequence[str],
    template_locations: Sequence[str],
) -> int:
    """Fraction des persos/lieux de la requête présents dans le snapshot, max 25."""
    requested = {
        _norm_name(item)
        for item in (*request_characters, *request_locations)
        if str(item).strip()
    }
    if not requested:
        return 0
    owned = {
        _norm_name(item)
        for item in (*template_characters, *template_locations)
        if str(item).strip()
    }
    matched = len(requested & owned)
    return min(25, _half_up(25 * matched / len(requested)))


def is_first_meeting(scene_type_hint: str, name: str, category: str) -> bool:
    """Candidat « première rencontre » (hint ou libellé)."""
    if (scene_type_hint or "").strip().casefold() == "rencontre_initiale":
        return True
    tokens = normalize_tokens(f"{name} {category}")
    if "salutation" in tokens:
        return True
    return "premiere" in tokens and "rencontre" in tokens


def has_rencontre_initiale_text(mapping: dict[str, str] | None) -> bool:
    """True si au moins une section ``rencontre_initiale`` non vide."""
    if not mapping:
        return False
    return any(str(value).strip() for value in mapping.values())


_FLAG_GENERIC_TOKENS = frozenset(
    {
        "flag",
        "perso",
        "npc",
        "char",
        "character",
        "personnage",
        "rencontre",
        "initiale",
        "premiere",
        "premier",
        "first",
        "meeting",
    }
)


def has_first_meeting_flag(
    characters: Sequence[str], flag_names: Sequence[str]
) -> bool:
    """True si un flag ``*rencontre_initiale*`` recouvre un perso sélectionné."""
    character_tokens: set[str] = set()
    for name in characters:
        character_tokens |= set(normalize_tokens(name))
    character_tokens -= _FLAG_GENERIC_TOKENS
    if not character_tokens:
        return False
    for raw in flag_names:
        folded = _fold(raw)
        if "rencontre" not in folded or "initiale" not in folded:
            continue
        if character_tokens & set(normalize_tokens(raw)):
            return True
    return False


def suggestion_context_key(scene_type: str, characters: Sequence[str]) -> str:
    """Signature courte du scénario (sceneType + persos triés)."""
    folded_scene = _fold(scene_type or "")
    if folded_scene == "generic":
        folded_scene = ""
    parts = [folded_scene] + sorted(
        _fold(item) for item in characters if str(item).strip()
    )
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def score_candidate(
    features: SuggestionCandidateFeatures,
    query: SuggestionQuery,
) -> SuggestionScore:
    """Calcule le score 0–100 et les raisons associées."""
    query_tokens = normalize_tokens(f"{query.instructions} {query.scene_type}")
    candidate_tokens = normalize_tokens(
        " ".join(
            (
                features.name,
                features.description,
                features.category,
                features.scene_type_hint,
                features.scene_type,
                features.instructions,
            )
        )
    )
    kw = keyword_score(query_tokens, candidate_tokens)
    gdd = gdd_score(
        query.characters,
        query.locations,
        features.characters,
        features.locations,
    )
    rencontre = (
        20
        if query.has_rencontre_initiale
        and is_first_meeting(features.scene_type_hint, features.name, features.category)
        else 0
    )
    perso = min(max(features.use_count, 0), 10) * 1.5
    context = min(max(features.context_use_count, 0), 10) * 2
    total = kw + gdd + rencontre + perso + context
    score = min(100, _half_up(total))
    reasons: list[str] = []
    if kw > 0:
        reasons.append(REASON_KW)
    if gdd > 0:
        reasons.append(REASON_GDD)
    if rencontre > 0:
        reasons.append(REASON_RENCONTRE)
    if perso > 0:
        reasons.append(REASON_PERSO)
    if context > 0:
        reasons.append(REASON_CONTEXT)
    return SuggestionScore(score=score, reasons=tuple(reasons))


def rank_scored(
    scored: Iterable[tuple[SuggestionScore, str]],
) -> list[tuple[SuggestionScore, str]]:
    """Garde score > 0, trie score desc puis nom, coupe à ``MAX_SUGGESTIONS``.

    ``scored`` : paires (score, nom) pour un tie-break stable.
    """
    kept = [(item, name) for item, name in scored if item.score > 0]
    kept.sort(key=lambda pair: (-pair[0].score, pair[1].casefold()))
    return kept[:MAX_SUGGESTIONS]

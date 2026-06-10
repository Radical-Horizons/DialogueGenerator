"""Extraction d'informations clés depuis le contexte GDD (sélections + texte libre).

Séparé de la comparaison texte (``context_dropping_detector``) pour limiter la taille
des fichiers et clarifier les responsabilités (FR44).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Set

from services.context_dropping_constants import MIN_LABEL_LEN_LIGHT, MIN_LABEL_LEN_STRICT
from services.lore_contradiction_validator import normalize_entity_name

_SELECTION_LIST_KEYS: Sequence[str] = (
    "characters_full",
    "characters_excerpt",
    "locations_full",
    "locations_excerpt",
    "items_full",
    "items_excerpt",
    "species_full",
    "species_excerpt",
    "communities_full",
    "communities_excerpt",
    "dialogues_examples",
)


@dataclass(frozen=True)
class ContextKeyPhrase:
    """Une mention attendue dérivée du contexte."""

    label: str
    normalized: str
    source_key: str


def _dedupe_preserve_order(phrases: List[ContextKeyPhrase]) -> List[ContextKeyPhrase]:
    seen: Set[str] = set()
    out: List[ContextKeyPhrase] = []
    for p in phrases:
        if p.normalized in seen:
            continue
        seen.add(p.normalized)
        out.append(p)
    return out


def _append_from_lists(
    selections: Dict[str, Any],
    min_len: int,
    source_prefix: str,
) -> List[ContextKeyPhrase]:
    found: List[ContextKeyPhrase] = []
    for key in _SELECTION_LIST_KEYS:
        raw = selections.get(key)
        if not isinstance(raw, list):
            continue
        for item in raw:
            if not isinstance(item, str):
                continue
            label = item.strip()
            if len(label) < min_len:
                continue
            found.append(
                ContextKeyPhrase(
                    label=label,
                    normalized=normalize_entity_name(label),
                    source_key=f"{source_prefix}:{key}",
                )
            )
    return found


def _lines_from_blob(blob: str, min_len: int) -> List[str]:
    lines: List[str] = []
    for line in blob.splitlines():
        t = line.strip()
        if len(t) >= min_len:
            lines.append(t)
    return lines


def _facts_from_scene_instruction(scene_instruction: str, min_len: int) -> List[ContextKeyPhrase]:
    """Heuristique MVP : lignes non vides comme porteurs de faits à vérifier."""
    out: List[ContextKeyPhrase] = []
    for line in _lines_from_blob(scene_instruction, min_len):
        norm = normalize_entity_name(line)
        if len(norm) < min_len:
            continue
        out.append(
            ContextKeyPhrase(
                label=line[:240],
                normalized=norm,
                source_key="scene_instruction:line",
            )
        )
    return out


def extract_key_phrases_from_context(
    context_selections: Optional[Dict[str, Any]],
    scene_instruction: str = "",
    context_text: Optional[str] = None,
    *,
    rules_profile: str = "strict",
) -> List[ContextKeyPhrase]:
    """Collecte les mentions à confronter au texte des nœuds.

    Args:
        context_selections: Même forme que la génération / validate-lore-explicit.
        scene_instruction: Consigne de scène (lignes traitées comme faits candidats).
        context_text: Texte libre optionnel (tests ou client) complémentaire.
        rules_profile: ``strict`` (min 3 car.) ou ``light`` (min 4 car. sur listes).

    Returns:
        Liste dédupliquée par ``normalized``.  Côté détecteur, une mention multi-mots est
        satisfaite dès qu'**un** mot significatif (longueur ≥ 3) apparaît dans les lignes
        et choix du graphe (voir ``context_dropping_detector._classify_phrase``).
    """
    sel = context_selections if isinstance(context_selections, dict) else {}
    min_len = MIN_LABEL_LEN_STRICT if rules_profile != "light" else MIN_LABEL_LEN_LIGHT

    phrases: List[ContextKeyPhrase] = []
    phrases.extend(_append_from_lists(sel, min_len, "selections"))
    phrases.extend(_facts_from_scene_instruction(scene_instruction or "", min_len))

    extra = (context_text or "").strip()
    if extra:
        for line in _lines_from_blob(extra, min_len):
            norm = normalize_entity_name(line)
            if len(norm) < min_len:
                continue
            phrases.append(
                ContextKeyPhrase(
                    label=line[:240],
                    normalized=norm,
                    source_key="context_text:line",
                )
            )

    return _dedupe_preserve_order(phrases)


def significant_words(phrase_normalized: str) -> List[str]:
    """Découpe une mention normalisée en mots comparables (longueur >= 3)."""
    parts = re.split(r"\s+", phrase_normalized.strip())
    return [p for p in parts if len(p) >= 3]

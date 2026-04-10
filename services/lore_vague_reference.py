"""Heuristiques d'ambiguïté référentielle lore (FR39) — mentions vagues vs plusieurs entités GDD.

Frontière : avertissements non bloquants, distincts des contradictions explicites (FR38) et des
avertissements vitalité (AC 4.3). Complexité : O(N × (M + P)) où N = nœuds avec texte, M = motifs
vagues trouvés par nœud (borné par la longueur du texte), P = nombre d'entités candidats dans le
contexte (sélection GDD), sans produit cartésien phrases × entités sur tout le graphe.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, List, Sequence, Set, Tuple

from models.prompt_structure import ContextCategory, ContextItem, PromptStructure

LORE_POTENTIAL_AMBIGUITY_TYPE = "lore_potential_ambiguity"

_COMMON_VAGUE_NOISE: frozenset[str] = frozenset(
    {"tout", "toute", "tous", "même", "meme", "monde", "fait", "reste", "chef", "fond", "chose"}
)

_VAGUE_ARTICLE = re.compile(
    r"(?i)\b(l'|l’|le|la|les)\s+([a-zàâäéèêëïîôùûç\-]{3,})\b",
)
_VAGUE_AU = re.compile(r"(?i)\bau\s+([a-zàâäéèêëïîôùûç\-]{3,})\b")
_VAGUE_AUX = re.compile(r"(?i)\baux\s+([a-zàâäéèêëïîôùûç\-]{3,})\b")


def _strip_accents(value: str) -> str:
    nk = unicodedata.normalize("NFKD", value)
    return "".join(c for c in nk if not unicodedata.combining(c))


def normalize_token(value: str) -> str:
    """Normalise un token ou une mention pour comparaison (aligné FR38)."""
    return _strip_accents(value.strip().lower())


@dataclass(frozen=True)
class LoreGddEntityCandidate:
    """Entité issue du contexte GDD (lieux, objets, etc.) pour résolution de mentions vagues."""

    entity_name: str
    category: str
    gdd_path: str


def _item_display_name(item: ContextItem) -> str:
    meta = item.metadata or {}
    real = meta.get("real_name") or meta.get("nom") or meta.get("name")
    if isinstance(real, str) and real.strip():
        return real.strip()
    return item.name.strip() if item.name else ""


def _category_is_ambiguity_scope(cat: ContextCategory) -> bool:
    """Catégories hors personnages où une mention vague (ex. « le port ») est plausible."""
    if _category_is_character_like(cat):
        return False
    key = (cat.type or "").lower()
    title = (cat.title or "").lower()
    return (
        "location" in key
        or "lieu" in key
        or "lieu" in title
        or "item" in key
        or "objet" in key
        or "objet" in title
        or "species" in key
        or "espèce" in title
        or "espèce" in key
        or "community" in key
        or "communauté" in title
    )


def _category_is_character_like(cat: ContextCategory) -> bool:
    key = (cat.type or "").lower()
    title = (cat.title or "").lower()
    return "character" in key or "personnage" in key or "personnage" in title


def extract_ambiguity_scope_entities_from_prompt_structure(
    structure: PromptStructure,
) -> List[LoreGddEntityCandidate]:
    """Liste les entités non-personnage du contexte (noms affichables + chemin GDD)."""
    out: List[LoreGddEntityCandidate] = []
    for section in structure.sections:
        if section.type != "context" or not section.categories:
            continue
        for cat in section.categories:
            if not _category_is_ambiguity_scope(cat):
                continue
            for item in cat.items:
                display = _item_display_name(item)
                if not display:
                    continue
                path = f"{cat.title} › {display}"
                out.append(
                    LoreGddEntityCandidate(
                        entity_name=display,
                        category=cat.type or cat.title or "context",
                        gdd_path=path,
                    )
                )
    return out


def _collect_vague_noun_phrases(text_lower: str) -> List[Tuple[str, str]]:
    """Retourne (phrase_normalisée, lemme_noun) pour chaque motif vague détecté."""
    found: List[Tuple[str, str]] = []
    for m in _VAGUE_ARTICLE.finditer(text_lower):
        noun = m.group(2)
        if not noun:
            continue
        nt = normalize_token(noun)
        if len(nt) < 3 or nt in _COMMON_VAGUE_NOISE:
            continue
        found.append((m.group(0).strip(), nt))
    for m in _VAGUE_AU.finditer(text_lower):
        noun = m.group(1)
        if not noun:
            continue
        nt = normalize_token(noun)
        if len(nt) < 3 or nt in _COMMON_VAGUE_NOISE:
            continue
        found.append((m.group(0).strip(), nt))
    for m in _VAGUE_AUX.finditer(text_lower):
        noun = m.group(1)
        if not noun:
            continue
        nt = normalize_token(noun)
        if len(nt) < 3 or nt in _COMMON_VAGUE_NOISE:
            continue
        found.append((m.group(0).strip(), nt))
    return found


def _entities_matching_noun(
    entities: Sequence[LoreGddEntityCandidate],
    noun_token: str,
) -> List[LoreGddEntityCandidate]:
    """Entités dont le nom normalisé contient le nom comme mot entier."""
    if not noun_token:
        return []
    try:
        escaped = re.escape(noun_token)
    except re.error:
        return []
    pat = re.compile(rf"\b{escaped}\b")
    seen_paths: Set[str] = set()
    out: List[LoreGddEntityCandidate] = []
    for ent in entities:
        en = normalize_token(ent.entity_name)
        if not pat.search(en):
            continue
        if ent.gdd_path in seen_paths:
            continue
        seen_paths.add(ent.gdd_path)
        out.append(ent)
    return out


def build_lore_ambiguity_warning_key(
    node_id: str,
    phrase: str,
    candidates: Sequence[LoreGddEntityCandidate],
) -> str:
    """Clé stable pour persistance UI (localStorage) — pas de hash, reproductible."""
    paths = "|".join(sorted(c.gdd_path for c in candidates))
    return f"lore_pot_amb|{node_id}|{normalize_token(phrase)}|{paths}"


def find_vague_phrase_ambiguity_warnings(
    node_text_by_id: Dict[str, str],
    entities: Sequence[LoreGddEntityCandidate],
) -> List[Dict[str, Any]]:
    """Émet ``lore_potential_ambiguity`` lorsqu'une mention vague matche ≥2 entités GDD."""
    if not entities:
        return []
    warnings: List[Dict[str, Any]] = []
    seen_keys: Set[str] = set()

    for node_id, text_lower in node_text_by_id.items():
        for phrase, noun_token in _collect_vague_noun_phrases(text_lower):
            matches = _entities_matching_noun(entities, noun_token)
            if len(matches) < 2:
                continue
            wkey = build_lore_ambiguity_warning_key(node_id, phrase, matches)
            if wkey in seen_keys:
                continue
            seen_keys.add(wkey)
            names = ", ".join(m.entity_name for m in matches[:5])
            if len(matches) > 5:
                names += ", …"
            cand_payload = [
                {"name": m.entity_name, "category": m.category, "gdd_path": m.gdd_path}
                for m in matches
            ]
            warnings.append(
                {
                    "type": LORE_POTENTIAL_AMBIGUITY_TYPE,
                    "node_id": node_id,
                    "message": (
                        f"Lore potentiel : la mention « {phrase} » peut désigner plusieurs entrées GDD "
                        f"({names}). Revue humaine recommandée."
                    ),
                    "severity": "warning",
                    "target": phrase,
                    "gdd_reference": matches[0].gdd_path,
                    "lore_subtype": "vague_article_noun",
                    "lore_warning_key": wkey,
                    "ambiguity_candidates": cand_payload,
                }
            )
    return warnings


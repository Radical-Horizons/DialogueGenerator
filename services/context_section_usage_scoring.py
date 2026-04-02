"""Scoring d’usage par section GDD injectée (Story 3.7, FR17).

Heuristique alignée sur ``keyword_overlap_v2`` : recouvrement lexical entre
chaque fragment de contexte (entité / sous-section) et le texte généré.
"""
from __future__ import annotations

import re
import time
from datetime import datetime, UTC
from typing import Any, Dict, List, Optional, Tuple

from services.context_relevance_scoring import (
    extract_generated_plain_text,
    overlap_percent_sets,
    slice_gdd_type_bodies,
    split_prompt_system_input,
    tokenize_words_for_overlap,
)

SECTION_USAGE_METHOD = "section_keyword_overlap_v2"
REFLECTED_THRESHOLD_PERCENT = 40.0
EXCERPT_MAX_LEN = 320

_TYPE_DISPLAY: Dict[str, str] = {
    "characters": "Personnages",
    "locations": "Lieux",
    "regions": "Lieux",
    "themes": "Thèmes",
    "items": "Objets",
    "species": "Espèces",
    "communities": "Communautés",
    "other": "Contexte",
}

# Découpe les sous-blocs ## titre (entité ou regroupement).
_RE_H2 = re.compile(r"(?m)^##\s+(.+)$")
# Découpe les ### sous-sections GDD à l’intérieur d’un bloc entité.
_RE_H3 = re.compile(r"(?m)^###\s+(.+)$")


def _slug_key(entity_type: str, entity_label: str, section_title: str) -> str:
    """Clé stable pour comparaison inter-nœuds (pas d’espaces ambigus)."""
    parts = [
        entity_type.strip().lower(),
        re.sub(r"\s+", " ", entity_label.strip()).lower(),
        re.sub(r"\s+", " ", section_title.strip()).lower(),
    ]
    return "|".join(parts)


def _split_by_headers(body: str, pattern: re.Pattern[str]) -> List[Tuple[str, str]]:
    """Découpe ``body`` par lignes d’en-tête markdown capturées par ``pattern``."""
    if not body or not body.strip():
        return []
    matches = list(pattern.finditer(body))
    if not matches:
        return [("Contenu", body.strip())]
    out: List[Tuple[str, str]] = []
    if matches[0].start() > 0:
        pre = body[: matches[0].start()].strip()
        if pre:
            out.append(("Préambule", pre))
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        chunk = body[start:end].strip()
        if chunk:
            out.append((title, chunk))
    return out if out else [("Contenu", body.strip())]


def _entity_blocks_for_type(type_key: str, type_body: str) -> List[Tuple[str, str]]:
    """Sous-découpe un type GDD : ## = entité (ou bloc unique)."""
    blocks = _split_by_headers(type_body, _RE_H2)
    if len(blocks) == 1 and blocks[0][0] == "Contenu":
        label = _TYPE_DISPLAY.get(type_key, type_key)
        return [(label, blocks[0][1])]
    return blocks


def _sections_for_entity_block(_entity_label: str, block_body: str) -> List[Tuple[str, str]]:
    """Sous-sections ### dans un bloc entité ; sinon un seul « Contenu »."""
    subs = _split_by_headers(block_body, _RE_H3)
    return subs if subs else [("Contenu", (block_body or "").strip())]


def _system_prompt_looks_like_xml(system_text: str) -> bool:
    """True si le bloc système ressemble au XML produit par ``PromptEngine`` (pas aux en-têtes ###)."""
    st = (system_text or "").lstrip()
    if st.startswith("<?xml"):
        return True
    head = (system_text or "")[:1200].lower()
    return "<prompt" in head or "<dialogue" in head or "<context" in head


def compute_context_section_usage_result(
    stored_prompt: str,
    stored_response: str,
    *,
    request_id: Optional[str] = None,
    reflected_threshold_percent: float = REFLECTED_THRESHOLD_PERCENT,
) -> Dict[str, Any]:
    """Construit le rapport d’usage par section à persister sur ``LLMUsageRecord``.

    Args:
        stored_prompt: Prompt persisté (système + marqueur ``--- Input ---``).
        stored_response: Réponse brute LLM.
        request_id: Identifiant de corrélation (optionnel).
        reflected_threshold_percent: Seuil « reflété » (aligné Story 3.6).

    Returns:
        Dict JSON-serialisable : groupes par entité, sections reflected/weak, métadonnées.
    """
    t0 = time.perf_counter()
    system_text, _ = split_prompt_system_input(stored_prompt or "")
    generated_text = extract_generated_plain_text(stored_response or "")
    gen_words = tokenize_words_for_overlap(generated_text)

    parser_note: Optional[str] = None
    if _system_prompt_looks_like_xml(system_text):
        parser_note = (
            "prompt_system_xml: le découpage Personnages/Lieux/… repose sur des lignes « ### Type » ; "
            "avec un prompt système XML, l’analyse retourne souvent un seul bloc « Contexte » jusqu’à "
            "alignement du format stocké avec le découpeur markdown."
        )

    typed_bodies = slice_gdd_type_bodies(system_text)
    entity_groups: List[Dict[str, Any]] = []
    weak_sections_flat: List[Dict[str, Any]] = []
    reflected_sections_flat: List[Dict[str, Any]] = []

    for type_key, type_body in typed_bodies.items():
        for entity_label, entity_body in _entity_blocks_for_type(type_key, type_body):
            section_entries: List[Dict[str, Any]] = []
            for sec_title, sec_body in _sections_for_entity_block(entity_label, entity_body):
                excerpt = sec_body if len(sec_body) <= EXCERPT_MAX_LEN else sec_body[: EXCERPT_MAX_LEN - 1] + "…"
                cw = tokenize_words_for_overlap(sec_body)
                pct = overlap_percent_sets(cw, gen_words) if cw else 0.0
                status = "reflected" if pct >= reflected_threshold_percent else "weak"
                section_key = _slug_key(type_key, entity_label, sec_title)
                entry = {
                    "section_key": section_key,
                    "section_title": sec_title,
                    "excerpt": excerpt,
                    "overlap_percent": pct,
                    "status": status,
                }
                section_entries.append(entry)
                flat = {
                    "entity_type": type_key,
                    "entity_label": entity_label,
                    **entry,
                }
                if status == "weak":
                    weak_sections_flat.append(flat)
                else:
                    reflected_sections_flat.append(flat)
            entity_groups.append(
                {
                    "entity_type": type_key,
                    "entity_label": entity_label,
                    "sections": section_entries,
                }
            )

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    computed_at = datetime.now(UTC).isoformat()

    result: Dict[str, Any] = {
        "method": SECTION_USAGE_METHOD,
        "computation_ms": elapsed_ms,
        "computed_at": computed_at,
        "entity_groups": entity_groups,
        "weak_sections": weak_sections_flat,
        "reflected_sections": reflected_sections_flat,
        "weak_section_count": len(weak_sections_flat),
        "reflected_section_count": len(reflected_sections_flat),
        "reflected_threshold_percent": reflected_threshold_percent,
    }
    if request_id is not None:
        result["request_id"] = request_id
    if parser_note is not None:
        result["parser_note"] = parser_note
    return result

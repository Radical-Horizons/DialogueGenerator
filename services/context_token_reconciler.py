"""Réconciliation des tokenCount sur une PromptStructure contexte GDD.

Un seul encodage tiktoken sur le texte sérialisé ; chaque token est attribué à
exactement une feuille (section de fiche, en-tête catégorie, etc.). Les totaux
parents sont la somme des enfants ; ``metadata.totalTokens`` = somme des sections.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, List, Optional, TYPE_CHECKING

from services.context_truncator import ContextTruncator, get_shared_truncator

if TYPE_CHECKING:
    from models.prompt_structure import PromptStructure

RawContentToText = Callable[[Any], str]


@dataclass(frozen=True)
class _CharSpan:
    """Plage [start, end) dans le texte sérialisé final (après strip)."""

    start: int
    end: int
    target: Any


class _SerializeBuffer:
    """Reproduit ``TextSerializer.serialize`` tout en enregistrant les offsets."""

    def __init__(self) -> None:
        self._parts: List[str] = []
        self._targets: List[Any | None] = []

    def append(self, part: str, target: Any | None = None) -> None:
        """Ajoute un fragment (équivalent à ``text_parts.append``)."""
        self._parts.append(part)
        self._targets.append(target)

    def build(self) -> tuple[str, List[_CharSpan]]:
        """Retourne le texte final (avec ``strip``) et les plages ajustées."""
        raw = "\n".join(self._parts)
        stripped = raw.strip()
        spans = _parts_to_spans(self._parts, self._targets, raw, stripped)
        return stripped, spans


def _parts_to_spans(
    parts: List[str],
    targets: List[Any | None],
    raw: str,
    stripped: str,
) -> List[_CharSpan]:
    """Calcule les plages caractères de chaque fragment dans ``stripped``."""
    if not parts:
        return []

    spans: List[_CharSpan] = []
    pos = 0
    for index, (part, target) in enumerate(zip(parts, targets)):
        sep_start: Optional[int] = None
        if index > 0:
            sep_start = pos
            pos += 1

        pos += len(part)

        if target is None:
            continue

        if not part and sep_start is not None:
            spans.append(_CharSpan(sep_start, pos, target))
        elif part:
            span_start = sep_start if sep_start is not None else (pos - len(part))
            spans.append(_CharSpan(span_start, pos, target))

    if raw == stripped:
        return spans

    left_trim = len(raw) - len(raw.lstrip())
    right_bound = len(raw.rstrip())
    adjusted: List[_CharSpan] = []
    for span in spans:
        new_start = max(span.start, left_trim)
        new_end = min(span.end, right_bound)
        if new_start < new_end:
            adjusted.append(
                _CharSpan(
                    start=new_start - left_trim,
                    end=new_end - left_trim,
                    target=span.target,
                )
            )
    return adjusted


def _serialize_with_spans(
    prompt_structure: "PromptStructure",
    raw_content_to_text: RawContentToText,
) -> tuple[str, List[_CharSpan]]:
    """Sérialise une structure et collecte les plages caractères par nœud."""
    buffer = _SerializeBuffer()

    for section in prompt_structure.sections:
        if section.type == "system_prompt":
            buffer.append(section.content, section)
        elif section.type == "context":
            if section.title:
                buffer.append(f"\n--- {section.title} ---", section)
            if section.categories:
                for category in section.categories:
                    buffer.append(f"\n--- {category.title} ---", category)
                    for item in category.items:
                        buffer.append(f"--- {item.name} ---", item)
                        for item_section in item.sections:
                            buffer.append(f"--- {item_section.title} ---", item_section)
                            content = item_section.content
                            if (not content) and getattr(item_section, "raw_content", None):
                                content = raw_content_to_text(item_section.raw_content)
                            buffer.append(content, item_section)
                            buffer.append("", item_section)
            elif section.content:
                buffer.append(section.content, section)
        else:
            if section.title:
                buffer.append(f"\n--- {section.title} ---", section)
            buffer.append(section.content, section)

    return buffer.build()


def _assign_leaf_token_counts(
    text: str,
    leaf_spans: List[_CharSpan],
    truncator: ContextTruncator,
) -> int:
    """Attribue chaque token du texte à une feuille ; retourne le total tiktoken."""
    if not text:
        for span in leaf_spans:
            if hasattr(span.target, "tokenCount"):
                span.target.tokenCount = 0
        return 0

    total_tokens = truncator.count_tokens(text)
    if not truncator.tokenizer:
        _assign_leaf_token_counts_proportional(text, leaf_spans, total_tokens)
        return total_tokens

    counts: dict[int, int] = {}
    pos = 0

    for token_id in truncator.tokenizer.encode(text):
        piece = truncator.tokenizer.decode([token_id])
        token_start = pos
        token_end = pos + len(piece)
        pos = token_end

        chosen: Optional[_CharSpan] = None
        for span in leaf_spans:
            overlap_start = max(token_start, span.start)
            overlap_end = min(token_end, span.end)
            if overlap_start < overlap_end:
                chosen = span
                break

        if chosen is None and leaf_spans:
            for span in reversed(leaf_spans):
                if span.end <= token_start:
                    chosen = span
                    break
            if chosen is None:
                chosen = leaf_spans[0]

        if chosen is None:
            continue

        key = id(chosen.target)
        counts[key] = counts.get(key, 0) + 1

    for span in leaf_spans:
        if hasattr(span.target, "tokenCount"):
            span.target.tokenCount = counts.get(id(span.target), 0)

    return total_tokens


def _assign_leaf_token_counts_proportional(
    text: str,
    leaf_spans: List[_CharSpan],
    total_tokens: int,
) -> None:
    """Répartition proportionnelle à la longueur si tiktoken est indisponible."""
    if not leaf_spans:
        return
    text_len = len(text) or 1
    assigned = 0
    for index, span in enumerate(leaf_spans):
        span_len = max(0, span.end - span.start)
        if index == len(leaf_spans) - 1:
            count = total_tokens - assigned
        else:
            count = int(total_tokens * (span_len / text_len))
            assigned += count
        if hasattr(span.target, "tokenCount"):
            span.target.tokenCount = count


def _rollup_token_counts(prompt_structure: "PromptStructure") -> int:
    """Recalcule les totaux parents comme sommes des enfants."""
    grand_total = 0

    for section in prompt_structure.sections:
        if section.type == "system_prompt":
            section.tokenCount = int(section.tokenCount or 0)
            grand_total += section.tokenCount
            continue

        if section.categories:
            section_header = int(section.tokenCount or 0)
            categories_total = 0
            for category in section.categories:
                category_header = int(category.tokenCount or 0)
                items_total = 0
                for item in category.items:
                    item_header = int(item.tokenCount or 0)
                    sections_total = sum(int(s.tokenCount or 0) for s in item.sections)
                    item.tokenCount = item_header + sections_total
                    items_total += item.tokenCount
                category.tokenCount = category_header + items_total
                categories_total += category.tokenCount
            section.tokenCount = section_header + categories_total
            grand_total += section.tokenCount
            continue

        section.tokenCount = int(section.tokenCount or 0)
        grand_total += section.tokenCount

    prompt_structure.metadata.totalTokens = grand_total
    return grand_total


def _fold_section_header_into_categories(prompt_structure: "PromptStructure") -> None:
    """Inclut les tokens d'en-tête de section dans la 1re catégorie (affichage UI aplati)."""
    for section in prompt_structure.sections:
        if not section.categories:
            continue
        categories_sum = sum(int(category.tokenCount or 0) for category in section.categories)
        overhead = int(section.tokenCount or 0) - categories_sum
        if overhead > 0:
            first = section.categories[0]
            first.tokenCount = int(first.tokenCount or 0) + overhead


def reconcile_prompt_structure_token_counts(
    prompt_structure: "PromptStructure",
    *,
    truncator: ContextTruncator | None = None,
    raw_content_to_text: RawContentToText | None = None,
) -> "PromptStructure":
    """Sérialise, compte une fois, aligne feuilles + agrégats sur le même total.

    Args:
        prompt_structure: Structure construite par ``build_context_json``.
        truncator: Compteur de tokens (singleton partagé par défaut).
        raw_content_to_text: Convertisseur ``raw_content`` (injecté pour tests).

    Returns:
        La même structure, mutée in-place, avec ``tokenCount`` cohérents.
    """
    if raw_content_to_text is None:
        from services.context_serializer.text_serializer import TextSerializer

        raw_content_to_text = TextSerializer._raw_content_to_text

    trunc = truncator or get_shared_truncator()
    text, leaf_spans = _serialize_with_spans(prompt_structure, raw_content_to_text)
    total_tokens = _assign_leaf_token_counts(text, leaf_spans, trunc)
    rolled = _rollup_token_counts(prompt_structure)
    delta = total_tokens - rolled
    if delta != 0:
        for section in reversed(prompt_structure.sections):
            section.tokenCount = int(section.tokenCount or 0) + delta
            break

    _fold_section_header_into_categories(prompt_structure)
    prompt_structure.metadata.totalTokens = total_tokens
    return prompt_structure

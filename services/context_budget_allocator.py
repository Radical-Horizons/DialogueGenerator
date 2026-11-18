"""Répartition du budget de tokens du contexte GDD entre les fiches sélectionnées.

Sans répartition, le contexte sérialisé était coupé depuis la fin : la première fiche
(souvent le PNJ, très longue) consommait tout le budget et le PJ, le lieu de la scène et
l'exemple de dialogue n'arrivaient jamais au LLM. Ici, chaque fiche prioritaire reçoit sa
part avant les autres (partage max-min : une fiche courte garde tout, le reste se partage
entre les longues), puis chaque fiche trop longue est raccourcie par la fin, champ par champ.
"""
from __future__ import annotations

import copy
import logging
from typing import Any, Callable, Iterable, List, Optional, Sequence, Tuple

from services.context_serializer.text_serializer import TextSerializer

logger = logging.getLogger(__name__)

TokenCounter = Callable[[str], int]

# Catégories toujours prioritaires : le lieu et la voix d'exemple ancrent la scène.
PRIORITY_CATEGORY_TYPES: frozenset[str] = frozenset({"locations", "dialogues_examples"})

_EXCERPT_MARK = " … (extrait)"
# En deçà, couper un champ au milieu ne laisse qu'un fragment sans valeur : on s'arrête avant.
_MIN_PARTIAL_FIELD_TOKENS = 20


def _normalize(name: str) -> str:
    """Clé de comparaison de noms (casse, espaces, apostrophes typographiques)."""
    return " ".join(name.replace("’", "'").split()).casefold()


def _section_lines(item_section: Any) -> List[Tuple[str, str]]:
    """Champs d'une section de fiche sous forme ``(libellé, texte)`` dans l'ordre d'affichage."""
    raw_content = getattr(item_section, "raw_content", None)
    content = getattr(item_section, "content", None)
    if not content and isinstance(raw_content, dict):
        return [
            (str(label), TextSerializer._raw_content_to_text({label: value}))
            for label, value in raw_content.items()
        ]
    text = content or TextSerializer._raw_content_to_text(raw_content)
    return [("", text)] if text else []


def _item_text(item: Any) -> str:
    """Texte d'une fiche tel que ``TextSerializer`` le rend (marqueurs compris)."""
    parts = [f"--- {item.name} ---"]
    for item_section in item.sections:
        parts.append(f"--- {item_section.title} ---")
        parts.extend(text for _, text in _section_lines(item_section))
        parts.append("")
    return "\n".join(parts)


def _fair_shares(sizes: Sequence[int], budget: int) -> List[int]:
    """Partage max-min : chaque fiche reçoit ``min(sa taille, part égale du reste)``."""
    shares = [0] * len(sizes)
    remaining = max(0, budget)
    order = sorted(range(len(sizes)), key=lambda i: sizes[i])
    for position, index in enumerate(order):
        share = remaining // (len(order) - position)
        shares[index] = min(sizes[index], share)
        remaining -= shares[index]
    return shares


def _cut_text(text: str, max_tokens: int, count_tokens: TokenCounter) -> str:
    """Raccourcit ``text`` à environ ``max_tokens`` en coupant sur un espace."""
    if max_tokens <= 0:
        return ""
    total = count_tokens(text)
    if total <= max_tokens:
        return text
    cut = text[: max(1, len(text) * max_tokens // total)]
    while cut and count_tokens(cut + _EXCERPT_MARK) > max_tokens:
        cut = cut[: int(len(cut) * 0.9)]
    last_space = cut.rfind(" ")
    if last_space > len(cut) * 0.8:
        cut = cut[:last_space]
    return cut.rstrip() + _EXCERPT_MARK if cut.strip() else ""


def _trim_item(item: Any, allowance: int, count_tokens: TokenCounter) -> Any:
    """Copie de la fiche réduite à ``allowance`` tokens (sections et champs gardés dans l'ordre)."""
    from models.prompt_structure import ItemSection

    # La marque d'extrait est réservée d'avance : elle doit toujours tenir dans la part.
    remaining = allowance - count_tokens(f"--- {item.name} ---") - count_tokens(_EXCERPT_MARK)
    kept_sections: List[Any] = []
    for item_section in item.sections:
        header_cost = count_tokens(f"--- {item_section.title} ---")
        if remaining - header_cost <= 0:
            break
        remaining -= header_cost
        kept: List[str] = []
        for _, text in _section_lines(item_section):
            cost = count_tokens(text)
            if cost <= remaining:
                kept.append(text)
                remaining -= cost
                continue
            if remaining >= _MIN_PARTIAL_FIELD_TOKENS:
                partial = _cut_text(text, remaining, count_tokens)
                if partial:
                    kept.append(partial)
            remaining = 0
            break
        if kept:
            body = "\n".join(kept)
            kept_sections.append(
                ItemSection(
                    title=item_section.title,
                    content=body,
                    raw_content=None,
                    tokenCount=count_tokens(body),
                )
            )
        if remaining <= 0:
            break
    if kept_sections and not kept_sections[-1].content.endswith(_EXCERPT_MARK):
        last = kept_sections[-1]
        last.content += _EXCERPT_MARK
        last.tokenCount = count_tokens(last.content)
    trimmed = copy.copy(item)
    trimmed.sections = kept_sections
    trimmed.tokenCount = sum(s.tokenCount or 0 for s in kept_sections)
    return trimmed


def _context_categories(structured_context: Any) -> Iterable[Any]:
    """Catégories de fiches GDD du contexte structuré."""
    for section in getattr(structured_context, "sections", None) or []:
        yield from getattr(section, "categories", None) or []


def allocate_context_budget(
    structured_context: Any,
    max_tokens: int,
    *,
    priority_names: Sequence[Optional[str]],
    count_tokens: TokenCounter,
) -> Any:
    """Répartit ``max_tokens`` entre les fiches et raccourcit celles qui dépassent leur part.

    Args:
        structured_context: ``PromptStructure`` issu du ContextBuilder.
        max_tokens: Budget du bloc contexte.
        priority_names: Fiches servies en premier (PNJ qui parle, PJ).
        count_tokens: Compteur de tokens (celui de la troncature finale).

    Returns:
        Le contexte d'origine s'il tient dans le budget, sinon une copie réduite.
    """
    categories = list(_context_categories(structured_context))
    entries = [(category, item) for category in categories for item in category.items]
    if not entries or max_tokens <= 0:
        return structured_context

    full_text = TextSerializer().serialize(structured_context)
    total = count_tokens(full_text)
    if total <= max_tokens:
        return structured_context

    sizes = [count_tokens(_item_text(item)) for _, item in entries]
    overhead = max(0, total - sum(sizes))
    available = max(0, max_tokens - overhead)
    wanted = {_normalize(name) for name in priority_names if name}

    def is_priority(category: Any, item: Any) -> bool:
        real_name = (getattr(item, "metadata", None) or {}).get("real_name") or ""
        return (
            getattr(category, "type", "") in PRIORITY_CATEGORY_TYPES
            or _normalize(item.name or "") in wanted
            or _normalize(real_name) in wanted
        )

    first = [i for i, (category, item) in enumerate(entries) if is_priority(category, item)]
    rest = [i for i in range(len(entries)) if i not in first]
    allowances = [0] * len(entries)
    first_shares = _fair_shares([sizes[i] for i in first], available)
    for index, share in zip(first, first_shares):
        allowances[index] = share
    leftover = available - sum(first_shares)
    for index, share in zip(rest, _fair_shares([sizes[i] for i in rest], leftover)):
        allowances[index] = share

    allocated = copy.deepcopy(structured_context)
    budget_by_entry = iter(zip(sizes, allowances))
    for category in _context_categories(allocated):
        kept_items: List[Any] = []
        for item in category.items:
            size, allowance = next(budget_by_entry)
            if allowance >= size:
                kept_items.append(item)
                continue
            logger.debug("Budget contexte : %s réduite de %d à %d tokens", item.name, size, allowance)
            if allowance > 0:
                kept_items.append(_trim_item(item, allowance, count_tokens))
        category.items = kept_items
    for section in getattr(allocated, "sections", None) or []:
        if getattr(section, "categories", None):
            section.categories = [c for c in section.categories if c.items]
    return allocated

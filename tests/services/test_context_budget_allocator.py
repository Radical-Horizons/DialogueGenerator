"""Répartition du budget de contexte entre fiches (PNJ, PJ, lieu, exemple d'abord)."""
from __future__ import annotations

from typing import Dict, List

from models.prompt_structure import (
    ContextCategory,
    ContextItem,
    ItemSection,
    PromptMetadata,
    PromptSection,
    PromptStructure,
)
from services.context_budget_allocator import _fair_shares, allocate_context_budget
from services.context_serializer.text_serializer import TextSerializer


def count_words(text: str) -> int:
    """Compteur de tokens déterministe pour les tests : un mot = un token."""
    return len(text.split())


def make_item(name: str, words: int, fields: int = 4) -> ContextItem:
    """Fiche de ``fields`` champs totalisant environ ``words`` mots."""
    per_field = max(1, words // fields)
    raw: Dict[str, str] = {
        f"Champ {i}": " ".join(f"{name.split()[0].lower()}{i}_{j}" for j in range(per_field))
        for i in range(fields)
    }
    return ContextItem(
        id=name,
        name=name,
        sections=[ItemSection(title="IDENTITÉ", content="", raw_content=raw)],
        metadata={"real_name": name},
    )


def make_context(categories: Dict[str, List[ContextItem]]) -> PromptStructure:
    """Contexte structuré minimal avec les catégories données."""
    return PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CONTEXTE GÉNÉRAL DE LA SCÈNE",
                content="",
                categories=[
                    ContextCategory(type=kind, title=kind.upper(), items=items)
                    for kind, items in categories.items()
                ],
            )
        ],
        metadata=PromptMetadata(totalTokens=0, generatedAt="2026-11-18T00:00:00Z"),
    )


def item_names(structure: PromptStructure) -> List[str]:
    """Noms des fiches présentes, dans l'ordre."""
    return [item.name for c in structure.sections[0].categories or [] for item in c.items]


def test_context_under_budget_is_returned_untouched() -> None:
    """Sous le budget, le contexte n'est ni copié ni raccourci."""
    context = make_context({"characters": [make_item("Pnj Parle", 40)]})

    assert allocate_context_budget(context, 1000, priority_names=["Pnj Parle"], count_tokens=count_words) is context


def test_long_speaker_sheet_no_longer_crowds_out_pc_location_and_example() -> None:
    """Une fiche PNJ énorme ne prive plus le PJ, le lieu et l'exemple de leur part."""
    context = make_context(
        {
            "characters": [make_item("Pnj Parle", 3000), make_item("Pj Joue", 100), make_item("Figurant Tire", 400)],
            "locations": [make_item("Lieu Scene", 1500)],
            "dialogues_examples": [make_item("Exemple Dialogue", 800)],
        }
    )

    allocated = allocate_context_budget(
        context, 1200, priority_names=["Pnj Parle", "Pj Joue"], count_tokens=count_words
    )

    names = item_names(allocated)
    assert names == ["Pnj Parle", "Pj Joue", "Lieu Scene", "Exemple Dialogue"]
    assert count_words(TextSerializer().serialize(allocated)) <= 1200
    texts = {item.name: TextSerializer().serialize(make_context({"x": [item]})) for c in allocated.sections[0].categories or [] for item in c.items}
    assert "pj3_" in texts["Pj Joue"]
    assert all(count_words(text) > 150 for name, text in texts.items() if name != "Pj Joue")


def test_trimmed_sheet_keeps_its_first_fields_and_marks_the_cut() -> None:
    """Une fiche raccourcie garde ses premiers champs et signale l'extrait."""
    context = make_context({"characters": [make_item("Pnj Parle", 400)]})

    allocated = allocate_context_budget(context, 120, priority_names=["Pnj Parle"], count_tokens=count_words)

    text = TextSerializer().serialize(allocated)
    assert "pnj0_0" in text and "pnj3_" not in text
    assert "(extrait)" in text
    assert count_words(text) <= 120


def test_original_context_is_not_mutated() -> None:
    """La répartition travaille sur une copie : le contexte source reste intact."""
    context = make_context({"characters": [make_item("Pnj Parle", 400), make_item("Autre Pnj", 400)]})
    before = context.model_dump()

    allocate_context_budget(context, 100, priority_names=["Pnj Parle"], count_tokens=count_words)

    assert context.model_dump() == before


def test_fair_shares_give_short_sheets_everything_and_split_the_rest() -> None:
    """Partage max-min : la fiche courte garde tout, les longues se partagent le reste."""
    assert _fair_shares([100, 3000, 1500], 1000) == [100, 450, 450]
    assert _fair_shares([10, 20], 1000) == [10, 20]
    assert _fair_shares([], 1000) == []

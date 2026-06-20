"""Tests pour la réconciliation des tokenCount contexte GDD."""
from __future__ import annotations

from datetime import datetime

import pytest

from core.context.context_builder import ContextBuilder
from models.prompt_structure import (
    ContextCategory,
    ContextItem,
    ItemSection,
    PromptMetadata,
    PromptSection,
    PromptStructure,
)
from services.context_token_reconciler import reconcile_prompt_structure_token_counts
from services.context_truncator import get_shared_truncator


@pytest.fixture
def context_builder() -> ContextBuilder:
    """ContextBuilder avec GDD chargé."""
    builder = ContextBuilder()
    builder.load_gdd_files()
    if not builder.get_characters_names():
        pytest.skip("GDD personnages indisponible")
    return builder


@pytest.mark.unit
def test_reconcile_simple_structure_matches_serialized_total() -> None:
    """Somme des sections = metadata.totalTokens = tiktoken(texte sérialisé)."""
    structure = PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CONTEXTE GÉNÉRAL DE LA SCÈNE",
                content="",
                categories=[
                    ContextCategory(
                        type="characters",
                        title="CHARACTERS",
                        items=[
                            ContextItem(
                                id="char_1",
                                name="Alice",
                                sections=[
                                    ItemSection(
                                        title="IDENTITÉ",
                                        content="Nom: Alice\nEspèce: Humain",
                                    ),
                                    ItemSection(
                                        title="CARACTÉRISATION",
                                        content="Personnage courageux.",
                                    ),
                                ],
                            )
                        ],
                    )
                ],
            )
        ],
        metadata=PromptMetadata(
            totalTokens=0,
            generatedAt=datetime.now().isoformat(),
            organizationMode="narrative",
        ),
    )

    reconcile_prompt_structure_token_counts(structure)
    truncator = get_shared_truncator()
    from services.context_serializer.text_serializer import TextSerializer

    text = TextSerializer().serialize(structure)
    expected = truncator.count_tokens(text)

    section = structure.sections[0]
    category = section.categories[0]
    item = category.items[0]

    assert structure.metadata.totalTokens == expected
    assert sum(s.tokenCount or 0 for s in structure.sections) == structure.metadata.totalTokens
    assert (item.tokenCount or 0) >= sum(sec.tokenCount or 0 for sec in item.sections)


@pytest.mark.integration
def test_build_context_json_token_sum_equals_total(context_builder: ContextBuilder) -> None:
    """build_context_json : catégories + sections roulent vers metadata.totalTokens."""
    names = context_builder.get_characters_names()[:1]
    if not names:
        pytest.skip("Aucun personnage")
    locs = context_builder.get_locations_names()[:1] if context_builder.get_locations_names() else []

    result = context_builder.build_context_json(
        selected_elements={"characters": names, "locations": locs},
        scene_instruction="Test",
        organization_mode="narrative",
        max_tokens=100_000,
    )

    text = context_builder.serialize_context_to_text(result)
    tiktoken_total = context_builder._count_tokens(text)
    assert result.metadata.totalTokens == tiktoken_total

    context_sections = [s for s in result.sections if s.categories]
    assert sum(s.tokenCount or 0 for s in result.sections) == result.metadata.totalTokens

    for section in context_sections:
        assert sum(cat.tokenCount or 0 for cat in (section.categories or [])) == (
            section.tokenCount or 0
        )
        for category in section.categories or []:
            items_sum = sum(item.tokenCount or 0 for item in category.items)
            assert (category.tokenCount or 0) >= items_sum
            for item in category.items:
                sections_sum = sum(sec.tokenCount or 0 for sec in item.sections)
                assert (item.tokenCount or 0) >= sections_sum

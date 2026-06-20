"""Régression : le corps narratif ``sections.<slug>`` ne doit pas être écrasé par ``section_titles``."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.context.context_builder import ContextBuilder

_GENKA_PATH = Path("data/GDD_categories/personnages/1a16e4d2-1b45-8093-89ad-eae2e28f9b31.json")


@pytest.fixture
def shard_record() -> dict:
    """Fiche type export Notion shard (propriétés + corps par slug)."""
    return {
        "Nom": "Test PNJ",
        "values": {"Alias": "Alias", "Type": "PNJ"},
        "section_titles": {
            "biographie": "Biographie",
            "contexte": "Contexte",
        },
        "sections": {
            "biographie": "Corps biographie long " * 200,
            "contexte": "Corps contexte narratif " * 50,
            "re_sume__de_la_fiche": "Résumé court de la fiche.",
        },
        "notion_page_id": "page-id-test",
    }


def test_deduplicator_drops_section_titles_when_body_present(shard_record: dict) -> None:
    """Les libellés UI ne doivent pas rester dans les chemins de contexte."""
    from services.context_serializer.deduplicator import FieldDeduplicator

    dedup = FieldDeduplicator()
    fields = [
        "Nom",
        "sections.biographie",
        "sections.contexte",
        "section_titles.biographie",
        "section_titles.contexte",
        "notion_page_id",
    ]
    result = dedup.deduplicate_fields(fields, shard_record)
    assert "sections.biographie" in result
    assert "sections.contexte" in result
    assert "section_titles.biographie" not in result
    assert "section_titles.contexte" not in result
    assert "notion_page_id" not in result


def test_build_context_includes_section_body_not_titles(shard_record: dict) -> None:
    """Le prompt structuré contient le texte des sections, pas seulement leur titre."""
    builder = ContextBuilder()
    builder.load_gdd_files()
    construction = builder._context_construction_service
    assert construction is not None
    from services.context_organizer import ContextOrganizer

    organizer = ContextOrganizer()

    item = construction._build_context_item(
        element_data=shard_record,
        element_type="character",
        element_label="PNJ",
        idx=1,
        name="Test PNJ",
        filtered_fields=None,
        field_labels_map={},
        organization_mode="narrative",
        element_mode="full",
        organizer=organizer,
    )
    assert item is not None
    serialized = json.dumps(
        [s.model_dump() for s in item.sections],
        ensure_ascii=False,
    )
    assert "Corps biographie long" in serialized
    assert "Corps contexte narratif" in serialized
    assert '"Biographie": "Biographie"' not in serialized
    assert '"Contexte": "Contexte"' not in serialized
    assert (item.tokenCount or 0) > 500


@pytest.mark.skipif(not _GENKA_PATH.is_file(), reason="Fiche Genka Lien absente du disque")
def test_genka_lien_full_mode_includes_narrative_body() -> None:
    """Fiche réelle : le contexte doit dépasser largement le seul métadonnées Notion."""
    builder = ContextBuilder()
    builder.load_gdd_files()
    selection = {
        "characters": ["Genka Lien"],
        "_element_modes": {"characters": {"Genka Lien": "full"}},
    }
    structured = builder.build_context_json(
        selected_elements=selection,
        scene_instruction="",
        organization_mode="narrative",
        max_tokens=300_000,
        include_dialogue_type=True,
        element_modes={"characters": {"Genka Lien": "full"}},
    )
    text = builder.serialize_context_to_text(structured)
    assert "Genka naît" in text or "Naissance aux Entrailles" in text
    tokens = builder._count_tokens(text)
    assert tokens > 10_000, f"attendu >10k tokens narratifs, obtenu {tokens}"

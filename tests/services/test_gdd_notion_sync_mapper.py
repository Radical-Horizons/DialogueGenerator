"""Tests mapper Notion → GDD (propriétés, filtrage vide)."""
from __future__ import annotations

from services.gdd_notion_sync_mapper import (
    database_id_is_compact_table_export,
    database_id_should_skip_page_blocks,
    is_record_empty_for_sync,
    notion_page_to_compact_row_record,
    notion_page_to_gdd_record,
    notion_page_to_gdd_record_merge_body_and_properties,
    properties_to_general_text,
)


def test_properties_to_general_text_skips_title_duplicate() -> None:
    text = properties_to_general_text(
        {
            "Name": {
                "type": "title",
                "title": [{"plain_text": "Titre", "type": "text"}],
            },
            "Niveau": {
                "type": "select",
                "select": {"name": "Rare"},
            },
        }
    )
    assert "Titre" not in text
    assert "**Name**" not in text
    assert "Niveau" in text
    assert "Rare" in text


def test_notion_page_to_gdd_record_body_only_in_general() -> None:
    """Mapper de base : corps seul dans _general (pas de propriétés)."""
    page = {
        "properties": {
            "Terme": {
                "type": "title",
                "title": [{"plain_text": "Alteir", "type": "text"}],
            },
            "Glossaire": {
                "type": "rich_text",
                "rich_text": [{"plain_text": "Monde", "type": "text"}],
            },
        }
    }
    rec = notion_page_to_gdd_record(page, "")
    assert rec["Nom"] == "Alteir"
    assert rec["sections"]["_general"] == ""
    assert "Glossaire" not in rec["sections"]["_general"]


def test_notion_page_to_gdd_record_merge_always_includes_properties() -> None:
    """Sync : propriétés toujours dans _general (corps vide ici)."""
    page = {
        "properties": {
            "Terme": {
                "type": "title",
                "title": [{"plain_text": "Alteir", "type": "text"}],
            },
            "Glossaire": {
                "type": "rich_text",
                "rich_text": [{"plain_text": "Monde", "type": "text"}],
            },
        }
    }
    rec = notion_page_to_gdd_record_merge_body_and_properties(page, "")
    assert rec["Nom"] == "Alteir"
    assert rec["values"] == {"Glossaire": "Monde"}
    assert "Glossaire" in rec["sections"]["_general"]
    assert "Monde" in rec["sections"]["_general"]


def test_notion_page_to_gdd_record_merge_body_then_properties() -> None:
    """Sync : corps et propriétés concaténés dans _general."""
    page = {
        "properties": {
            "Titre": {
                "type": "title",
                "title": [{"plain_text": "Fiche", "type": "text"}],
            },
            "Type": {
                "type": "select",
                "select": {"name": "Quête"},
            },
        }
    }
    rec = notion_page_to_gdd_record_merge_body_and_properties(page, "Intro narrative.")
    gen = rec["sections"]["_general"]
    assert rec["values"] == {"Type": "Quête"}
    assert gen.startswith("Intro narrative.")
    assert "Quête" in gen
    assert "Type" in gen


def test_is_record_empty_for_sync() -> None:
    assert is_record_empty_for_sync(
        {"Nom": "SansTitre", "sections": {"_general": ""}}
    )
    assert not is_record_empty_for_sync(
        {"Nom": "SansTitre", "sections": {"_general": "x"}}
    )
    assert not is_record_empty_for_sync(
        {"Nom": "Bob", "sections": {"_general": ""}}
    )
    assert not is_record_empty_for_sync(
        {"Nom": "SansTitre", "values": {"Col": "v"}, "sections": {"_general": ""}}
    )


def test_notion_page_to_compact_row_record() -> None:
    page = {
        "properties": {
            "Nom": {
                "type": "title",
                "title": [{"plain_text": "Entrée", "type": "text"}],
            },
            "Score": {"type": "number", "number": 3},
        }
    }
    rec = notion_page_to_compact_row_record(page)
    assert rec["Nom"] == "Entrée"
    assert rec["values"] == {"Score": "3"}
    assert "Score" in rec["sections"]["_general"]
    assert "3" in rec["sections"]["_general"]


def test_database_id_should_skip_page_blocks_vocab() -> None:
    for uid in (
        "2d16e4d2-1b45-8016-ba74-ccb4fbd92b72",
        "22c6e4d2-1b45-8066-b17c-c2af998de0b8",
        "935bdaad-d395-4cdb-be6b-7f7f9a6789d2",
        "10f87005-d58e-46cc-94dc-580b4be9a5cd",
        "0e4cee6a-0546-456a-b49d-5592f553cc9a",
    ):
        assert database_id_should_skip_page_blocks(uid)
        assert database_id_is_compact_table_export(uid)
    assert not database_id_should_skip_page_blocks(
        "1886e4d2-1b45-8039-b51b-eb3826fce1b5"
    )

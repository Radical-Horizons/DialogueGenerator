"""Tests mapper Notion → GDD (propriétés, filtrage vide)."""
from __future__ import annotations

from services.gdd_notion_sync_mapper import (
    database_id_is_compact_table_export,
    database_id_should_skip_page_blocks,
    is_record_empty_for_sync,
    markdown_body_to_sync_sections,
    notion_page_to_compact_row_record,
    notion_page_to_gdd_record,
    notion_page_to_gdd_record_merge_body_and_properties,
    properties_to_general_text,
    rich_text_properties_as_markdown_sections,
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


def test_markdown_body_to_sync_sections_splits_headings() -> None:
    body = "Intro line\n## Part A\nAAA\n## Part B\nBBB"
    sections, titles = markdown_body_to_sync_sections(body)
    assert sections["preamble"] == "Intro line"
    assert "AAA" in sections["part_a"]
    assert titles["preamble"] == "Préambule"
    assert titles["part_a"] == "Part A"


def test_notion_page_to_gdd_record_body_only_split_sections() -> None:
    """Corps seul : sections par slug, pas de colonnes dans le texte."""
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
    assert rec["sections"] == {}
    assert "section_titles" not in rec
    assert "Glossaire" not in str(rec.get("sections"))


def test_rich_text_properties_as_markdown_sections() -> None:
    md = rich_text_properties_as_markdown_sections(
        {
            "Z": {"type": "rich_text", "rich_text": [{"plain_text": "last", "type": "text"}]},
            "A": {"type": "rich_text", "rich_text": [{"plain_text": "first", "type": "text"}]},
        }
    )
    assert md.startswith("## A")
    assert "first" in md
    assert "## Z" in md
    assert "last" in md


def test_notion_page_to_gdd_record_merge_rich_text_columns_into_sections() -> None:
    """Colonnes ``rich_text`` aussi dans ``sections`` (titres ``##``) en plus de ``values``."""
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
    assert "glossaire" in rec["sections"]
    assert "Monde" in rec["sections"]["glossaire"]


def test_notion_page_to_gdd_record_merge_body_split_no_prop_blob() -> None:
    """Corps découpé ; colonnes absentes du markdown agrégé."""
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
    rec = notion_page_to_gdd_record_merge_body_and_properties(
        page, "## Intro\nIntro narrative.\n## Suite\nMore."
    )
    assert rec["values"] == {"Type": "Quête"}
    assert "intro" in rec["sections"]
    assert "Intro narrative" in rec["sections"]["intro"]
    assert "suite" in rec["sections"]
    assert "Quête" not in "".join(rec["sections"].values())
    assert rec["section_titles"]["intro"] == "Intro"


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
    assert not is_record_empty_for_sync(
        {"Nom": "SansTitre", "sections": {"preamble": "hello"}, "values": {}}
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
    assert rec["sections"] == {}


def test_database_id_should_skip_page_blocks_vocab() -> None:
    for uid in (
        "2d16e4d2-1b45-8016-ba74-ccb4fbd92b72",
        "22c6e4d2-1b45-8066-b17c-c2af998de0b8",
        "935bdaad-d395-4cdb-be6b-7f7f9a6789d2",
        "10f87005-d58e-46cc-94dc-580b4be9a5cd",
        "0e4cee6a-0546-456a-b49d-5592f553cc9a",
        "5a3b2abf-221b-40c1-9b2a-98c91e13dfd9",
        "75ab57dc-e48c-4172-8cab-d48f45bda04e",
        "09204171-5d4d-40e8-9237-d7bac6a5c1a0",
    ):
        assert database_id_should_skip_page_blocks(uid)
        assert database_id_is_compact_table_export(uid)
    assert not database_id_should_skip_page_blocks(
        "1886e4d2-1b45-8039-b51b-eb3826fce1b5"
    )

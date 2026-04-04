"""Tests pour le découpage virtuel de ``sections._general`` (markdown Notion)."""
from __future__ import annotations

from services.gdd_sections_split import (
    extract_gdd_field_value,
    extract_virtual_sections_general_path,
    split_sections_general_text,
)


class TestSplitSectionsGeneralText:
    """Tests de ``split_sections_general_text``."""

    def test_empty_returns_empty_list(self) -> None:
        """Une entrée vide ne produit aucun bloc."""
        assert split_sections_general_text("") == []
        assert split_sections_general_text("   ") == []

    def test_single_heading_one_chunk(self) -> None:
        """Sans préambule, un seul titre produit un bloc."""
        text = "## Only\nBody line"
        chunks = split_sections_general_text(text)
        assert len(chunks) == 1
        slug, title, body = chunks[0]
        assert slug == "only"
        assert title == "Only"
        assert "Body line" in body

    def test_preamble_and_two_headings(self) -> None:
        """Préambule + deux titres → trois blocs distincts."""
        preamble = "Intro " * 10
        text = f"{preamble}\n## Alpha\nFirst\n## Beta\nSecond"
        chunks = split_sections_general_text(text)
        assert len(chunks) == 3
        slugs = [c[0] for c in chunks]
        assert slugs == ["preamble", "alpha", "beta"]

    def test_heading_without_space_after_hashes(self) -> None:
        """Titres du type ``##Titre`` (sans espace) sont reconnus."""
        preamble = "Pad " * 12
        text = f"{preamble}\n##Compact\nLine1\n###Sub\nLine2"
        chunks = split_sections_general_text(text)
        assert len(chunks) == 3
        assert chunks[1][0] == "compact"
        assert chunks[2][0] == "sub"


class TestExtractGddFieldValue:
    """Tests de ``extract_gdd_field_value``."""

    def test_virtual_path_returns_subsection_body(self) -> None:
        """Un chemin ``sections._general.<slug>`` renvoie le corps découpé."""
        md = "Pad " * 15 + "\n## Part A\nAAA\n## Part B\nBBB"
        data = {"Nom": "X", "sections": {"_general": md}}
        assert extract_gdd_field_value(data, "sections._general.part_a") == "AAA"
        assert extract_gdd_field_value(data, "sections._general.part_b") == "BBB"

    def test_classic_nested_path_still_works(self) -> None:
        """Les chemins non virtuels restent résolus par navigation dict."""
        data = {"Nom": "N", "Background": {"Histoire": "H"}}
        assert extract_gdd_field_value(data, "Background.Histoire") == "H"

    def test_sections_general_monolith_when_no_virtual_match(self) -> None:
        """Sans slug virtuel, ``sections._general`` reste la chaîne complète."""
        data = {"sections": {"_general": "whole blob"}}
        assert extract_gdd_field_value(data, "sections._general") == "whole blob"

    def test_extract_virtual_explicit_none_for_bad_slug(self) -> None:
        """Slug inconnu : pas de valeur virtuelle."""
        md = "Pad " * 15 + "\n## X\nY"
        data = {"sections": {"_general": md}}
        assert extract_virtual_sections_general_path(data, "sections._general.nope") is None

    def test_virtual_path_flat_slug_sections_post_sync(self) -> None:
        """Sync Notion : ``sections[slug]`` sans monolithe ``_general``."""
        data = {
            "Nom": "PNJ",
            "sections": {"preamble": "Ligne A", "guides": "Ligne B"},
            "section_titles": {"preamble": "Préambule", "guides": "Guides"},
        }
        assert extract_gdd_field_value(data, "sections._general.preamble") == "Ligne A"
        assert extract_gdd_field_value(data, "sections._general.guides") == "Ligne B"


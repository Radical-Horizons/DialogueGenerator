"""Catalogue de traits Unity construit depuis les bases Notion Qualités et Défauts."""
from __future__ import annotations

from scripts.generate_unity_catalogs_from_gdd import trait_pairs


def test_each_quality_is_paired_with_its_opposite_flaw() -> None:
    """La relation « Défaut opposé » forme l'axe, quel que soit le format de l'UUID."""
    qualities = [
        {"Nom": "Courageuse", "notion_page_id": "q1", "values": {"Défaut opposé": "AB-CD"}},
        {"Nom": "Patiente", "notion_page_id": "q2", "values": {"Défaut opposé": "ef01"}},
    ]
    flaws = [
        {"Nom": "Lâche", "notion_page_id": "abcd"},
        {"Nom": "Impatiente", "notion_page_id": "EF01"},
    ]

    assert trait_pairs(qualities, flaws) == [
        ("Courageuse", "Lâche", "Caractère"),
        ("Patiente", "Impatiente", "Caractère"),
    ]


def test_unpaired_traits_stay_in_the_catalog_with_one_pole() -> None:
    """Un trait sans opposé reste au catalogue : l'axe incomplet se complète dans Notion."""
    qualities = [{"Nom": "Lucide", "notion_page_id": "q1", "values": {}}]
    flaws = [{"Nom": "Colérique", "notion_page_id": "f1"}]

    assert trait_pairs(qualities, flaws) == [
        ("", "Colérique", "Caractère"),
        ("Lucide", "", "Caractère"),
    ]

"""Tests catalogue tests d'attribut Unity."""
from __future__ import annotations

from pathlib import Path

import pytest

from services.skill_check_catalog import (
    load_attribute_entries,
    load_skill_entries,
    unity_token_from_label,
)


def test_unity_token_from_label_removes_spaces() -> None:
    assert unity_token_from_label("Création d'artefacts") == "Créationd'artefacts"
    assert unity_token_from_label("Armes de Poing") == "ArmesdePoing"


def test_unity_token_from_label_prefers_export_id() -> None:
    assert unity_token_from_label("Armes de Poing", "ArmesDePoing") == "ArmesDePoing"


def test_load_attribute_entries_has_eight_canonical() -> None:
    entries = load_attribute_entries()
    assert len(entries) == 8
    assert entries[0].id == entries[0].label
    assert any(entry.id == "Intelligence" for entry in entries)


def test_load_skill_entries_from_fixture_csv(tmp_path: Path) -> None:
    csv_path = tmp_path / "SkillCatalog.csv"
    csv_path.write_text(
        "Compétence,Famille,ID export\n"
        "Rhétorique,Culturel,\n"
        "Armes de Poing,Technologique,ArmesDePoing\n",
        encoding="utf-8",
    )
    entries = load_skill_entries(csv_path)
    by_id = {entry.id: entry.label for entry in entries}
    assert by_id["Rhétorique"] == "Rhétorique"
    assert by_id["ArmesDePoing"] == "Armes de Poing"


@pytest.mark.parametrize(
    "label,expected_prefix",
    [
        ("Rhétorique", "Rh"),
        ("Architecture", "Arch"),
    ],
)
def test_real_skill_catalog_contains_common_skills(label: str, expected_prefix: str) -> None:
    entries = load_skill_entries()
    if not entries:
        pytest.skip("SkillCatalog.csv absent")
    ids = {entry.id for entry in entries}
    assert label in ids
    assert any(entry.id.startswith(expected_prefix) for entry in entries)

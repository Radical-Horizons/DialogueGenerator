"""Tests existence entité GDD sur disque (Story 3.9)."""
from __future__ import annotations

import json
from pathlib import Path

from services.gdd_category_entity_lookup import live_gdd_entity_exists


def test_live_gdd_entity_exists_known_category(tmp_path: Path) -> None:
    gdd = tmp_path / "data" / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "personnages.json").write_text(
        json.dumps({"personnages": [{"Nom": "Héros", "sections": {}}]}),
        encoding="utf-8",
    )
    assert live_gdd_entity_exists(tmp_path, "personnages", "Héros") is True
    assert live_gdd_entity_exists(tmp_path, "personnages", "Autre") is False


def test_live_gdd_entity_exists_arbitrary_monolith(tmp_path: Path) -> None:
    gdd = tmp_path / "data" / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "custom_cat.json").write_text(
        json.dumps([{"Nom": "Ent1"}]),
        encoding="utf-8",
    )
    assert live_gdd_entity_exists(tmp_path, "custom_cat", "Ent1") is True


def test_live_gdd_entity_exists_folded_list_shard_dir(tmp_path: Path) -> None:
    """Stem avec accents (ex. Systèmes_de_jeu) → répertoire shard ASCII (systemes_de_jeu)."""
    gdd = tmp_path / "data" / "GDD_categories"
    sd = gdd / "systemes_de_jeu"
    sd.mkdir(parents=True)
    (sd / "2be6e4d2-1b45-807c-bb2b-ee22e7209042.json").write_text(
        json.dumps({"Nom": "Tests"}),
        encoding="utf-8",
    )
    assert live_gdd_entity_exists(tmp_path, "Systèmes_de_jeu", "Tests") is True
    assert live_gdd_entity_exists(tmp_path, "Systèmes_de_jeu", "Absent") is False

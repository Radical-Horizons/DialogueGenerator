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

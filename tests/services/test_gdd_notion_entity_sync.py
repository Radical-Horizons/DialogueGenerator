"""Tests résolution et sync ciblée entité GDD Notion."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.gdd_notion_entity_sync import (
    find_notion_page_id_on_disk,
    resolve_canonical_name,
    resolve_entity_page,
)


@pytest.fixture
def gdd_root(tmp_path: Path) -> Path:
    root = tmp_path / "GDD_categories"
    (root / "personnages").mkdir(parents=True)
    shard = root / "personnages" / "1996e4d2-1b45-80c4-9c73-ddac6322e9bd.json"
    shard.write_text(
        json.dumps({"Nom": "Uresaïr", "notion_page_id": "1996e4d2-1b45-80c4-9c73-ddac6322e9bd"}),
        encoding="utf-8",
    )
    return root


def test_resolve_canonical_name_fuzzy_typo(gdd_root: Path) -> None:
    """Typo légère → nom canonique Uresaïr."""
    resolved = resolve_canonical_name(gdd_root, "personnages", "Uresair")
    assert resolved == "Uresaïr"


def test_find_notion_page_id_on_disk(gdd_root: Path) -> None:
    hit = find_notion_page_id_on_disk(gdd_root, "personnages", "Uresaïr")
    assert hit is not None
    page_id, rel = hit
    assert page_id == "1996e4d2-1b45-80c4-9c73-ddac6322e9bd"
    assert rel == "personnages/1996e4d2-1b45-80c4-9c73-ddac6322e9bd.json"


def test_resolve_entity_page_from_disk(gdd_root: Path) -> None:
    resolution = resolve_entity_page(gdd_root, "Personnages.json", "Uresair")
    assert resolution.notion_page_id == "1996e4d2-1b45-80c4-9c73-ddac6322e9bd"
    assert resolution.resolved_name == "Uresaïr"
    assert resolution.matched_from == "disk"

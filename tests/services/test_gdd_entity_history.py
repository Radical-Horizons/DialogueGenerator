"""Tests historique entités GDD (Story 3.9)."""
from pathlib import Path

from services.gdd_entity_history import (
    diff_snapshots_json,
    entity_history_path,
    load_entity_history,
    record_entity_change,
)


def test_record_and_load_entity_history(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    record_entity_change(
        repo,
        "personnages",
        "Héros Test",
        {"Nom": "Héros Test", "sections": {}},
        source="notion_sync",
        recorded_at="2026-01-01T00:00:00+00:00",
    )
    path = entity_history_path(repo, "personnages", "Héros Test")
    assert path.exists()
    hist = load_entity_history(repo, "personnages", "Héros Test")
    assert len(hist) == 1
    assert hist[0]["source"] == "notion_sync"
    assert hist[0]["snapshot"]["Nom"] == "Héros Test"


def test_diff_snapshots_json() -> None:
    d = diff_snapshots_json({"a": 1}, {"a": 2})
    assert "@@" in d or ("-" in d and "+" in d)


def test_diff_identical() -> None:
    s = {"x": 1}
    assert "aucun changement" in diff_snapshots_json(s, s).lower()

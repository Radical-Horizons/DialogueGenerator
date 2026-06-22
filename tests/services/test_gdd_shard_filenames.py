"""Tests noms de fichiers shards GDD (nom + UUID, legacy)."""
from __future__ import annotations

import json
from pathlib import Path

from services.gdd_shard_filenames import (
    build_gdd_shard_filename,
    legacy_shard_paths_for_page,
    notion_page_id_from_shard_stem,
    sanitize_shard_nom_stem,
    write_gdd_shard_atomic,
)

PID = "1996e4d2-1b45-80c4-9c73-ddac6322e9bd"


def test_build_gdd_shard_filename_uses_nom_and_uuid() -> None:
  fname = build_gdd_shard_filename("Uresaïr", PID)
  assert fname == f"Uresair_{PID}.json"


def test_notion_page_id_from_shard_stem_legacy_and_new() -> None:
  assert notion_page_id_from_shard_stem(PID) == PID
  assert notion_page_id_from_shard_stem(f"Uresair_{PID}") == PID
  assert notion_page_id_from_shard_stem("not_a_uuid") is None


def test_write_gdd_shard_atomic_removes_legacy_uuid_file(tmp_path: Path) -> None:
  shard_dir = tmp_path / "personnages"
  shard_dir.mkdir()
  legacy = shard_dir / f"{PID}.json"
  legacy.write_text(json.dumps({"Nom": "Uresaïr"}), encoding="utf-8")
  record = {"Nom": "Uresaïr", "notion_page_id": PID, "sections": {}}
  target = write_gdd_shard_atomic(shard_dir, record, PID)
  assert target.is_file()
  assert target.name == f"Uresair_{PID}.json"
  assert not legacy.is_file()
  assert len(list(shard_dir.glob("*.json"))) == 1


def test_legacy_shard_paths_for_page_matches_content(tmp_path: Path) -> None:
  shard_dir = tmp_path / "lieux"
  shard_dir.mkdir()
  orphan = shard_dir / "old_name.json"
  orphan.write_text(
      json.dumps({"Nom": "Lieu", "notion_page_id": PID}),
      encoding="utf-8",
  )
  keep = build_gdd_shard_filename("Lieu", PID)
  stale = legacy_shard_paths_for_page(shard_dir, PID, keep_filename=keep)
  assert orphan in stale


def test_sanitize_shard_nom_stem_fallback() -> None:
  assert sanitize_shard_nom_stem("   ") == "fiche"

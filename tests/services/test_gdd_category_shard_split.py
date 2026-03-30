"""Tests découpage monolithe → shards GDD."""
import json
from pathlib import Path

import pytest

from services.gdd_category_shard_split import split_category_to_shards


def test_split_category_writes_shard_files(tmp_path: Path) -> None:
    pid = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"
    mono = tmp_path / "lieux.json"
    mono.write_text(
        json.dumps(
            {
                "lieux": [
                    {"Nom": "Ville", "notion_page_id": pid},
                    {"Nom": "Forêt"},
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    n = split_category_to_shards(tmp_path, "lieux", dry_run=False)
    assert n == 2
    shard_dir = tmp_path / "lieux"
    assert (shard_dir / f"{pid}.json").is_file()
    assert len(list(shard_dir.glob("*.json"))) == 2


def test_split_category_dry_run_no_files(tmp_path: Path) -> None:
    mono = tmp_path / "quetes.json"
    mono.write_text(
        json.dumps({"quetes": [{"Nom": "Q1"}]}, ensure_ascii=False),
        encoding="utf-8",
    )
    n = split_category_to_shards(tmp_path, "quetes", dry_run=True)
    assert n == 1
    assert not (tmp_path / "quetes").exists()


def test_split_category_rejects_non_list(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="non-liste"):
        split_category_to_shards(tmp_path, "structure_macro")

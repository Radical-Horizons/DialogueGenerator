"""Tests écriture atomique JSON."""
import json
from pathlib import Path

from services.gdd_notion_atomic_io import read_json_file, write_json_atomic


def test_write_json_atomic_roundtrip(tmp_path: Path) -> None:
    p = tmp_path / "sub" / "data.json"
    write_json_atomic(p, {"a": 1, "b": [2, 3]})
    assert p.exists()
    assert not (tmp_path / "sub" / "data.json.tmp").exists()
    data = json.loads(p.read_text(encoding="utf-8"))
    assert data["a"] == 1


def test_read_json_file_default(tmp_path: Path) -> None:
    p = tmp_path / "missing.json"
    assert read_json_file(p, default=[]) == []

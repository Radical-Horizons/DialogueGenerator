"""Tests export Markdown NotebookLM depuis le GDD local."""
from __future__ import annotations

import json
import uuid
import zipfile
from io import BytesIO
from pathlib import Path

from services.gdd_notebooklm_export import (
    build_gdd_notebooklm_zip_bytes,
    build_notebooklm_markdown_parts,
    eligible_sync_category_files,
)


def _nid() -> str:
    return str(uuid.uuid4())


def test_eligible_disk_category_files_ignores_included_filter(tmp_path: Path) -> None:
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "A.json").write_text("[]", encoding="utf-8")
    (gdd / "B.json").write_text("[]", encoding="utf-8")
    settings = {
        "sources": [
            {"kind": "database", "category_file": "A.json", "notion_id": _nid()},
            {"kind": "page", "category_file": "B.json", "notion_id": _nid()},
            {"kind": "database", "category_file": "C.json", "notion_id": _nid()},
        ],
        "included_categories": ["A.json"],
    }
    from services.gdd_notebooklm_export import eligible_disk_category_files

    assert eligible_disk_category_files(settings, gdd) == ["A.json", "B.json"]


def test_build_zip_disk_scope_includes_all_on_disk_despite_included_filter(tmp_path: Path) -> None:
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "A.json").write_text(
        json.dumps([{"Nom": "A1", "sections": {"x": "y"}}], ensure_ascii=False),
        encoding="utf-8",
    )
    (gdd / "B.json").write_text(
        json.dumps([{"Nom": "B1", "sections": {"x": "z"}}], ensure_ascii=False),
        encoding="utf-8",
    )
    settings = {
        "sources": [
            {"kind": "database", "category_file": "A.json", "notion_id": _nid()},
            {"kind": "page", "category_file": "B.json", "notion_id": _nid()},
        ],
        "included_categories": ["A.json"],
    }
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
        export_scope="disk",
    )
    body = "\n".join(t for _, t in parts)
    assert "A1" in body and "B1" in body
    parts_sync = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
        export_scope="sync",
    )
    body_sync = "\n".join(t for _, t in parts_sync)
    assert "A1" in body_sync
    assert "B1" not in body_sync


def test_eligible_sync_category_files_respects_included() -> None:
    settings = {
        "sources": [
            {"kind": "database", "category_file": "A.json", "notion_id": _nid()},
            {"kind": "page", "category_file": "B.json", "notion_id": _nid()},
            {"kind": "database", "category_file": "C.json", "notion_id": _nid()},
        ],
        "included_categories": ["A.json"],
    }
    assert eligible_sync_category_files(settings) == ["A.json"]


def test_build_zip_contains_markdown_and_vision(tmp_path: Path) -> None:
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "Pitch.json").write_text(
        json.dumps(
            [
                {
                    "Nom": "Pitch",
                    "sections": {"x": "Hello"},
                    "section_titles": {"x": "Intro"},
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    (data_dir / "Vision.json").write_text(
        json.dumps({"ok": True}, ensure_ascii=False),
        encoding="utf-8",
    )
    settings = {
        "sources": [
            {
                "kind": "page",
                "category_file": "Pitch.json",
                "notion_id": _nid(),
            }
        ],
        "included_categories": [],
    }
    raw = build_gdd_notebooklm_zip_bytes(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
    )
    zf = zipfile.ZipFile(BytesIO(raw))
    names = zf.namelist()
    md_names = [n for n in names if n.endswith(".md")]
    assert 1 <= len(md_names) <= 128
    assert not any(n.endswith("00-README.md") for n in names)
    # Pitch page → bucket production (fallback), seul fichier du ZIP
    prod = next(n for n in names if "production" in n)
    body = zf.read(prod).decode("utf-8")
    assert "Pitch" in body
    assert "Hello" in body
    assert '"ok": true' in body
    assert "Export GDD (NotebookLM)" in body


def test_small_themes_merge_into_fewer_files(tmp_path: Path) -> None:
    """Les volets < 120 Ko sont fusionnés avec le thème suivant."""
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    for fname, nom in (("Musiques.json", "M1"), ("Pitch.json", "P1")):
        (gdd / fname).write_text(
            json.dumps([{"Nom": nom, "sections": {"a": "x" * 500}}], ensure_ascii=False),
            encoding="utf-8",
        )
    settings = {
        "sources": [
            {"kind": "page", "category_file": "Musiques.json", "notion_id": _nid()},
            {"kind": "page", "category_file": "Pitch.json", "notion_id": _nid()},
        ],
        "included_categories": [],
    }
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
    )
    assert len(parts) == 1
    name, body = parts[0]
    assert "art-audio" in name
    assert "production" in name
    assert "P1" in body and "M1" in body


def test_oversized_bucket_emits_part_files_without_truncation(tmp_path: Path) -> None:
    """Catégorie monolithique (``Pitch.json``) : pas de dossier shard ``personnages/``."""
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    pad = "x" * 25_000
    records = [{"Nom": f"R{i}", "sections": {"a": pad}} for i in range(30)]
    (gdd / "Pitch.json").write_text(
        json.dumps(records, ensure_ascii=False),
        encoding="utf-8",
    )
    settings = {
        "sources": [
            {
                "kind": "page",
                "category_file": "Pitch.json",
                "notion_id": _nid(),
            }
        ],
        "included_categories": [],
    }
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=128,
        max_chars_per_part=80_000,
    )
    names = [n for n, _ in parts]
    assert any(n.startswith("08-production-et-autres-part") for n in names), names
    assert all("Export tronqué" not in t for _, t in parts)
    raw = build_gdd_notebooklm_zip_bytes(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=128,
    )
    zf = zipfile.ZipFile(BytesIO(raw))
    md_all = "".join(zf.read(n).decode("utf-8") for n in zf.namelist() if n.endswith(".md"))
    assert "Export tronqué" not in md_all

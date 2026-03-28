"""Tests module archive / miroir sync GDD Notion."""
from pathlib import Path

import pytest

from services.gdd_notion_sync_mirror import (
    archive_gdd_snapshot,
    archive_gdd_snapshot_if_delta,
    collect_sync_targets,
    gdd_live_matches_snapshot_dir,
    list_gdd_archives,
    partial_errors_block_mirror_promote,
    prune_archives,
    resolve_archive_dir,
    restore_gdd_from_archive,
)


def test_partial_errors_block_mirror_promote_fetch() -> None:
    assert partial_errors_block_mirror_promote(["lieux.json: fetch — timeout"]) is True


def test_partial_errors_block_mirror_promote_write() -> None:
    assert partial_errors_block_mirror_promote(["x.json: écriture — disk full"]) is True


def test_partial_errors_block_mirror_promote_page_error() -> None:
    assert partial_errors_block_mirror_promote(["x.json page abc: HTTP 500"]) is True


def test_partial_errors_block_mirror_promote_ignored_page_ok() -> None:
    assert (
        partial_errors_block_mirror_promote(
            ["x page abc: ignorée (corps et colonnes vides)"]
        )
        is False
    )


def test_partial_errors_block_mirror_promote_empty_ok() -> None:
    assert partial_errors_block_mirror_promote([]) is False


def test_collect_sync_targets_shard_and_file(tmp_path: Path) -> None:
    root = tmp_path / "gdd"
    root.mkdir()
    t = collect_sync_targets(
        root,
        ["Personnages.json", "vocab.json"],
    )
    assert (root / "personnages").resolve() in t
    assert (root / "vocab.json").resolve() in t


def test_prune_archives_keeps_newest(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    arch = gdd / ".archive"
    arch.mkdir(parents=True)
    (arch / "20240101T000000Z_aaaaaaaa").mkdir()
    (arch / "20250101T000000Z_bbbbbbbb").mkdir()
    prune_archives(gdd, keep=1)
    sub = {p.name for p in arch.iterdir() if p.is_dir()}
    assert len(sub) == 1
    assert "20250101" in next(iter(sub))


def test_list_gdd_archives_skips_junk_and_sorts(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    arch = gdd / ".archive"
    (arch / "not-a-valid-name").mkdir(parents=True)
    (arch / "20260201T000000Z_aaaaaaaa").mkdir()
    (arch / "20260202T000000Z_bbbbbbbb").mkdir()
    rows = list_gdd_archives(gdd, limit=10)
    assert [r.id for r in rows] == ["20260202T000000Z_bbbbbbbb", "20260201T000000Z_aaaaaaaa"]


def test_resolve_archive_dir_rejects_invalid(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    (gdd / ".archive").mkdir(parents=True)
    with pytest.raises(ValueError):
        resolve_archive_dir(gdd, "../evil")
    with pytest.raises(ValueError):
        resolve_archive_dir(gdd, "nope")


def test_restore_gdd_from_archive_removes_orphan(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    gdd.mkdir()
    pd = gdd / "personnages"
    pd.mkdir()
    (pd / "keep.json").write_text('{"Nom":"K"}', encoding="utf-8")
    snap = archive_gdd_snapshot(gdd)
    (pd / "orphan.json").write_text('{"Nom":"O"}', encoding="utf-8")
    restore_gdd_from_archive(gdd, snap, backup_current=False, retention_count=None)
    assert (pd / "keep.json").is_file()
    assert not (pd / "orphan.json").exists()


def test_restore_gdd_from_archive_backup_current(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    gdd.mkdir()
    (gdd / "data.json").write_text("one", encoding="utf-8")
    snap = archive_gdd_snapshot(gdd)
    (gdd / "data.json").write_text("two", encoding="utf-8")
    before = {p.name for p in (gdd / ".archive").iterdir() if p.is_dir()}
    rel = restore_gdd_from_archive(
        gdd, snap, backup_current=True, retention_count=10
    )
    assert rel is not None
    after = {p.name for p in (gdd / ".archive").iterdir() if p.is_dir()}
    assert len(after) >= len(before)
    assert (gdd / "data.json").read_text(encoding="utf-8") == "one"


def test_gdd_live_matches_snapshot_dir_detects_delta(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    gdd.mkdir()
    (gdd / "a.json").write_text("x", encoding="utf-8")
    snap = archive_gdd_snapshot(gdd)
    assert gdd_live_matches_snapshot_dir(gdd, snap) is True
    (gdd / "a.json").write_text("y", encoding="utf-8")
    assert gdd_live_matches_snapshot_dir(gdd, snap) is False


def test_archive_gdd_snapshot_if_delta_skips_when_same_as_latest(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    gdd.mkdir()
    (gdd / "x.json").write_text("1", encoding="utf-8")
    first = archive_gdd_snapshot_if_delta(gdd)
    assert first.created_new is True
    dirs_after_first = {p.name for p in (gdd / ".archive").iterdir() if p.is_dir()}
    second = archive_gdd_snapshot_if_delta(gdd)
    assert second.created_new is False
    assert second.archive_rel == first.archive_rel
    dirs_after_second = {p.name for p in (gdd / ".archive").iterdir() if p.is_dir()}
    assert dirs_after_second == dirs_after_first


def test_restore_skips_duplicate_backup_when_live_matches_latest_archive(
    tmp_path: Path,
) -> None:
    gdd = tmp_path / "gdd"
    gdd.mkdir()
    (gdd / "data.json").write_text("one", encoding="utf-8")
    snap = archive_gdd_snapshot(gdd)
    before = {p.name for p in (gdd / ".archive").iterdir() if p.is_dir()}
    rel = restore_gdd_from_archive(
        gdd, snap, backup_current=True, retention_count=10
    )
    assert rel == f".archive/{snap.name}"
    assert {p.name for p in (gdd / ".archive").iterdir() if p.is_dir()} == before

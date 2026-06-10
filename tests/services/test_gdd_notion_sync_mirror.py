"""Tests module archive / miroir sync GDD Notion."""
from pathlib import Path

import pytest

from services.gdd_notion_sync_mirror import (
    archive_gdd_snapshot,
    archive_gdd_snapshot_if_delta,
    collect_sync_targets,
    gdd_live_matches_snapshot_dir,
    is_transient_partial_error_line,
    iter_blocking_partial_errors,
    list_gdd_archives,
    partial_errors_block_mirror_promote,
    partial_errors_should_preserve_mirror_staging,
    prune_archives,
    remove_excluded_database_sources_from_live,
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


def test_iter_blocking_partial_errors_matches_promote_rules() -> None:
    p = [
        "a.json: fetch — timeout",
        "hint: no block",
        "b.json page x: 502",
    ]
    b = iter_blocking_partial_errors(p)
    assert len(b) == 2
    assert "fetch" in b[0]
    assert "502" in b[1]


def test_is_transient_partial_error_line_detects_502_message() -> None:
    assert is_transient_partial_error_line(
        "Table.json page cbcd: Server error '502 Bad Gateway' for url"
    )


def test_partial_errors_should_preserve_mirror_staging_transient_only() -> None:
    partial = [
        "x.json page abc: Server error '502 Bad Gateway' for url 'https://api.notion.com'",
    ]
    assert partial_errors_should_preserve_mirror_staging(partial) is True


def test_partial_errors_should_preserve_false_on_non_transient_page_error() -> None:
    partial = ["x.json page abc: simulated fetch failure"]
    assert partial_errors_should_preserve_mirror_staging(partial) is False


def test_partial_errors_should_preserve_false_on_mixed_errors() -> None:
    partial = [
        "x.json page a: 502",
        "y.json page b: permission denied",
    ]
    assert partial_errors_should_preserve_mirror_staging(partial) is False


def test_remove_excluded_database_sources_from_live_deletes_hors_perimetre(
    tmp_path: Path,
) -> None:
    """``included_categories`` non vide : les bases DB exclues sont retirées du live."""
    gdd = tmp_path / "gdd"
    gdd.mkdir()
    (gdd / "keep.json").write_text("[]", encoding="utf-8")
    (gdd / "drop.json").write_text("[]", encoding="utf-8")
    sources = [
        {"kind": "database", "notion_id": "a", "category_file": "keep.json"},
        {"kind": "database", "notion_id": "b", "category_file": "drop.json"},
        {"kind": "page", "notion_id": "c", "category_file": "Guide.json"},
    ]
    removed = remove_excluded_database_sources_from_live(
        gdd, sources, included_list=["keep"]
    )
    assert "drop.json" in removed
    assert (gdd / "keep.json").is_file()
    assert not (gdd / "drop.json").exists()


def test_remove_excluded_database_sources_noop_when_included_empty(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    gdd.mkdir()
    (gdd / "x.json").write_text("[]", encoding="utf-8")
    sources = [{"kind": "database", "notion_id": "a", "category_file": "x.json"}]
    assert remove_excluded_database_sources_from_live(gdd, sources, []) == []
    assert (gdd / "x.json").is_file()


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


def test_list_gdd_archives_skips_junk_and_empty_snapshots(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    arch = gdd / ".archive"
    (arch / "not-a-valid-name").mkdir(parents=True)
    (arch / "20260201T000000Z_aaaaaaaa").mkdir()
    (arch / "20260202T000000Z_bbbbbbbb").mkdir()
    rows = list_gdd_archives(gdd, limit=10)
    assert rows == []


def test_list_gdd_archives_sorts_nonempty_and_skips_empty(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    arch = gdd / ".archive"
    empty_new = arch / "20260203T000000Z_cccccccc"
    empty_new.mkdir(parents=True)
    old = arch / "20260201T000000Z_aaaaaaaa"
    old.mkdir()
    (old / "one.json").write_text('{"Nom":"A"}', encoding="utf-8")
    newer = arch / "20260202T000000Z_bbbbbbbb"
    newer.mkdir()
    (newer / "two.json").write_text('{"Nom":"B"}', encoding="utf-8")
    rows = list_gdd_archives(gdd, limit=10)
    assert [r.id for r in rows] == ["20260202T000000Z_bbbbbbbb", "20260201T000000Z_aaaaaaaa"]
    assert rows[0].fiche_count == 1


def test_list_gdd_archives_reports_size_and_fiche_counts(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    snap = gdd / ".archive" / "20260203T120000Z_cccccccc"
    snap.mkdir(parents=True)
    (snap / "note.txt").write_text("hello", encoding="utf-8")
    pd = snap / "personnages"
    pd.mkdir()
    (pd / "a.json").write_text('{"Nom":"A"}', encoding="utf-8")
    (pd / "b.json").write_text('{"Nom":"B"}', encoding="utf-8")
    (snap / "lieux.json").write_text(
        '{"lieux": [{"Nom": "L1"}, {"Nom": "L2"}]}',
        encoding="utf-8",
    )
    rows = list_gdd_archives(gdd, limit=5)
    assert len(rows) == 1
    r = rows[0]
    assert r.id == "20260203T120000Z_cccccccc"
    assert r.size_bytes > 0
    assert r.fiche_count == 4


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

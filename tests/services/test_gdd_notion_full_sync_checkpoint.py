"""Tests module checkpoint sync complète GDD Notion."""
from __future__ import annotations

from pathlib import Path

from services.gdd_notion_full_sync_checkpoint import (
    abandon_checkpoint_on_disk,
    compute_sources_fingerprint,
    load_run_manifest,
    prune_staging_runs_keep_only,
    save_run_manifest,
    validate_checkpoint_for_resume,
)
from services.gdd_notion_manifest import GddNotionManifest


def test_compute_sources_fingerprint_stable() -> None:
    """Même config → même empreinte (ordre des clés normalisé)."""
    sources = [
        {"kind": "page", "notion_id": "b", "category_file": "b.json"},
        {"kind": "page", "notion_id": "a", "category_file": "a.json"},
    ]
    fp1 = compute_sources_fingerprint(sources, [])
    fp2 = compute_sources_fingerprint(list(reversed(sources)), [])
    assert fp1 == fp2
    assert len(fp1) == 64


def test_validate_checkpoint_staging_missing(tmp_path: Path) -> None:
    """Reprise refusée si le dossier staging n'existe pas."""
    gdd = tmp_path / "gdd"
    gdd.mkdir()
    sync = tmp_path / "sync"
    sync.mkdir()
    ok, msg = validate_checkpoint_for_resume(
        gdd,
        sync,
        eligible_category_files=["x.json"],
        sources_fingerprint="abc",
    )
    assert ok is False
    assert "aucun checkpoint" in msg.lower()


def test_abandon_checkpoint_prunes_all_staging(tmp_path: Path) -> None:
    """Un seul état incomplet : abandon supprime tout .staging/."""
    gdd = tmp_path / "gdd"
    sync = tmp_path / "sync"
    sync.mkdir()
    (gdd / ".staging" / "run_a").mkdir(parents=True)
    (gdd / ".staging" / "run_b").mkdir(parents=True)
    abandon_checkpoint_on_disk(gdd, sync)
    assert not (gdd / ".staging" / "run_a").exists()
    assert not (gdd / ".staging" / "run_b").exists()


def test_prune_staging_keep_one(tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    (gdd / ".staging" / "keep").mkdir(parents=True)
    (gdd / ".staging" / "drop").mkdir(parents=True)
    n = prune_staging_runs_keep_only(gdd, "keep")
    assert n == 1
    assert (gdd / ".staging" / "keep").is_dir()
    assert not (gdd / ".staging" / "drop").exists()


def test_manifest_roundtrip_sidecar(tmp_path: Path) -> None:
    """Sidecar manifeste charge/save cohérent."""
    p = tmp_path / "run_m.json"
    m = GddNotionManifest()
    m.set_edited("page-1", "2025-01-02T00:00:00.000Z")
    save_run_manifest(p, m)
    m2 = load_run_manifest(p)
    assert m2.entries.get("page-1") == "2025-01-02T00:00:00.000Z"

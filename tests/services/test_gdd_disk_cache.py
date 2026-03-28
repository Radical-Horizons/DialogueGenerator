"""Tests du cache disque GDD (pickle + empreinte fichiers)."""
from __future__ import annotations

import logging
from pathlib import Path

import pytest

from api.utils.gdd_cache import get_gdd_cache
from services.gdd_disk_cache import compute_gdd_fingerprint
from services.gdd_loader import GDDData, GDDLoader


def _make_loader(root: Path) -> GDDLoader:
    cat = root / "data" / "GDD_categories"
    data = root / "data"
    return GDDLoader(
        categories_path=cat,
        import_path=data,
        project_root_dir=root,
        context_builder_dir=root,
    )


@pytest.fixture
def minimal_gdd_tree(tmp_path: Path) -> Path:
    root = tmp_path / "proj"
    cat = root / "data" / "GDD_categories"
    data = root / "data"
    cat.mkdir(parents=True)
    (cat / "personnages.json").write_text('{"personnages": []}', encoding="utf-8")
    (data / "Vision.json").write_text("{}", encoding="utf-8")
    return root


def test_compute_gdd_fingerprint_stable(minimal_gdd_tree: Path) -> None:
    loader = _make_loader(minimal_gdd_tree)
    assert compute_gdd_fingerprint(loader) == compute_gdd_fingerprint(loader)


def test_disk_cache_second_load_uses_pickle(
    monkeypatch: pytest.MonkeyPatch,
    minimal_gdd_tree: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr("services.gdd_disk_cache._disk_cache_enabled", lambda: True)

    caplog.set_level(logging.INFO)
    loader1 = _make_loader(minimal_gdd_tree)
    d1 = loader1.load_all()
    assert isinstance(d1, GDDData)
    snap = minimal_gdd_tree / "data" / ".gdd_snapshot"
    assert (snap / "gdd_data.pkl").is_file()

    caplog.clear()
    loader2 = _make_loader(minimal_gdd_tree)
    d2 = loader2.load_all()
    assert d2.characters == d1.characters
    assert "GDD chargé depuis le cache disque" in caplog.text


def test_disk_cache_invalidates_when_json_changes(
    monkeypatch: pytest.MonkeyPatch,
    minimal_gdd_tree: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr("services.gdd_disk_cache._disk_cache_enabled", lambda: True)

    loader1 = _make_loader(minimal_gdd_tree)
    loader1.load_all()

    caplog.set_level(logging.INFO)
    caplog.clear()
    pj = minimal_gdd_tree / "data" / "GDD_categories" / "personnages.json"
    pj.write_text('{"personnages": [{"Nom": "Zorg"}]}', encoding="utf-8")
    # Sinon le singleton GDDCache peut renvoyer l’ancienne liste (throttle mtime).
    get_gdd_cache().clear()

    loader2 = _make_loader(minimal_gdd_tree)
    d2 = loader2.load_all()
    assert len(d2.characters) == 1
    assert "GDD chargé depuis le cache disque" not in caplog.text

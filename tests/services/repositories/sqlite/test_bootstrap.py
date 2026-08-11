"""Tests du bootstrap SQLite — réinitialisation du reindex FTS bloqué."""

from __future__ import annotations

from pathlib import Path

from services.repositories.sqlite.bootstrap import initialize_database
from services.repositories.sqlite.dialogues_search_repository import (
    DialoguesSearchRepository,
)


def test_stale_running_rebuild_reset_at_startup(tmp_path: Path) -> None:
    """Un ``rebuild_status='running'`` laissé par un crash est réinitialisé
    au prochain démarrage — sinon tout futur reindex renvoie 409 pour
    toujours (CAS durable en base, voir ``try_begin_rebuild``)."""
    database_path = tmp_path / "app.db"

    database = initialize_database(database_path)
    assert database is not None
    try:
        repository = DialoguesSearchRepository(database)
        # Simule un crash serveur en pleine reconstruction de l'index.
        assert repository.try_begin_rebuild() is True
        assert repository.get_stats().rebuild_status == "running"
    finally:
        database.close()

    # Redémarrage du process : `initialize_database` doit nettoyer l'état.
    restarted = initialize_database(database_path)
    assert restarted is not None
    try:
        repository = DialoguesSearchRepository(restarted)
        stats = repository.get_stats()
        assert stats.rebuild_status != "running"
        # Le futur reindex ne doit plus être bloqué par le CAS.
        assert repository.try_begin_rebuild() is True
    finally:
        restarted.close()


def test_idle_rebuild_status_untouched_at_startup(tmp_path: Path) -> None:
    """Un statut ``idle``/``done`` légitime n'est pas altéré au démarrage."""
    database_path = tmp_path / "app.db"

    database = initialize_database(database_path)
    assert database is not None
    try:
        repository = DialoguesSearchRepository(database)
        assert repository.get_stats().rebuild_status == "idle"
    finally:
        database.close()

    restarted = initialize_database(database_path)
    assert restarted is not None
    try:
        repository = DialoguesSearchRepository(restarted)
        assert repository.get_stats().rebuild_status == "idle"
    finally:
        restarted.close()

"""Tests de connexion SQLite partagée."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from services.repositories.sqlite.connection import DatabaseConnection


def test_connection_enables_wal_and_supports_concurrent_reads(tmp_path: Path) -> None:
    """Une connexion partagée active WAL et accepte des lectures concurrentes."""
    database = DatabaseConnection(tmp_path / "app.db")

    assert database.execute_scalar("PRAGMA journal_mode") == "wal"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(database.execute_scalar, ["SELECT 1", "SELECT 1"]))

    assert results == [1, 1]
    database.close()

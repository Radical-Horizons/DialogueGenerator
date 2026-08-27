"""Tests comportementaux du runner de migrations SQLite."""

import os
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from api.main import app

EXPECTED_MIGRATION_VERSIONS = [
    ("001",),
    ("002",),
    ("003",),
    ("004",),
    ("005",),
    ("006",),
    ("007",),
    ("008",),
    ("009",),
    ("010",),
    ("011",),
    ("012",),
]


def test_expected_versions_match_migration_files_on_disk() -> None:
    """Given les .sql du dépôt, when on les liste, then la constante les couvre toutes.

    Garde anti-dérive : ``EXPECTED_MIGRATION_VERSIONS`` est maintenue à la main.
    La migration 011 a été livrée sans y être ajoutée, ce qui n'a échoué que dans
    le test de lifespan — loin de la cause. Ici l'échec nomme le fichier oublié.
    """
    from services.repositories.sqlite.migrations import runner as migrations_runner

    directory = Path(migrations_runner.__file__).parent
    on_disk = sorted(
        migrations_runner.MigrationRunner._version_from_path(path)
        for path in directory.glob("*.sql")
        if migrations_runner._MIGRATION_PATTERN.match(path.name)
    )
    assert on_disk == [version for (version,) in EXPECTED_MIGRATION_VERSIONS]


def test_lifespan_creates_and_reuses_application_database(tmp_path: Path) -> None:
    """Le lifespan crée le schéma initial puis le réutilise au second démarrage."""
    database_path = tmp_path / "app.db"
    environment = {
        "APP_DATABASE": str(database_path),
        "SKIP_STARTUP_CONTEXT_VALIDATION": "true",
        "SKIP_STARTUP_LOG_CLEANUP": "true",
    }

    original_environment = os.environ.copy()
    os.environ.update(environment)
    try:
        with TestClient(app):
            assert database_path.exists()
            with sqlite3.connect(database_path) as connection:
                tables = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    )
                }
                migration_versions = connection.execute(
                    "SELECT version FROM schema_migrations ORDER BY version"
                ).fetchall()
                dialogue_foreign_keys = {
                    (row[3], row[2], row[4], row[6])
                    for row in connection.execute(
                        "PRAGMA foreign_key_list(dialogues_index)"
                    )
                }

            assert {
                "schema_migrations",
                "users",
                "user_settings",
                "app_settings",
                "dialogues_index",
                "dialogue_shares",
                "audit_logs",
                "collections",
                "collection_dialogues",
                "dialogues_search_meta",
                "dialogues_search_fts",
                "template_suggestion_usage",
            } <= tables
            assert migration_versions == EXPECTED_MIGRATION_VERSIONS
            assert dialogue_foreign_keys == {
                ("owner_id", "users", "id", "SET NULL"),
                ("last_modified_by", "users", "id", "SET NULL"),
            }

        with TestClient(app):
            with sqlite3.connect(database_path) as connection:
                for version, in EXPECTED_MIGRATION_VERSIONS:
                    assert connection.execute(
                        "SELECT COUNT(*) FROM schema_migrations WHERE version = ?",
                        (version,),
                    ).fetchone() == (1,)
    finally:
        os.environ.clear()
        os.environ.update(original_environment)

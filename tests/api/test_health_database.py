"""Tests du fail-fast SQLite et du health check associé."""

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.utils.health_check import perform_health_checks
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.migrations.runner import MigrationRunner
from services.repositories.sqlite.state import (
    mark_database_error,
    reset_database_status,
)


def test_invalid_migration_rolls_back_partial_schema(tmp_path: Path) -> None:
    """Une migration SQL invalide ne laisse ni table partielle ni version."""
    migrations_directory = tmp_path / "migrations"
    migrations_directory.mkdir()
    (migrations_directory / "001_broken.sql").write_text(
        "CREATE TABLE partial_table (id INTEGER);\n"
        "THIS IS NOT VALID SQL;\n",
        encoding="utf-8",
    )
    database = DatabaseConnection(tmp_path / "app.db")

    with pytest.raises(sqlite3.Error):
        MigrationRunner(database, migrations_directory).run_pending()

    assert database.execute_scalar(
        "SELECT COUNT(*) FROM sqlite_master "
        "WHERE type = 'table' AND name = 'partial_table'"
    ) == 0
    assert database.execute_scalar(
        "SELECT COUNT(*) FROM schema_migrations"
    ) == 0
    database.close()


def test_database_failure_is_reported_by_health_and_blocks_business_routes(
    tmp_path: Path,
) -> None:
    """Une erreur de boot rend la base unhealthy et bloque les routes métier."""
    database_path = tmp_path / "app.db"
    mark_database_error(database_path, "migration 001 invalide")
    try:
        health = perform_health_checks(detailed=False)
        database_check = next(
            check for check in health["checks"] if check["name"] == "database"
        )

        assert health["status"] == "unhealthy"
        assert database_check["status"] == "unhealthy"
        assert "migration" in database_check["message"].lower()

        response = TestClient(app).get("/api/v1/documents")
        assert response.status_code == 503
        assert "base" in response.json()["error"]["message"].lower()

        auth_response = TestClient(app).post("/api/v1/auth/login", json={})
        assert auth_response.status_code != 503
    finally:
        reset_database_status()

"""Tests de l'isolation SQLite fournie par conftest."""

import os
from pathlib import Path


def test_pytest_uses_temporary_application_database(tmp_path: Path) -> None:
    """Les tests utilisent une base temporaire et non la base de développement."""
    database_path = Path(os.environ["APP_DATABASE"])

    assert database_path.exists()
    assert database_path.name == "app.db"
    assert database_path != Path("data/app.db").resolve()
    assert tmp_path in database_path.parents

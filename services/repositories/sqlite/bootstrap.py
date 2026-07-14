"""Résolution du chemin et initialisation de la base SQLite."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from constants import FilePaths
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.migrations.runner import MigrationRunner
from services.repositories.sqlite.state import (
    mark_database_error,
    mark_database_ready,
)

logger = logging.getLogger(__name__)


def resolve_database_path(project_root: Path | None = None) -> Path:
    """Résout le chemin SQLite canonique ou son override d'environnement."""
    root = project_root or Path(__file__).resolve().parents[3]
    configured_path = os.getenv("APP_DATABASE", "").strip()
    if configured_path:
        path = Path(configured_path).expanduser()
        return path if path.is_absolute() else root / path
    return root / FilePaths.APP_DATABASE


def initialize_database(database_path: Path | None = None) -> DatabaseConnection | None:
    """Crée la connexion, applique les migrations et met à jour l'état global.

    Une erreur de migration est journalisée puis convertie en état indisponible
    afin que le lifespan puisse laisser l'API démarrer pour exposer ``/health``.
    """
    resolved_path = (database_path or resolve_database_path()).resolve()
    database: DatabaseConnection | None = None
    try:
        database = DatabaseConnection(resolved_path)
        runner = MigrationRunner(database)
        applied_versions = runner.run_pending()
        mark_database_ready(resolved_path)
        logger.info(
            "Base SQLite prête: %s (migrations appliquées: %s)",
            resolved_path,
            applied_versions or "aucune",
        )
        return database
    except Exception as exc:
        if database is not None:
            database.close()
        error_message = f"Initialisation SQLite impossible: {exc}"
        mark_database_error(resolved_path, error_message)
        logger.critical("%s (chemin: %s)", error_message, resolved_path, exc_info=True)
        return None

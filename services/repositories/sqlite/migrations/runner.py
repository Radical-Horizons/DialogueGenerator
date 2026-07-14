"""Exécution transactionnelle des migrations SQLite versionnées."""

from __future__ import annotations

import logging
import re
import sqlite3
from pathlib import Path

from services.repositories.sqlite.connection import DatabaseConnection

logger = logging.getLogger(__name__)
_MIGRATION_PATTERN = re.compile(r"^(?P<version>\d+)_.*\.sql$")


class MigrationRunner:
    """Applique les migrations SQL manquantes dans l'ordre numérique."""

    def __init__(
        self,
        database: DatabaseConnection,
        migrations_directory: Path | None = None,
    ) -> None:
        """Initialise le runner.

        Args:
            database: Connexion SQLite à migrer.
            migrations_directory: Répertoire des fichiers ``NNN_*.sql``.
        """
        self.database = database
        self.migrations_directory = migrations_directory or Path(__file__).parent

    def run_pending(self) -> list[str]:
        """Applique les migrations non encore enregistrées.

        Returns:
            Versions appliquées pendant cet appel.

        Raises:
            sqlite3.Error: Si une migration ne peut pas être appliquée.
        """
        migration_paths = self._migration_paths()
        if not migration_paths:
            raise RuntimeError(
                f"Aucune migration SQLite trouvée dans {self.migrations_directory}"
            )

        self.database.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            """
        )
        applied_versions = {
            str(row[0])
            for row in self.database.execute_fetchall(
                "SELECT version FROM schema_migrations"
            )
        }
        applied_now: list[str] = []

        for migration_path in migration_paths:
            version = self._version_from_path(migration_path)
            if version in applied_versions:
                continue
            self._apply_migration(migration_path, version)
            applied_now.append(version)

        return applied_now

    def _migration_paths(self) -> list[Path]:
        """Retourne les migrations SQL valides dans l'ordre."""
        migrations = [
            path
            for path in self.migrations_directory.glob("*.sql")
            if _MIGRATION_PATTERN.match(path.name)
        ]
        versions = [self._version_from_path(path) for path in migrations]
        if len(versions) != len(set(versions)):
            raise ValueError(
                f"Versions de migration SQLite dupliquées dans {self.migrations_directory}"
            )
        return sorted(migrations, key=lambda path: int(self._version_from_path(path)))

    @staticmethod
    def _version_from_path(migration_path: Path) -> str:
        """Extrait la version numérique normalisée du nom de fichier."""
        match = _MIGRATION_PATTERN.match(migration_path.name)
        if match is None:
            raise ValueError(f"Nom de migration invalide: {migration_path.name}")
        return match.group("version").zfill(3)

    def _apply_migration(self, migration_path: Path, version: str) -> None:
        """Applique une migration et l'enregistre atomiquement."""
        sql = migration_path.read_text(encoding="utf-8")
        logger.info("Application de la migration SQLite %s sur %s", version, self.database.database_path)
        try:
            with self.database.transaction() as connection:
                for statement in self._split_sql_script(sql, migration_path):
                    connection.execute(statement)
                connection.execute(
                    "INSERT INTO schema_migrations(version, applied_at) "
                    "VALUES (?, datetime('now'))",
                    (version,),
                )
        except (OSError, sqlite3.Error, ValueError):
            logger.error(
                "Échec de la migration SQLite %s pour %s",
                version,
                self.database.database_path,
                exc_info=True,
            )
            raise

    @staticmethod
    def _split_sql_script(sql: str, migration_path: Path) -> list[str]:
        """Découpe un script SQL en instructions complètes."""
        statements: list[str] = []
        current_lines: list[str] = []
        for line in sql.splitlines():
            if not line.strip() or line.lstrip().startswith("--"):
                continue
            current_lines.append(line)
            candidate = "\n".join(current_lines)
            if sqlite3.complete_statement(candidate):
                statements.append(candidate.strip())
                current_lines = []

        if current_lines:
            raise ValueError(f"Script SQL incomplet: {migration_path}")
        return statements

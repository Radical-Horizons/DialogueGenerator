"""Repository SQLite des réglages applicatifs non secrets."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import TypedDict

from services.repositories.sqlite.connection import DatabaseConnection

ALLOWED_APP_SETTINGS = frozenset({"notion_sync_enabled"})


class AppSettingRecord(TypedDict):
    """Représente un réglage applicatif persisté."""

    key: str
    value: bool
    updated_by: str | None
    updated_at: str


class UnsupportedAppSettingError(ValueError):
    """Signale une clé de réglage absente de la liste blanche."""


class AppSettingsRepository:
    """Persiste uniquement les réglages applicatifs explicitement autorisés."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec la connexion injectée."""
        self.database = database

    def list_all(self) -> list[AppSettingRecord]:
        """Retourne tous les réglages autorisés actuellement persistés."""
        rows = self.database.execute_fetchall(
            """
            SELECT key, value, updated_by, updated_at
            FROM app_settings
            ORDER BY key
            """
        )
        return [
            self._row_to_record(row)
            for row in rows
            if str(row[0]) in ALLOWED_APP_SETTINGS
        ]

    def get(self, key: str) -> AppSettingRecord | None:
        """Retourne un réglage autorisé, ou ``None`` s'il est absent."""
        self._validate_key(key)
        rows = self.database.execute_fetchall(
            """
            SELECT key, value, updated_by, updated_at
            FROM app_settings
            WHERE key = ?
            """,
            (key,),
        )
        return self._row_to_record(rows[0]) if rows else None

    def set(self, key: str, value: bool, updated_by: str | None) -> AppSettingRecord:
        """Crée ou remplace atomiquement un réglage booléen autorisé."""
        self._validate_key(key)
        updated_at = datetime.now(timezone.utc).isoformat()
        with self.database.transaction(immediate=True) as connection:
            connection.execute(
                """
                INSERT INTO app_settings (key, value, updated_by, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at
                """,
                (key, json.dumps(value), updated_by, updated_at),
            )
        return {
            "key": key,
            "value": value,
            "updated_by": updated_by,
            "updated_at": updated_at,
        }

    def delete(self, key: str) -> bool:
        """Supprime un réglage autorisé et indique s'il existait."""
        self._validate_key(key)
        with self.database.transaction(immediate=True) as connection:
            cursor = connection.execute(
                "DELETE FROM app_settings WHERE key = ?",
                (key,),
            )
            return cursor.rowcount > 0

    @staticmethod
    def _validate_key(key: str) -> None:
        """Refuse toute clé hors liste blanche."""
        if key not in ALLOWED_APP_SETTINGS:
            raise UnsupportedAppSettingError(
                f"Réglage applicatif non autorisé: {key}"
            )

    @staticmethod
    def _row_to_record(row: tuple[object, ...]) -> AppSettingRecord:
        """Convertit une ligne SQLite en réglage typé."""
        value = json.loads(str(row[1]))
        if not isinstance(value, bool):
            raise ValueError(f"Valeur booléenne invalide pour le réglage {row[0]}")
        return {
            "key": str(row[0]),
            "value": value,
            "updated_by": str(row[2]) if row[2] is not None else None,
            "updated_at": str(row[3]),
        }

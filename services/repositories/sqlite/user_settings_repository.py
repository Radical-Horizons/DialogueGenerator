"""Repository SQLite des préférences propres à chaque utilisateur."""

from __future__ import annotations

import json
from typing import Any, Final

from services.repositories.sqlite.connection import DatabaseConnection

ALLOWED_USER_SETTING_KEYS: Final[dict[str, frozenset[str]]] = {
    "context": frozenset({"config"}),
    "generation": frozenset({"author_profile", "draft", "slop_detection"}),
}

_UNSET: Final[object] = object()


class UnsupportedUserSettingsNamespaceError(ValueError):
    """Signale un namespace de préférences non autorisé."""


class UnsupportedUserSettingKeyError(ValueError):
    """Signale une clé de préférence non autorisée dans son namespace."""


class UserSettingsRepository:
    """Persiste des valeurs JSON isolées par utilisateur et namespace."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec la connexion injectée."""
        self.database = database

    def get_all(self, user_id: str) -> dict[str, dict[str, Any]]:
        """Retourne toutes les préférences persistées d'un utilisateur."""
        rows = self.database.execute_fetchall(
            """
            SELECT namespace, key, value
            FROM user_settings
            WHERE user_id = ?
            ORDER BY namespace, key
            """,
            (user_id,),
        )
        settings: dict[str, dict[str, Any]] = {}
        for namespace_value, key_value, serialized_value in rows:
            namespace = str(namespace_value)
            key = str(key_value)
            if (
                namespace not in ALLOWED_USER_SETTING_KEYS
                or key not in ALLOWED_USER_SETTING_KEYS[namespace]
            ):
                continue
            parsed = self._parse_json_value(str(serialized_value))
            if parsed is _UNSET:
                continue
            settings.setdefault(namespace, {})[key] = parsed
        return settings

    def get_namespace(self, user_id: str, namespace: str) -> dict[str, Any]:
        """Retourne les préférences d'un namespace pour un utilisateur."""
        self._validate_namespace(namespace)
        rows = self.database.execute_fetchall(
            """
            SELECT key, value
            FROM user_settings
            WHERE user_id = ? AND namespace = ?
            ORDER BY key
            """,
            (user_id, namespace),
        )
        settings: dict[str, Any] = {}
        for key, serialized_value in rows:
            if str(key) not in ALLOWED_USER_SETTING_KEYS[namespace]:
                continue
            parsed = self._parse_json_value(str(serialized_value))
            if parsed is _UNSET:
                continue
            settings[str(key)] = parsed
        return settings

    def upsert_namespace(
        self,
        user_id: str,
        namespace: str,
        settings: dict[str, Any],
    ) -> dict[str, Any]:
        """Insère ou remplace chaque clé fournie sans supprimer les clés omises."""
        self._validate_namespace(namespace)
        self._validate_keys(namespace, settings)
        with self.database.transaction(immediate=True) as connection:
            for key, value in settings.items():
                connection.execute(
                    """
                    INSERT INTO user_settings (user_id, namespace, key, value)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_id, namespace, key) DO UPDATE SET
                        value = excluded.value
                    """,
                    (
                        user_id,
                        namespace,
                        key,
                        json.dumps(value, ensure_ascii=False),
                    ),
                )
        return self.get_namespace(user_id, namespace)

    @staticmethod
    def _parse_json_value(serialized_value: str) -> Any:
        """Parse une valeur JSON ; ignore les entrées corrompues."""
        try:
            return json.loads(serialized_value)
        except json.JSONDecodeError:
            return _UNSET

    @staticmethod
    def _validate_namespace(namespace: str) -> None:
        """Refuse les namespaces absents de la liste blanche."""
        if namespace not in ALLOWED_USER_SETTING_KEYS:
            raise UnsupportedUserSettingsNamespaceError(
                f"Namespace de préférences non autorisé: {namespace}"
            )

    @staticmethod
    def _validate_keys(namespace: str, settings: dict[str, Any]) -> None:
        """Refuse toute clé absente de la liste blanche du namespace."""
        invalid_keys = sorted(set(settings) - ALLOWED_USER_SETTING_KEYS[namespace])
        if invalid_keys:
            raise UnsupportedUserSettingKeyError(
                f"Clé(s) de préférences non autorisée(s): {', '.join(invalid_keys)}"
            )

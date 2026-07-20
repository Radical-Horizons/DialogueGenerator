"""Repository SQLite pour les comptes utilisateurs."""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from typing import Mapping, Protocol, TypedDict
from uuid import uuid4

from services.repositories.sqlite.connection import DatabaseConnection

logger = logging.getLogger(__name__)
SUPPORTED_USER_ROLES = frozenset({"admin", "writer"})


def canonicalize_username(username: str) -> str:
    """Retourne la forme canonique insensible à la casse d'un username."""
    return username.casefold()


class UserRecord(TypedDict):
    """Représente un compte utilisateur persisté dans SQLite."""

    id: str
    username: str
    email: str
    hashed_password: str
    role: str
    is_active: bool
    created_at: str
    updated_at: str


class DuplicateUsernameError(ValueError):
    """Signale qu'un nom d'utilisateur existe déjà."""

    def __init__(self, username: str) -> None:
        """Initialise l'erreur avec le nom d'utilisateur conflictuel."""
        super().__init__(f"Username déjà utilisé: {username}")
        self.username = username


class LastActiveAdminError(RuntimeError):
    """Signale qu'une mutation supprimerait le dernier administrateur actif."""


class IUserRepository(Protocol):
    """Contrat minimal consommable par les stories d'authentification."""

    def ping(self) -> bool:
        """Vérifie que le repository peut lire la base."""
        ...

    def insert(self, user_data: Mapping[str, object]) -> UserRecord:
        """Insère un compte utilisateur et retourne son enregistrement."""
        ...

    def find_by_username(self, username: str) -> UserRecord | None:
        """Recherche un compte par nom d'utilisateur."""
        ...

    def find_by_id(self, user_id: str) -> UserRecord | None:
        """Recherche un compte par identifiant."""
        ...

    def list_all(self) -> list[UserRecord]:
        """Retourne tous les comptes."""
        ...

    def update_role_and_status(
        self,
        user_id: str,
        *,
        role: str | None,
        is_active: bool | None,
    ) -> tuple[UserRecord, bool] | None:
        """Met à jour atomiquement le rôle et l'état d'un compte."""
        ...

    def update_password(self, user_id: str, hashed_password: str) -> UserRecord | None:
        """Met à jour le hash du mot de passe d'un compte."""
        ...


class UserRepository:
    """Accès partagé aux tables utilisateur, sans logique d'authentification."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec la connexion injectée."""
        self.database = database

    def ping(self) -> bool:
        """Retourne ``True`` si une lecture SQLite réussit."""
        return self.database.execute_scalar("SELECT 1") == 1

    def insert(self, user_data: Mapping[str, object]) -> UserRecord:
        """Insère un compte utilisateur dans la table ``users``.

        Args:
            user_data: Données du compte, incluant au minimum le nom,
                l'adresse email et le mot de passe hashé.

        Returns:
            L'enregistrement normalisé après insertion.

        Raises:
            DuplicateUsernameError: Si le nom d'utilisateur est déjà utilisé.
            ValueError: Si le rôle ne fait pas partie des rôles supportés.
        """
        now = datetime.now(timezone.utc).isoformat()
        role = str(user_data.get("role") or "writer")
        if role not in SUPPORTED_USER_ROLES:
            raise ValueError(f"Rôle utilisateur non supporté: {role}")

        record: UserRecord = {
            "id": str(user_data.get("id") or uuid4()),
            "username": canonicalize_username(str(user_data["username"])),
            "email": str(user_data.get("email") or ""),
            "hashed_password": str(user_data["hashed_password"]),
            "role": role,
            "is_active": bool(user_data.get("is_active", True)),
            "created_at": str(user_data.get("created_at") or now),
            "updated_at": str(user_data.get("updated_at") or now),
        }
        try:
            with self.database.transaction(immediate=True) as connection:
                existing_usernames = connection.execute(
                    "SELECT username FROM users"
                ).fetchall()
                if any(
                    canonicalize_username(str(row[0])) == record["username"]
                    for row in existing_usernames
                ):
                    raise DuplicateUsernameError(record["username"])
                connection.execute(
                    """
                    INSERT INTO users (
                        id, username, email, hashed_password, role,
                        is_active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record["id"],
                        record["username"],
                        record["email"],
                        record["hashed_password"],
                        record["role"],
                        int(record["is_active"]),
                        record["created_at"],
                        record["updated_at"],
                    ),
                )
        except sqlite3.IntegrityError as exc:
            if "users.username" in str(exc):
                logger.info("Tentative de création d'un username existant: %s", record["username"])
                raise DuplicateUsernameError(record["username"]) from exc
            raise
        return record

    def find_by_username(self, username: str) -> UserRecord | None:
        """Recherche un compte utilisateur sans distinguer la casse.

        Args:
            username: Nom d'utilisateur recherché.

        Returns:
            L'enregistrement trouvé, ou ``None`` si absent.
        """
        canonical_username = canonicalize_username(username)
        rows = self.database.execute_fetchall(
            """
            SELECT id, username, email, hashed_password, role,
                   is_active, created_at, updated_at
            FROM users
            WHERE username = ? COLLATE NOCASE
            LIMIT 1
            """,
            (canonical_username,),
        )
        if not rows:
            rows = [
                row
                for row in self.database.execute_fetchall(
                    """
                    SELECT id, username, email, hashed_password, role,
                           is_active, created_at, updated_at
                    FROM users
                    """
                )
                if canonicalize_username(str(row[1])) == canonical_username
            ][:1]
        if not rows:
            return None
        return self._row_to_record(rows[0])

    def find_by_id(self, user_id: str) -> UserRecord | None:
        """Recherche un compte par son identifiant stable."""
        rows = self.database.execute_fetchall(
            """
            SELECT id, username, email, hashed_password, role,
                   is_active, created_at, updated_at
            FROM users
            WHERE id = ?
            LIMIT 1
            """,
            (user_id,),
        )
        return self._row_to_record(rows[0]) if rows else None

    def list_all(self) -> list[UserRecord]:
        """Retourne tous les comptes, triés par username canonique."""
        rows = self.database.execute_fetchall(
            """
            SELECT id, username, email, hashed_password, role,
                   is_active, created_at, updated_at
            FROM users
            ORDER BY username COLLATE NOCASE
            """
        )
        return [self._row_to_record(row) for row in rows]

    def update_role_and_status(
        self,
        user_id: str,
        *,
        role: str | None,
        is_active: bool | None,
    ) -> tuple[UserRecord, bool] | None:
        """Met à jour un compte en préservant au moins un admin actif.

        La transaction ``IMMEDIATE`` sérialise le comptage et l'écriture entre
        connexions SQLite concurrentes.
        """
        if role is not None and role not in SUPPORTED_USER_ROLES:
            raise ValueError(f"Rôle utilisateur non supporté: {role}")

        with self.database.transaction(immediate=True) as connection:
            row = connection.execute(
                """
                SELECT id, username, email, hashed_password, role,
                       is_active, created_at, updated_at
                FROM users
                WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
            if row is None:
                return None

            current = self._row_to_record(tuple(row))
            next_role = role if role is not None else current["role"]
            next_is_active = is_active if is_active is not None else current["is_active"]
            if (
                next_role == current["role"]
                and next_is_active == current["is_active"]
            ):
                return current, False

            removes_active_admin = (
                current["role"] == "admin"
                and current["is_active"]
                and (next_role != "admin" or not next_is_active)
            )
            if removes_active_admin:
                active_admin_count = int(
                    connection.execute(
                        """
                        SELECT COUNT(*)
                        FROM users
                        WHERE role = 'admin' AND is_active = 1
                        """
                    ).fetchone()[0]
                )
                if active_admin_count <= 1:
                    raise LastActiveAdminError(
                        "Au moins un administrateur actif doit être conservé."
                    )

            updated_at = datetime.now(timezone.utc).isoformat()
            connection.execute(
                """
                UPDATE users
                SET role = ?, is_active = ?, updated_at = ?
                WHERE id = ?
                """,
                (next_role, int(next_is_active), updated_at, user_id),
            )
            updated: UserRecord = {
                **current,
                "role": next_role,
                "is_active": next_is_active,
                "updated_at": updated_at,
            }
            return updated, True

    def update_password(self, user_id: str, hashed_password: str) -> UserRecord | None:
        """Remplace le hash bcrypt du compte ciblé.

        Args:
            user_id: Identifiant du compte.
            hashed_password: Nouveau hash bcrypt (jamais le clair).

        Returns:
            Enregistrement mis à jour, ou ``None`` si le compte est absent.
        """
        updated_at = datetime.now(timezone.utc).isoformat()
        with self.database.transaction(immediate=True) as connection:
            row = connection.execute(
                """
                SELECT id, username, email, hashed_password, role,
                       is_active, created_at, updated_at
                FROM users
                WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
            if row is None:
                return None
            connection.execute(
                """
                UPDATE users
                SET hashed_password = ?, updated_at = ?
                WHERE id = ?
                """,
                (hashed_password, updated_at, user_id),
            )
            current = self._row_to_record(tuple(row))
            return {
                **current,
                "hashed_password": hashed_password,
                "updated_at": updated_at,
            }

    @staticmethod
    def _row_to_record(row: tuple[object, ...]) -> UserRecord:
        """Convertit une ligne SQLite en enregistrement utilisateur typé."""
        return {
            "id": str(row[0]),
            "username": str(row[1]),
            "email": str(row[2] or ""),
            "hashed_password": str(row[3] or ""),
            "role": str(row[4]),
            "is_active": bool(row[5]),
            "created_at": str(row[6]),
            "updated_at": str(row[7]),
        }

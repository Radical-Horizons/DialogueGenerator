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
        row = rows[0]
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

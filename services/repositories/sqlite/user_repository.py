"""Repository utilisateur minimal pour la fondation SQLite."""

from __future__ import annotations

from typing import Protocol

from services.repositories.sqlite.connection import DatabaseConnection


class IUserRepository(Protocol):
    """Contrat minimal consommable par les stories d'authentification."""

    def ping(self) -> bool:
        """Vérifie que le repository peut lire la base."""
        ...


class UserRepository:
    """Accès partagé aux tables utilisateur, sans logique d'authentification."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec la connexion injectée."""
        self.database = database

    def ping(self) -> bool:
        """Retourne ``True`` si une lecture SQLite réussit."""
        return self.database.execute_scalar("SELECT 1") == 1

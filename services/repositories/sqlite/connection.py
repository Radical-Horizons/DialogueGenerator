"""Connexion SQLite partagée et protégée contre les accès concurrents."""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Iterator, Sequence
from contextlib import contextmanager


class DatabaseConnection:
    """Encapsule une connexion SQLite partagée par le processus."""

    def __init__(self, database_path: Path | str) -> None:
        """Ouvre une connexion SQLite et configure son mode de journalisation.

        Args:
            database_path: Chemin du fichier SQLite à créer ou ouvrir.
        """
        self.database_path = Path(database_path).expanduser().resolve()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(
            self.database_path,
            check_same_thread=False,
            timeout=30.0,
            isolation_level=None,
        )
        with self._lock:
            self._connection.execute("PRAGMA journal_mode=WAL")
            self._connection.execute("PRAGMA foreign_keys=ON")
            self._connection.execute("PRAGMA busy_timeout=30000")

    def execute(
        self,
        sql: str,
        parameters: Sequence[object] = (),
    ) -> sqlite3.Cursor:
        """Exécute une requête sous verrou.

        Args:
            sql: Requête SQL à exécuter.
            parameters: Paramètres positionnels de la requête.

        Returns:
            Curseur SQLite résultant de l'exécution.
        """
        with self._lock:
            return self._connection.execute(sql, tuple(parameters))

    def execute_scalar(
        self,
        sql: str,
        parameters: Sequence[object] = (),
    ) -> object:
        """Exécute une requête et retourne sa première colonne.

        Args:
            sql: Requête SQL scalaire à exécuter.
            parameters: Paramètres positionnels de la requête.

        Returns:
            Première valeur de la première ligne, ou ``None`` si absente.
        """
        with self._lock:
            row = self._connection.execute(sql, tuple(parameters)).fetchone()
        return row[0] if row else None

    def execute_fetchall(
        self,
        sql: str,
        parameters: Sequence[object] = (),
    ) -> list[tuple[object, ...]]:
        """Exécute une requête et consomme toutes ses lignes sous verrou.

        Args:
            sql: Requête SQL à exécuter.
            parameters: Paramètres positionnels de la requête.

        Returns:
            Lignes retournées par SQLite.
        """
        with self._lock:
            cursor = self._connection.execute(sql, tuple(parameters))
            return cursor.fetchall()

    @contextmanager
    def transaction(self, *, immediate: bool = False) -> Iterator[sqlite3.Connection]:
        """Fournit une transaction avec rollback automatique.

        Args:
            immediate: Réserve immédiatement l'écriture SQLite avant le premier
                accès. À utiliser lorsque plusieurs opérations de lecture et
                d'écriture doivent être sérialisées entre connexions.

        Yields:
            Connexion SQLite utilisée par la transaction.

        Raises:
            BaseException: Toute erreur déclenchée dans le bloc est relancée
                après rollback.
        """
        with self._lock:
            self._connection.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
            try:
                yield self._connection
                self._connection.commit()
            except BaseException:
                self._connection.rollback()
                raise

    def close(self) -> None:
        """Ferme la connexion SQLite de façon thread-safe."""
        with self._lock:
            self._connection.close()

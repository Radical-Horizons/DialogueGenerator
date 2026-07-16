"""Repository SQLite transactionnel pour l'index propriétaire des dialogues."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sqlite3

from services.repositories.sqlite.connection import DatabaseConnection


@dataclass(frozen=True)
class DialogueIndexEntry:
    """Entrée persistée reliant un document fichier à son propriétaire."""

    document_id: str
    owner_id: str | None
    storage_path: str
    last_modified_by: str | None
    created_at: str
    updated_at: str


class DialoguesIndexRepository:
    """Fournit le CRUD transactionnel de ``dialogues_index``."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec une connexion injectée."""
        self._database = database

    @staticmethod
    def _from_row(row: tuple[object, ...] | None) -> DialogueIndexEntry | None:
        """Convertit une ligne SQLite en entrée typée."""
        if row is None:
            return None
        return DialogueIndexEntry(
            document_id=str(row[0]),
            owner_id=str(row[1]) if row[1] is not None else None,
            storage_path=str(row[2]),
            last_modified_by=str(row[3]) if row[3] is not None else None,
            created_at=str(row[4]),
            updated_at=str(row[5]),
        )

    def create(
        self,
        *,
        document_id: str,
        owner_id: str | None,
        storage_path: Path | str,
        last_modified_by: str | None,
    ) -> DialogueIndexEntry:
        """Crée une entrée propriétaire sans écraser un document existant."""
        normalized_path = str(Path(storage_path).resolve())
        try:
            with self._database.transaction(immediate=True) as connection:
                connection.execute(
                    """
                    INSERT INTO dialogues_index(
                        document_id, owner_id, storage_path, last_modified_by,
                        created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                    """,
                    (document_id, owner_id, normalized_path, last_modified_by),
                )
                row = connection.execute(
                    """
                    SELECT document_id, owner_id, storage_path, last_modified_by,
                           created_at, updated_at
                    FROM dialogues_index
                    WHERE document_id = ?
                    """,
                    (document_id,),
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise ValueError(f"Dialogue déjà indexé: {document_id}") from exc
        entry = self._from_row(row)
        if entry is None:
            raise RuntimeError(f"Création de l'index dialogue impossible: {document_id}")
        return entry

    def find_by_document_id(self, document_id: str) -> DialogueIndexEntry | None:
        """Retourne l'entrée d'un document, si elle existe."""
        rows = self._database.execute_fetchall(
            """
            SELECT document_id, owner_id, storage_path, last_modified_by,
                   created_at, updated_at
            FROM dialogues_index
            WHERE document_id = ?
            """,
            (document_id,),
        )
        return self._from_row(rows[0] if rows else None)

    def user_exists(self, user_id: str) -> bool:
        """Indique si un identifiant utilisateur est référencé dans SQLite."""
        return bool(
            self._database.execute_scalar(
                "SELECT 1 FROM users WHERE id = ?",
                (user_id,),
            )
        )

    def list_for_owner(self, owner_id: str) -> list[DialogueIndexEntry]:
        """Liste les dialogues appartenant à un utilisateur."""
        rows = self._database.execute_fetchall(
            """
            SELECT document_id, owner_id, storage_path, last_modified_by,
                   created_at, updated_at
            FROM dialogues_index
            WHERE owner_id = ?
            ORDER BY updated_at DESC, document_id ASC
            """,
            (owner_id,),
        )
        return [entry for row in rows if (entry := self._from_row(row)) is not None]

    def update_after_write(
        self,
        document_id: str,
        last_modified_by: str | None,
    ) -> DialogueIndexEntry | None:
        """Actualise le dernier éditeur d'une entrée existante."""
        with self._database.transaction(immediate=True) as connection:
            cursor = connection.execute(
                """
                UPDATE dialogues_index
                SET last_modified_by = ?, updated_at = datetime('now')
                WHERE document_id = ?
                """,
                (last_modified_by, document_id),
            )
            if cursor.rowcount == 0:
                return None
            row = connection.execute(
                """
                SELECT document_id, owner_id, storage_path, last_modified_by,
                       created_at, updated_at
                FROM dialogues_index
                WHERE document_id = ?
                """,
                (document_id,),
            ).fetchone()
        return self._from_row(row)

    def delete(self, document_id: str) -> bool:
        """Supprime l'entrée d'un document."""
        with self._database.transaction(immediate=True) as connection:
            cursor = connection.execute(
                "DELETE FROM dialogues_index WHERE document_id = ?",
                (document_id,),
            )
        return cursor.rowcount > 0

"""Repository SQLite pour les partages co-édition des dialogues."""

from __future__ import annotations

from dataclasses import dataclass
import sqlite3

from services.repositories.sqlite.connection import DatabaseConnection


@dataclass(frozen=True)
class DialogueShareEntry:
    """Partage writer persistant entre un document et un compte."""

    document_id: str
    user_id: str
    permission: str
    created_at: str
    username: str | None = None


class DialogueSharesRepository:
    """CRUD transactionnel de ``dialogue_shares``."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec une connexion injectée."""
        self._database = database

    @staticmethod
    def _from_row(row: tuple[object, ...] | None) -> DialogueShareEntry | None:
        """Convertit une ligne SQLite en entrée typée."""
        if row is None:
            return None
        username = str(row[4]) if len(row) > 4 and row[4] is not None else None
        return DialogueShareEntry(
            document_id=str(row[0]),
            user_id=str(row[1]),
            permission=str(row[2]),
            created_at=str(row[3]),
            username=username,
        )

    def has_writer_share(self, document_id: str, user_id: str) -> bool:
        """Indique si un writer actif détient un partage writer sur le document."""
        return bool(
            self._database.execute_scalar(
                """
                SELECT 1
                FROM dialogue_shares AS s
                INNER JOIN users AS u ON u.id = s.user_id
                WHERE s.document_id = ?
                  AND s.user_id = ?
                  AND s.permission = 'writer'
                  AND u.role = 'writer'
                  AND u.is_active = 1
                """,
                (document_id, user_id),
            )
        )

    def list_for_document(self, document_id: str) -> list[DialogueShareEntry]:
        """Liste les co-éditeurs d'un document avec leur username."""
        rows = self._database.execute_fetchall(
            """
            SELECT s.document_id, s.user_id, s.permission, s.created_at, u.username
            FROM dialogue_shares AS s
            LEFT JOIN users AS u ON u.id = s.user_id
            WHERE s.document_id = ?
            ORDER BY u.username ASC, s.user_id ASC
            """,
            (document_id,),
        )
        return [entry for row in rows if (entry := self._from_row(row)) is not None]

    def create(
        self,
        *,
        document_id: str,
        user_id: str,
        permission: str = "writer",
    ) -> DialogueShareEntry:
        """Crée un partage writer sans écraser une entrée existante."""
        if permission != "writer":
            raise ValueError(f"Permission de partage non supportée: {permission}")
        try:
            with self._database.transaction(immediate=True) as connection:
                connection.execute(
                    """
                    INSERT INTO dialogue_shares(
                        document_id, user_id, permission, created_at
                    )
                    VALUES (?, ?, ?, datetime('now'))
                    """,
                    (document_id, user_id, permission),
                )
                row = connection.execute(
                    """
                    SELECT s.document_id, s.user_id, s.permission, s.created_at, u.username
                    FROM dialogue_shares AS s
                    LEFT JOIN users AS u ON u.id = s.user_id
                    WHERE s.document_id = ? AND s.user_id = ?
                    """,
                    (document_id, user_id),
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            message = str(exc).casefold()
            if "unique" in message or "primary key" in message:
                raise ValueError(
                    f"Partage déjà existant pour {document_id}/{user_id}"
                ) from exc
            raise LookupError(
                f"Partage impossible (références invalides): {document_id}/{user_id}"
            ) from exc
        entry = self._from_row(row)
        if entry is None:
            raise RuntimeError(
                f"Création du partage impossible: {document_id}/{user_id}"
            )
        return entry

    def delete(self, document_id: str, user_id: str) -> bool:
        """Supprime un partage document/utilisateur."""
        with self._database.transaction(immediate=True) as connection:
            cursor = connection.execute(
                """
                DELETE FROM dialogue_shares
                WHERE document_id = ? AND user_id = ?
                """,
                (document_id, user_id),
            )
        return cursor.rowcount > 0

"""Repository SQLite pour les collections de dialogues (Story 8.5 / FR84)."""

from __future__ import annotations

from dataclasses import dataclass

from services.repositories.sqlite.connection import DatabaseConnection


@dataclass(frozen=True)
class CollectionEntry:
    """Collection persistée appartenant à un utilisateur."""

    id: str
    name: str
    description: str | None
    icon: str | None
    owner_id: str
    created_at: str
    updated_at: str


class CollectionsRepository:
    """CRUD transactionnel de ``collections`` et ``collection_dialogues``."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec une connexion injectée."""
        self._database = database

    @staticmethod
    def _from_row(row: tuple[object, ...] | None) -> CollectionEntry | None:
        """Convertit une ligne SQLite en entrée typée."""
        if row is None:
            return None
        description = str(row[2]) if row[2] is not None else None
        icon = str(row[3]) if row[3] is not None else None
        return CollectionEntry(
            id=str(row[0]),
            name=str(row[1]),
            description=description,
            icon=icon,
            owner_id=str(row[4]),
            created_at=str(row[5]),
            updated_at=str(row[6]),
        )

    def create(
        self,
        *,
        collection_id: str,
        name: str,
        description: str | None,
        icon: str | None,
        owner_id: str,
        created_at: str,
        updated_at: str,
    ) -> CollectionEntry:
        """Insère une collection et retourne l'entrée créée."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                """
                INSERT INTO collections(
                    id, name, description, icon, owner_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    collection_id,
                    name,
                    description,
                    icon,
                    owner_id,
                    created_at,
                    updated_at,
                ),
            )
        entry = self.get_by_id(collection_id)
        if entry is None:
            raise RuntimeError(f"Collection {collection_id} introuvable après create")
        return entry

    def get_by_id(self, collection_id: str) -> CollectionEntry | None:
        """Retourne une collection par identifiant, ou ``None``."""
        rows = self._database.execute_fetchall(
            """
            SELECT id, name, description, icon, owner_id, created_at, updated_at
            FROM collections
            WHERE id = ?
            """,
            (collection_id,),
        )
        return self._from_row(rows[0] if rows else None)

    def list_for_owner(self, owner_id: str) -> list[CollectionEntry]:
        """Liste les collections d'un propriétaire, triées par nom."""
        rows = self._database.execute_fetchall(
            """
            SELECT id, name, description, icon, owner_id, created_at, updated_at
            FROM collections
            WHERE owner_id = ?
            ORDER BY name COLLATE NOCASE ASC, id ASC
            """,
            (owner_id,),
        )
        return [entry for row in rows if (entry := self._from_row(row)) is not None]

    def update(
        self,
        *,
        collection_id: str,
        name: str,
        description: str | None,
        icon: str | None,
        updated_at: str,
    ) -> CollectionEntry | None:
        """Met à jour les champs éditables d'une collection."""
        with self._database.transaction(immediate=True) as connection:
            cursor = connection.execute(
                """
                UPDATE collections
                SET name = ?, description = ?, icon = ?, updated_at = ?
                WHERE id = ?
                """,
                (name, description, icon, updated_at, collection_id),
            )
            if cursor.rowcount == 0:
                return None
        return self.get_by_id(collection_id)

    def delete(self, collection_id: str) -> int:
        """Supprime une collection ; retourne le nombre de memberships retirés.

        Les lignes ``collection_dialogues`` partent via CASCADE. Compte + DELETE
        dans la même transaction pour un total cohérent.
        """
        with self._database.transaction(immediate=True) as connection:
            row = connection.execute(
                """
                SELECT COUNT(*)
                FROM collection_dialogues
                WHERE collection_id = ?
                """,
                (collection_id,),
            ).fetchone()
            count = int(row[0]) if row else 0
            cursor = connection.execute(
                "DELETE FROM collections WHERE id = ?",
                (collection_id,),
            )
            if cursor.rowcount == 0:
                return -1
        return count

    def list_document_ids(self, collection_id: str) -> list[str]:
        """Retourne les ``document_id`` membres d'une collection."""
        rows = self._database.execute_fetchall(
            """
            SELECT document_id
            FROM collection_dialogues
            WHERE collection_id = ?
            ORDER BY document_id ASC
            """,
            (collection_id,),
        )
        return [str(row[0]) for row in rows]

    def count_documents(self, collection_id: str) -> int:
        """Compte les dialogues liés à une collection."""
        value = self._database.execute_scalar(
            """
            SELECT COUNT(*)
            FROM collection_dialogues
            WHERE collection_id = ?
            """,
            (collection_id,),
        )
        return int(value or 0)

    def add_documents(self, collection_id: str, document_ids: list[str]) -> None:
        """Ajoute des dialogues (INSERT OR IGNORE — idempotent)."""
        if not document_ids:
            return
        with self._database.transaction(immediate=True) as connection:
            connection.executemany(
                """
                INSERT OR IGNORE INTO collection_dialogues(collection_id, document_id)
                VALUES (?, ?)
                """,
                [(collection_id, document_id) for document_id in document_ids],
            )

    def remove_documents(self, collection_id: str, document_ids: list[str]) -> None:
        """Retire des dialogues d'une collection."""
        if not document_ids:
            return
        placeholders = ", ".join("?" for _ in document_ids)
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                f"""
                DELETE FROM collection_dialogues
                WHERE collection_id = ?
                  AND document_id IN ({placeholders})
                """,
                (collection_id, *document_ids),
            )

"""Repository SQLite pour les partages d'équipe des templates custom."""

from __future__ import annotations

from dataclasses import dataclass
import sqlite3

from services.repositories.sqlite.connection import DatabaseConnection


@dataclass(frozen=True)
class TemplateShareEntry:
    """Partage d'un template custom vers un writer."""

    template_id: str
    user_id: str
    created_at: str
    username: str | None = None


class TemplateSharesRepository:
    """CRUD transactionnel de ``template_shares``."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec une connexion injectée."""
        self._database = database

    @staticmethod
    def _from_row(row: tuple[object, ...] | None) -> TemplateShareEntry | None:
        """Convertit une ligne SQLite en entrée typée."""
        if row is None:
            return None
        username = str(row[3]) if len(row) > 3 and row[3] is not None else None
        return TemplateShareEntry(
            template_id=str(row[0]),
            user_id=str(row[1]),
            created_at=str(row[2]),
            username=username,
        )

    def has_share(self, template_id: str, user_id: str) -> bool:
        """Indique si ``user_id`` a un partage sur le template."""
        return bool(
            self._database.execute_scalar(
                """
                SELECT 1
                FROM template_shares
                WHERE template_id = ? AND user_id = ?
                """,
                (template_id, user_id),
            )
        )

    def list_template_ids_for_user(self, user_id: str) -> set[str]:
        """IDs de templates partagés avec l'utilisateur."""
        rows = self._database.execute_fetchall(
            """
            SELECT template_id
            FROM template_shares
            WHERE user_id = ?
            """,
            (user_id,),
        )
        return {str(row[0]) for row in rows}

    def list_for_template(self, template_id: str) -> list[TemplateShareEntry]:
        """Liste les destinataires d'un template avec username."""
        rows = self._database.execute_fetchall(
            """
            SELECT s.template_id, s.user_id, s.created_at, u.username
            FROM template_shares AS s
            LEFT JOIN users AS u ON u.id = s.user_id
            WHERE s.template_id = ?
            ORDER BY u.username ASC, s.user_id ASC
            """,
            (template_id,),
        )
        return [entry for row in rows if (entry := self._from_row(row)) is not None]

    def create(self, *, template_id: str, user_id: str) -> TemplateShareEntry:
        """Crée un partage sans écraser une entrée existante."""
        try:
            with self._database.transaction(immediate=True) as connection:
                connection.execute(
                    """
                    INSERT INTO template_shares(template_id, user_id, created_at)
                    VALUES (?, ?, datetime('now'))
                    """,
                    (template_id, user_id),
                )
                row = connection.execute(
                    """
                    SELECT s.template_id, s.user_id, s.created_at, u.username
                    FROM template_shares AS s
                    LEFT JOIN users AS u ON u.id = s.user_id
                    WHERE s.template_id = ? AND s.user_id = ?
                    """,
                    (template_id, user_id),
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            message = str(exc).casefold()
            if "unique" in message or "primary key" in message:
                raise ValueError(
                    f"Partage déjà existant pour {template_id}/{user_id}"
                ) from exc
            raise LookupError(
                f"Partage impossible (références invalides): {template_id}/{user_id}"
            ) from exc
        entry = self._from_row(row)
        if entry is None:
            raise RuntimeError(
                f"Création du partage impossible: {template_id}/{user_id}"
            )
        return entry

    def delete(self, template_id: str, user_id: str) -> bool:
        """Supprime un partage template/utilisateur."""
        with self._database.transaction(immediate=True) as connection:
            cursor = connection.execute(
                """
                DELETE FROM template_shares
                WHERE template_id = ? AND user_id = ?
                """,
                (template_id, user_id),
            )
        return cursor.rowcount > 0

    def delete_for_template(self, template_id: str) -> None:
        """Supprime tous les partages d'un template (cascade applicative)."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                "DELETE FROM template_shares WHERE template_id = ?",
                (template_id,),
            )

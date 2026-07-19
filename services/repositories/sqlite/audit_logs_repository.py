"""Repository SQLite append-only pour les journaux d'audit."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from services.repositories.sqlite.connection import DatabaseConnection


@dataclass(frozen=True)
class AuditLogEntry:
    """Entrée d'audit persistée."""

    id: str
    created_at: str
    actor_user_id: str | None
    actor_username: str
    action: str
    target_type: str
    target_id: str
    metadata: str


@dataclass(frozen=True)
class AuditLogListResult:
    """Page d'entrées d'audit avec total filtré."""

    items: list[AuditLogEntry]
    total: int


class AuditLogsRepository:
    """Insert et lecture filtrée de ``audit_logs`` (pas d'update/delete)."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec une connexion injectée."""
        self._database = database

    @staticmethod
    def _from_row(row: tuple[object, ...] | None) -> AuditLogEntry | None:
        """Convertit une ligne SQLite en entrée typée."""
        if row is None:
            return None
        actor_id = str(row[2]) if row[2] is not None else None
        return AuditLogEntry(
            id=str(row[0]),
            created_at=str(row[1]),
            actor_user_id=actor_id,
            actor_username=str(row[3]),
            action=str(row[4]),
            target_type=str(row[5]),
            target_id=str(row[6]),
            metadata=str(row[7] if row[7] is not None else "{}"),
        )

    def insert(
        self,
        *,
        entry_id: str,
        created_at: str,
        actor_user_id: str | None,
        actor_username: str,
        action: str,
        target_type: str,
        target_id: str,
        metadata: str,
    ) -> AuditLogEntry:
        """Insère une entrée append-only et la retourne."""
        self._database.execute(
            """
            INSERT INTO audit_logs(
                id, created_at, actor_user_id, actor_username,
                action, target_type, target_id, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id,
                created_at,
                actor_user_id,
                actor_username,
                action,
                target_type,
                target_id,
                metadata,
            ),
        )
        return AuditLogEntry(
            id=entry_id,
            created_at=created_at,
            actor_user_id=actor_user_id,
            actor_username=actor_username,
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata=metadata,
        )

    def list_filtered(
        self,
        *,
        user_id: str | None = None,
        username: str | None = None,
        action: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> AuditLogListResult:
        """Liste les entrées filtrées, triées par ``created_at`` DESC.

        Args:
            user_id: Filtre exact sur ``actor_user_id``.
            username: Filtre exact (insensible à la casse) sur ``actor_username``.
            action: Filtre exact sur ``action``.
            start_date: Borne inférieure inclusive (préfixe ISO ``YYYY-MM-DD`` ou datetime).
            end_date: Borne supérieure inclusive (jour entier si date seule).
            offset: Décalage pagination.
            limit: Taille de page.

        Returns:
            Page d'entrées et total correspondant aux filtres.
        """
        where_clauses: list[str] = []
        params: list[Any] = []

        if user_id:
            where_clauses.append("actor_user_id = ?")
            params.append(user_id)
        if username:
            where_clauses.append("LOWER(actor_username) = LOWER(?)")
            params.append(username)
        if action:
            where_clauses.append("action = ?")
            params.append(action)
        if start_date:
            where_clauses.append("created_at >= ?")
            params.append(start_date)
        if end_date:
            end_bound = end_date
            if len(end_date) == 10:
                end_bound = f"{end_date}T23:59:59.999999+00:00"
            where_clauses.append("created_at <= ?")
            params.append(end_bound)

        where_sql = ""
        if where_clauses:
            where_sql = "WHERE " + " AND ".join(where_clauses)

        total_raw = self._database.execute_scalar(
            f"SELECT COUNT(*) FROM audit_logs {where_sql}",
            tuple(params),
        )
        total = int(total_raw or 0)

        rows = self._database.execute_fetchall(
            f"""
            SELECT id, created_at, actor_user_id, actor_username,
                   action, target_type, target_id, metadata
            FROM audit_logs
            {where_sql}
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            tuple([*params, limit, offset]),
        )
        items = [
            entry
            for row in rows
            if (entry := self._from_row(row)) is not None
        ]
        return AuditLogListResult(items=items, total=total)

    def list_filtered_all(
        self,
        *,
        user_id: str | None = None,
        username: str | None = None,
        action: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        max_rows: int = 10_000,
    ) -> AuditLogListResult:
        """Retourne jusqu'à ``max_rows`` entrées filtrées pour export.

        Le ``total`` reflète le nombre réel de correspondances ; si
        ``total > len(items)``, l'export est tronqué.
        """
        return self.list_filtered(
            user_id=user_id,
            username=username,
            action=action,
            start_date=start_date,
            end_date=end_date,
            offset=0,
            limit=max_rows,
        )

"""Repository SQLite du marketplace de templates (Story 6.6)."""

from __future__ import annotations

from dataclasses import dataclass

from services.repositories.sqlite.connection import DatabaseConnection


@dataclass(frozen=True)
class SharedTemplateRow:
    """Fiche marketplace persistée, avec agrégats de notes."""

    id: str
    source_template_id: str
    author_id: str
    author_username: str
    snapshot: str
    usage_count: int
    created_at: str
    updated_at: str
    rating_average: float | None
    rating_count: int


class SharedTemplatesRepository:
    """CRUD transactionnel de ``shared_templates`` et ``template_ratings``."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec une connexion injectée."""
        self._database = database

    @staticmethod
    def _from_row(row: tuple[object, ...] | None) -> SharedTemplateRow | None:
        """Convertit une ligne agrégée en entrée typée."""
        if row is None:
            return None
        average_raw = row[8]
        rating_average = float(average_raw) if average_raw is not None else None
        return SharedTemplateRow(
            id=str(row[0]),
            source_template_id=str(row[1]),
            author_id=str(row[2]),
            author_username=str(row[3] or ""),
            snapshot=str(row[4]),
            usage_count=int(row[5] or 0),
            created_at=str(row[6]),
            updated_at=str(row[7]),
            rating_average=rating_average,
            rating_count=int(row[9] or 0),
        )

    def list_listings(self) -> list[SharedTemplateRow]:
        """Liste toutes les fiches, note moyenne à ``None`` si zéro vote."""
        rows = self._database.execute_fetchall(
            """
            SELECT
                s.id,
                s.source_template_id,
                s.author_id,
                u.username,
                s.snapshot,
                s.usage_count,
                s.created_at,
                s.updated_at,
                AVG(r.stars),
                COUNT(r.stars)
            FROM shared_templates AS s
            LEFT JOIN users AS u ON u.id = s.author_id
            LEFT JOIN template_ratings AS r ON r.listing_id = s.id
            GROUP BY s.id
            ORDER BY s.created_at DESC
            """
        )
        return [entry for row in rows if (entry := self._from_row(row)) is not None]

    def get_by_id(self, listing_id: str) -> SharedTemplateRow | None:
        """Charge une fiche par identifiant."""
        row = self._database.execute_fetchall(
            """
            SELECT
                s.id,
                s.source_template_id,
                s.author_id,
                u.username,
                s.snapshot,
                s.usage_count,
                s.created_at,
                s.updated_at,
                AVG(r.stars),
                COUNT(r.stars)
            FROM shared_templates AS s
            LEFT JOIN users AS u ON u.id = s.author_id
            LEFT JOIN template_ratings AS r ON r.listing_id = s.id
            WHERE s.id = ?
            GROUP BY s.id
            """,
            (listing_id,),
        )
        if not row:
            return None
        return self._from_row(row[0])

    def get_by_source_and_author(
        self,
        source_template_id: str,
        author_id: str,
    ) -> SharedTemplateRow | None:
        """Retourne la fiche existante pour un custom + auteur (upsert)."""
        listing_id = self._database.execute_scalar(
            """
            SELECT id
            FROM shared_templates
            WHERE source_template_id = ? AND author_id = ?
            """,
            (source_template_id, author_id),
        )
        if listing_id is None:
            return None
        return self.get_by_id(str(listing_id))

    def insert(
        self,
        *,
        listing_id: str,
        source_template_id: str,
        author_id: str,
        snapshot: str,
        created_at: str,
        updated_at: str,
    ) -> SharedTemplateRow:
        """Insère une fiche et la relit."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                """
                INSERT INTO shared_templates(
                    id, source_template_id, author_id, snapshot,
                    usage_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 0, ?, ?)
                """,
                (
                    listing_id,
                    source_template_id,
                    author_id,
                    snapshot,
                    created_at,
                    updated_at,
                ),
            )
        entry = self.get_by_id(listing_id)
        if entry is None:
            raise RuntimeError(f"Listing {listing_id} introuvable après insert")
        return entry

    def update_snapshot(
        self,
        listing_id: str,
        snapshot: str,
        updated_at: str,
    ) -> SharedTemplateRow:
        """Remplace le snapshot d'une fiche existante (republication)."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                """
                UPDATE shared_templates
                SET snapshot = ?, updated_at = ?
                WHERE id = ?
                """,
                (snapshot, updated_at, listing_id),
            )
        entry = self.get_by_id(listing_id)
        if entry is None:
            raise RuntimeError(f"Listing {listing_id} introuvable après update")
        return entry

    def increment_usage(self, listing_id: str) -> None:
        """Incrémente le compteur d'usages d'une fiche."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                """
                UPDATE shared_templates
                SET usage_count = usage_count + 1
                WHERE id = ?
                """,
                (listing_id,),
            )

    def delete(self, listing_id: str) -> bool:
        """Supprime une fiche (CASCADE sur les notes)."""
        with self._database.transaction(immediate=True) as connection:
            cursor = connection.execute(
                "DELETE FROM shared_templates WHERE id = ?",
                (listing_id,),
            )
            return cursor.rowcount > 0

    def upsert_rating(
        self,
        *,
        listing_id: str,
        user_id: str,
        stars: int,
        created_at: str,
        updated_at: str,
    ) -> None:
        """Crée ou met à jour la note d'un utilisateur."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                """
                INSERT INTO template_ratings(
                    listing_id, user_id, stars, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(listing_id, user_id) DO UPDATE SET
                    stars = excluded.stars,
                    updated_at = excluded.updated_at
                """,
                (listing_id, user_id, stars, created_at, updated_at),
            )

    def user_exists(self, user_id: str) -> bool:
        """Indique si ``user_id`` existe dans ``users`` (FK auteur / note)."""
        return bool(
            self._database.execute_scalar(
                "SELECT 1 FROM users WHERE id = ?",
                (user_id,),
            )
        )

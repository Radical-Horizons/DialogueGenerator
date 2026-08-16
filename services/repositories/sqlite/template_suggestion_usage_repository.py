"""Repository SQLite des compteurs d'usage perso (suggestions 6.9)."""

from __future__ import annotations

from services.repositories.sqlite.connection import DatabaseConnection

VALID_SOURCES = frozenset({"custom", "prebuilt", "marketplace"})


class TemplateSuggestionUsageRepository:
    """Incrémente et lit ``template_suggestion_usage`` (guest sans FK)."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec une connexion injectée."""
        self._database = database

    def increment(self, *, user_id: str, source: str, candidate_id: str) -> int:
        """Ajoute 1 au compteur et retourne la nouvelle valeur."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                """
                INSERT INTO template_suggestion_usage(
                    user_id, source, candidate_id, use_count
                )
                VALUES (?, ?, ?, 1)
                ON CONFLICT(user_id, source, candidate_id)
                DO UPDATE SET use_count = use_count + 1
                """,
                (user_id, source, candidate_id),
            )
            row = connection.execute(
                """
                SELECT use_count
                FROM template_suggestion_usage
                WHERE user_id = ? AND source = ? AND candidate_id = ?
                """,
                (user_id, source, candidate_id),
            ).fetchone()
        if row is None:
            raise RuntimeError(
                f"Compteur suggestion introuvable: {user_id}/{source}/{candidate_id}"
            )
        return int(row[0])

    def list_for_user(self, user_id: str) -> dict[tuple[str, str], int]:
        """Mappe ``(source, candidate_id)`` → ``use_count`` pour l'acteur."""
        rows = self._database.execute_fetchall(
            """
            SELECT source, candidate_id, use_count
            FROM template_suggestion_usage
            WHERE user_id = ?
            """,
            (user_id,),
        )
        return {(str(row[0]), str(row[1])): int(row[2]) for row in rows}

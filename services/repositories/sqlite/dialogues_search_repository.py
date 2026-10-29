"""Repository FTS5 pour la recherche de dialogues (Story 8.6 / FR85)."""

from __future__ import annotations

from dataclasses import dataclass
import re

from services.repositories.sqlite.connection import DatabaseConnection

_TOKEN_SPLIT = re.compile(r"\s+")


@dataclass(frozen=True)
class DialogueSearchStats:
    """Statistiques exposées à l'admin."""

    indexed_count: int
    last_rebuild_at: str | None
    last_search_ms: float | None
    rebuild_status: str
    rebuild_error: str | None
    index_bytes: int


class DialoguesSearchRepository:
    """Upsert / delete / MATCH FTS5 + métadonnées de rebuild."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec une connexion injectée."""
        self._database = database

    @staticmethod
    def build_fts_match_query(raw_query: str) -> str | None:
        """Transforme une requête libre en expression FTS5 sécurisée.

        Returns:
            Expression MATCH, ou ``None`` si aucun token exploitable.
        """
        tokens: list[str] = []
        for token in _TOKEN_SPLIT.split(raw_query.strip()):
            cleaned = token.replace('"', "").replace("*", "").strip()
            if cleaned:
                tokens.append(f'"{cleaned}"*')
        if not tokens:
            return None
        return " AND ".join(tokens)

    def upsert(
        self,
        *,
        document_id: str,
        title: str | None,
        speakers: str | None,
        body: str,
    ) -> None:
        """Remplace l'entrée FTS d'un document."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                "DELETE FROM dialogues_search_fts WHERE document_id = ?",
                (document_id,),
            )
            connection.execute(
                """
                INSERT INTO dialogues_search_fts(document_id, title, speakers, body)
                VALUES (?, ?, ?, ?)
                """,
                (document_id, title or "", speakers or "", body),
            )

    def delete(self, document_id: str) -> None:
        """Retire un document de l'index FTS."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                "DELETE FROM dialogues_search_fts WHERE document_id = ?",
                (document_id,),
            )

    def search(self, match_query: str, *, limit: int = 200) -> list[str]:
        """Retourne les ``document_id`` matchant la requête FTS."""
        rows = self._database.execute_fetchall(
            """
            SELECT document_id
            FROM dialogues_search_fts
            WHERE dialogues_search_fts MATCH ?
            LIMIT ?
            """,
            (match_query, limit),
        )
        return [str(row[0]) for row in rows]

    def count_indexed(self) -> int:
        """Compte les lignes FTS indexées."""
        value = self._database.execute_scalar(
            "SELECT COUNT(*) FROM dialogues_search_fts"
        )
        return int(value or 0)

    def clear_all(self) -> None:
        """Vide l'index FTS (rebuild)."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute("DELETE FROM dialogues_search_fts")

    def get_stats(self) -> DialogueSearchStats:
        """Lit la ligne unique de métadonnées + count live."""
        rows = self._database.execute_fetchall(
            """
            SELECT indexed_count, last_rebuild_at, last_search_ms,
                   rebuild_status, rebuild_error, index_bytes
            FROM dialogues_search_meta
            WHERE id = 1
            """
        )
        live_count = self.count_indexed()
        if not rows:
            return DialogueSearchStats(
                indexed_count=live_count,
                last_rebuild_at=None,
                last_search_ms=None,
                rebuild_status="idle",
                rebuild_error=None,
                index_bytes=0,
            )
        row = rows[0]
        return DialogueSearchStats(
            indexed_count=live_count,
            last_rebuild_at=str(row[1]) if row[1] is not None else None,
            last_search_ms=float(row[2]) if row[2] is not None else None,
            rebuild_status=str(row[3] or "idle"),
            rebuild_error=str(row[4]) if row[4] is not None else None,
            index_bytes=int(row[5] or 0),
        )

    def try_begin_rebuild(self) -> bool:
        """Passe atomiquement à ``running`` ; ``False`` si déjà running."""
        with self._database.transaction(immediate=True) as connection:
            cursor = connection.execute(
                """
                UPDATE dialogues_search_meta
                SET rebuild_status = 'running', rebuild_error = NULL
                WHERE id = 1 AND rebuild_status != 'running'
                """
            )
            return cursor.rowcount > 0

    def set_rebuild_status(
        self,
        status: str,
        *,
        error: str | None = None,
    ) -> None:
        """Met à jour le statut de rebuild admin."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                """
                UPDATE dialogues_search_meta
                SET rebuild_status = ?, rebuild_error = ?
                WHERE id = 1
                """,
                (status, error),
            )

    def finalize_rebuild(
        self,
        *,
        indexed_count: int,
        index_bytes: int,
        rebuilt_at: str,
    ) -> None:
        """Enregistre la fin d'un rebuild réussi."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                """
                UPDATE dialogues_search_meta
                SET indexed_count = ?,
                    index_bytes = ?,
                    last_rebuild_at = ?,
                    rebuild_status = 'done',
                    rebuild_error = NULL
                WHERE id = 1
                """,
                (indexed_count, index_bytes, rebuilt_at),
            )

    def record_search_ms(self, elapsed_ms: float) -> None:
        """Mémorise la durée de la dernière recherche."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                """
                UPDATE dialogues_search_meta
                SET last_search_ms = ?
                WHERE id = 1
                """,
                (elapsed_ms,),
            )

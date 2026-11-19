"""Repository SQLite des conversations IA et de leurs messages."""

from __future__ import annotations

from dataclasses import dataclass

from services.repositories.sqlite.connection import DatabaseConnection

_CONVERSATION_COLUMNS = (
    "id, owner_id, subject_kind, subject_key, subject_json, title, model_name, "
    "seed_json, created_at, updated_at"
)
_MESSAGE_COLUMNS = (
    "id, conversation_id, position, role, content, reasoning_summary, llm_call_id, "
    "model_name, cost_usd, created_at"
)


class AIConversationCapacityError(Exception):
    """L'ajout d'une paire de messages dépasserait le plafond de la conversation."""


class AIConversationMissingError(LookupError):
    """La conversation a disparu (supprimée) avant l'écriture de ses messages."""


@dataclass(frozen=True)
class AIConversationEntry:
    """Conversation persistée (sujet et instantané sérialisés en JSON)."""

    id: str
    owner_id: str
    subject_kind: str
    subject_key: str
    subject_json: str
    title: str
    model_name: str
    seed_json: str
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class AIConversationMessageEntry:
    """Message persisté d'une conversation."""

    id: str
    conversation_id: str
    position: int
    role: str
    content: str
    reasoning_summary: str | None
    llm_call_id: str | None
    model_name: str | None
    cost_usd: float | None
    created_at: str


@dataclass(frozen=True)
class NewAIConversationMessage:
    """Message à insérer ; la position est attribuée par le repository."""

    id: str
    role: str
    content: str
    created_at: str
    reasoning_summary: str | None = None
    llm_call_id: str | None = None
    model_name: str | None = None
    cost_usd: float | None = None


class AIConversationsRepository:
    """CRUD transactionnel de ``ai_conversations`` et ``ai_conversation_messages``."""

    def __init__(self, database: DatabaseConnection) -> None:
        """Initialise le repository avec une connexion injectée."""
        self._database = database

    @staticmethod
    def _conversation_from_row(row: tuple[object, ...]) -> AIConversationEntry:
        """Convertit une ligne SQLite en conversation typée."""
        return AIConversationEntry(
            id=str(row[0]),
            owner_id=str(row[1]),
            subject_kind=str(row[2]),
            subject_key=str(row[3]),
            subject_json=str(row[4]),
            title=str(row[5]),
            model_name=str(row[6]),
            seed_json=str(row[7]),
            created_at=str(row[8]),
            updated_at=str(row[9]),
        )

    @staticmethod
    def _message_from_row(row: tuple[object, ...]) -> AIConversationMessageEntry:
        """Convertit une ligne SQLite en message typé."""
        return AIConversationMessageEntry(
            id=str(row[0]),
            conversation_id=str(row[1]),
            position=int(row[2]),  # type: ignore[arg-type]
            role=str(row[3]),
            content=str(row[4]),
            reasoning_summary=str(row[5]) if row[5] is not None else None,
            llm_call_id=str(row[6]) if row[6] is not None else None,
            model_name=str(row[7]) if row[7] is not None else None,
            cost_usd=float(row[8]) if row[8] is not None else None,  # type: ignore[arg-type]
            created_at=str(row[9]),
        )

    def create(self, entry: AIConversationEntry) -> AIConversationEntry:
        """Insère une conversation et la retourne relue."""
        with self._database.transaction(immediate=True) as connection:
            connection.execute(
                f"INSERT INTO ai_conversations({_CONVERSATION_COLUMNS}) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    entry.id,
                    entry.owner_id,
                    entry.subject_kind,
                    entry.subject_key,
                    entry.subject_json,
                    entry.title,
                    entry.model_name,
                    entry.seed_json,
                    entry.created_at,
                    entry.updated_at,
                ),
            )
        created = self.get_by_id(entry.id)
        if created is None:
            raise RuntimeError(f"Conversation {entry.id} introuvable après create")
        return created

    def get_by_id(self, conversation_id: str) -> AIConversationEntry | None:
        """Retourne une conversation par identifiant, ou ``None``."""
        rows = self._database.execute_fetchall(
            f"SELECT {_CONVERSATION_COLUMNS} FROM ai_conversations WHERE id = ?",
            (conversation_id,),
        )
        return self._conversation_from_row(rows[0]) if rows else None

    def list_for_owner(
        self,
        owner_id: str,
        *,
        subject_kind: str | None = None,
        subject_key: str | None = None,
        subject_key_prefix: str | None = None,
    ) -> list[AIConversationEntry]:
        """Liste les conversations d'un propriétaire, la plus récemment active d'abord.

        Args:
            owner_id: Propriétaire.
            subject_kind: Filtre exact sur le type de sujet.
            subject_key: Filtre exact sur la clé de sujet.
            subject_key_prefix: Filtre par préfixe de clé (ex. toutes les conversations
                d'un dialogue).
        """
        clauses = ["owner_id = ?"]
        parameters: list[object] = [owner_id]
        if subject_kind is not None:
            clauses.append("subject_kind = ?")
            parameters.append(subject_kind)
        if subject_key is not None:
            clauses.append("subject_key = ?")
            parameters.append(subject_key)
        if subject_key_prefix is not None:
            # substr plutôt que LIKE : la clé peut contenir % ou _.
            clauses.append("substr(subject_key, 1, ?) = ?")
            parameters.extend([len(subject_key_prefix), subject_key_prefix])
        rows = self._database.execute_fetchall(
            f"SELECT {_CONVERSATION_COLUMNS} FROM ai_conversations "
            f"WHERE {' AND '.join(clauses)} "
            "ORDER BY updated_at DESC, id ASC",
            tuple(parameters),
        )
        return [self._conversation_from_row(row) for row in rows]

    def delete(self, conversation_id: str) -> bool:
        """Supprime une conversation (ses messages partent en CASCADE)."""
        with self._database.transaction(immediate=True) as connection:
            cursor = connection.execute(
                "DELETE FROM ai_conversations WHERE id = ?",
                (conversation_id,),
            )
            return cursor.rowcount > 0

    def list_messages(self, conversation_id: str) -> list[AIConversationMessageEntry]:
        """Messages d'une conversation dans l'ordre."""
        rows = self._database.execute_fetchall(
            f"SELECT {_MESSAGE_COLUMNS} FROM ai_conversation_messages "
            "WHERE conversation_id = ? ORDER BY position ASC",
            (conversation_id,),
        )
        return [self._message_from_row(row) for row in rows]

    def count_messages(self, conversation_id: str) -> int:
        """Nombre de messages d'une conversation."""
        value = self._database.execute_scalar(
            "SELECT COUNT(*) FROM ai_conversation_messages WHERE conversation_id = ?",
            (conversation_id,),
        )
        return int(value or 0)  # type: ignore[arg-type]

    def message_counts(self, conversation_ids: list[str]) -> dict[str, int]:
        """Nombre de messages par conversation (0 pour une conversation sans message)."""
        if not conversation_ids:
            return {}
        placeholders = ", ".join("?" for _ in conversation_ids)
        rows = self._database.execute_fetchall(
            "SELECT conversation_id, COUNT(*) FROM ai_conversation_messages "
            f"WHERE conversation_id IN ({placeholders}) GROUP BY conversation_id",
            tuple(conversation_ids),
        )
        counts = {conversation_id: 0 for conversation_id in conversation_ids}
        counts.update({str(row[0]): int(row[1]) for row in rows})  # type: ignore[arg-type]
        return counts

    def append_exchange(
        self,
        conversation_id: str,
        user_message: NewAIConversationMessage,
        assistant_message: NewAIConversationMessage,
        *,
        updated_at: str,
        max_messages: int,
    ) -> tuple[AIConversationMessageEntry, AIConversationMessageEntry]:
        """Ajoute atomiquement une question et sa réponse en fin de conversation.

        Positions (max + 1, max + 2), plafond et ``updated_at`` sont traités dans la même
        transaction ``IMMEDIATE`` : deux ajouts concurrents ne peuvent ni se chevaucher ni
        dépasser le plafond ensemble.

        Raises:
            AIConversationMissingError: La conversation n'existe plus.
            AIConversationCapacityError: La paire dépasserait ``max_messages``.
        """
        with self._database.transaction(immediate=True) as connection:
            exists = connection.execute(
                "SELECT 1 FROM ai_conversations WHERE id = ?",
                (conversation_id,),
            ).fetchone()
            if exists is None:
                raise AIConversationMissingError(conversation_id)
            row = connection.execute(
                "SELECT COUNT(*), COALESCE(MAX(position), 0) "
                "FROM ai_conversation_messages WHERE conversation_id = ?",
                (conversation_id,),
            ).fetchone()
            count = int(row[0]) if row else 0
            last_position = int(row[1]) if row else 0
            if count + 2 > max_messages:
                raise AIConversationCapacityError(conversation_id)
            for offset, message in enumerate((user_message, assistant_message), start=1):
                connection.execute(
                    f"INSERT INTO ai_conversation_messages({_MESSAGE_COLUMNS}) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        message.id,
                        conversation_id,
                        last_position + offset,
                        message.role,
                        message.content,
                        message.reasoning_summary,
                        message.llm_call_id,
                        message.model_name,
                        message.cost_usd,
                        message.created_at,
                    ),
                )
            connection.execute(
                "UPDATE ai_conversations SET updated_at = ? WHERE id = ?",
                (updated_at, conversation_id),
            )
        rows = self._database.execute_fetchall(
            f"SELECT {_MESSAGE_COLUMNS} FROM ai_conversation_messages "
            "WHERE id IN (?, ?) ORDER BY position ASC",
            (user_message.id, assistant_message.id),
        )
        user_entry, assistant_entry = (self._message_from_row(r) for r in rows)
        return user_entry, assistant_entry

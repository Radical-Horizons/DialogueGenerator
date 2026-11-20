"""Tests du repository SQLite des conversations IA."""

from __future__ import annotations

import pytest

from services.repositories.sqlite.ai_conversations_repository import (
    AIConversationCapacityError,
    AIConversationEntry,
    AIConversationMissingError,
    AIConversationsRepository,
    NewAIConversationMessage,
)
from services.repositories.sqlite.connection import DatabaseConnection


@pytest.fixture
def repository(isolated_app_database: DatabaseConnection) -> AIConversationsRepository:
    """Repository sur la base de test migrée, avec un propriétaire et une conversation."""
    isolated_app_database.execute(
        "INSERT INTO users(id, username, role, is_active, created_at, updated_at) "
        "VALUES ('owner', 'owner', 'writer', 1, datetime('now'), datetime('now'))"
    )
    repo = AIConversationsRepository(isolated_app_database)
    repo.create(
        AIConversationEntry(
            id="conv-1",
            owner_id="owner",
            subject_kind="dialogue_node",
            subject_key="dialogue_node:D:N",
            subject_json="{}",
            title="Titre",
            model_name="gpt-6.2-sol",
            seed_json="{}",
            created_at="2026-11-19T10:00:00+00:00",
            updated_at="2026-11-19T10:00:00+00:00",
        )
    )
    return repo


def _pair(index: int) -> tuple[NewAIConversationMessage, NewAIConversationMessage]:
    """Question et réponse numérotées."""
    return (
        NewAIConversationMessage(id=f"u{index}", role="user", content=f"q{index}", created_at="t"),
        NewAIConversationMessage(id=f"a{index}", role="assistant", content=f"r{index}", created_at="t"),
    )


def test_append_exchange_positions_and_updated_at(repository: AIConversationsRepository) -> None:
    """Deux paires : positions 1..4 dans l'ordre, updated_at avancé."""
    repository.append_exchange("conv-1", *_pair(1), updated_at="t1", max_messages=40)
    user, assistant = repository.append_exchange("conv-1", *_pair(2), updated_at="t2", max_messages=40)

    assert (user.position, assistant.position) == (3, 4)
    assert [m.content for m in repository.list_messages("conv-1")] == ["q1", "r1", "q2", "r2"]
    entry = repository.get_by_id("conv-1")
    assert entry is not None and entry.updated_at == "t2"


def test_append_exchange_refuses_to_exceed_capacity(repository: AIConversationsRepository) -> None:
    """Paire qui dépasserait le plafond : AIConversationCapacityError, rien n'est écrit."""
    repository.append_exchange("conv-1", *_pair(1), updated_at="t1", max_messages=2)

    with pytest.raises(AIConversationCapacityError):
        repository.append_exchange("conv-1", *_pair(2), updated_at="t2", max_messages=2)
    assert repository.count_messages("conv-1") == 2
    entry = repository.get_by_id("conv-1")
    assert entry is not None and entry.updated_at == "t1"


def test_append_exchange_on_missing_conversation(repository: AIConversationsRepository) -> None:
    """Conversation supprimée entre-temps : AIConversationMissingError, aucun message orphelin."""
    assert repository.delete("conv-1") is True

    with pytest.raises(AIConversationMissingError):
        repository.append_exchange("conv-1", *_pair(1), updated_at="t1", max_messages=40)
    assert repository.count_messages("conv-1") == 0


def test_delete_cascades_messages(repository: AIConversationsRepository) -> None:
    """Supprimer une conversation retire ses messages (CASCADE)."""
    repository.append_exchange("conv-1", *_pair(1), updated_at="t1", max_messages=40)
    assert repository.delete("conv-1") is True
    assert repository.list_messages("conv-1") == []
    assert repository.delete("conv-1") is False

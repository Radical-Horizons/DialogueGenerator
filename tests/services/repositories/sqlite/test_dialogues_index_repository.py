"""Tests transactionnels du repository d'index des dialogues."""

from pathlib import Path

from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.dialogues_index_repository import (
    DialoguesIndexRepository,
)


def _insert_user(database: DatabaseConnection, user_id: str) -> None:
    """Insère un utilisateur minimal référencé par l'index dialogue."""
    database.execute(
        """
        INSERT INTO users(
            id, username, role, is_active, created_at, updated_at
        ) VALUES (?, ?, 'writer', 1, datetime('now'), datetime('now'))
        """,
        (user_id, user_id),
    )


def test_dialogue_index_crud_persists_owner_and_last_editor(
    isolated_app_database: DatabaseConnection,
    tmp_path: Path,
) -> None:
    """Le CRUD conserve propriétaire, chemin et dernier éditeur."""
    repository = DialoguesIndexRepository(isolated_app_database)
    _insert_user(isolated_app_database, "writer-a")
    _insert_user(isolated_app_database, "writer-b")

    created = repository.create(
        document_id="writer-dialogue",
        owner_id="writer-a",
        storage_path=tmp_path / "writer-dialogue.json",
        last_modified_by="writer-a",
    )
    updated = repository.update_after_write("writer-dialogue", "writer-b")

    assert created.owner_id == "writer-a"
    assert updated is not None
    assert updated.last_modified_by == "writer-b"
    assert repository.find_by_document_id("writer-dialogue") == updated
    assert repository.list_for_owner("writer-a") == [updated]
    assert repository.delete("writer-dialogue") is True
    assert repository.find_by_document_id("writer-dialogue") is None


def test_dialogue_index_create_is_atomic_on_duplicate(
    isolated_app_database: DatabaseConnection,
    tmp_path: Path,
) -> None:
    """Une création dupliquée ne modifie pas la ligne existante."""
    repository = DialoguesIndexRepository(isolated_app_database)
    _insert_user(isolated_app_database, "writer-a")
    _insert_user(isolated_app_database, "writer-b")
    original = repository.create(
        document_id="same-id",
        owner_id="writer-a",
        storage_path=tmp_path / "same-id.json",
        last_modified_by="writer-a",
    )

    try:
        repository.create(
            document_id="same-id",
            owner_id="writer-b",
            storage_path=tmp_path / "other.json",
            last_modified_by="writer-b",
        )
    except ValueError:
        pass
    else:
        raise AssertionError("Une ligne dupliquée doit être refusée")

    assert repository.find_by_document_id("same-id") == original

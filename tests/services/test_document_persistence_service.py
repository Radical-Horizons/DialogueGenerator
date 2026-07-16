"""Régressions de concurrence de l'autorité de persistance document."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event

import pytest

from services.document_persistence_service import DocumentPersistenceService
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.dialogues_index_repository import (
    DialoguesIndexRepository,
)


def _writer() -> dict[str, object]:
    """Retourne un writer authentifié minimal."""
    return {
        "id": "writer-lock",
        "username": "writer-lock",
        "role": "writer",
        "is_active": True,
    }


def test_read_document_cannot_observe_new_blob_with_old_revision(
    isolated_app_database: DatabaseConnection,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Une lecture attend la fin du couple écriture document/meta."""
    isolated_app_database.execute(
        """
        INSERT INTO users(
            id, username, role, is_active, created_at, updated_at
        ) VALUES (?, ?, 'writer', 1, datetime('now'), datetime('now'))
        """,
        ("writer-lock", "writer-lock"),
    )
    service = DocumentPersistenceService(
        DialoguesIndexRepository(isolated_app_database)
    )
    service.write_document(
        tmp_path,
        "serialized",
        {"schemaVersion": "1.2.0", "title": "before", "nodes": []},
        1,
        _writer(),
    )

    document_replaced = Event()
    allow_meta_write = Event()
    original_replace = service._replace_file

    def delayed_replace(path: Path, content: bytes) -> None:
        """Suspend l'update entre le blob et son sidecar."""
        original_replace(path, content)
        if path.name == "serialized.json":
            document_replaced.set()
            assert allow_meta_write.wait(timeout=2)

    monkeypatch.setattr(service, "_replace_file", delayed_replace)

    with ThreadPoolExecutor(max_workers=2) as executor:
        writer_future = executor.submit(
            service.write_document,
            tmp_path,
            "serialized",
            {"schemaVersion": "1.2.0", "title": "after", "nodes": []},
            1,
            _writer(),
        )
        assert document_replaced.wait(timeout=2)
        reader_future = executor.submit(
            service.read_document,
            tmp_path,
            "serialized",
            _writer(),
        )
        assert not reader_future.done()
        allow_meta_write.set()

        assert writer_future.result(timeout=2) == 2
        persisted = reader_future.result(timeout=2)

    assert persisted.document["title"] == "after"
    assert persisted.revision == 2

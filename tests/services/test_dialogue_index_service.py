"""Tests unitaires DialogueIndexService / FTS (Story 8.6)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.dialogue_index_service import (
    DialogueIndexService,
    DialogueReindexConflictError,
)
from services.repositories.sqlite.bootstrap import initialize_database
from services.repositories.sqlite.dialogues_search_repository import (
    DialoguesSearchRepository,
)


def test_index_search_delete_roundtrip(tmp_path: Path) -> None:
    """Index → MATCH → delete retire le hit."""
    database = initialize_database(tmp_path / "search.db")
    assert database is not None
    service = DialogueIndexService(DialoguesSearchRepository(database))
    doc = {
        "schemaVersion": "1.2.0",
        "nodes": [
            {"id": "START", "speaker": "Hero", "line": "Bonjour monde secret"},
        ],
    }
    service.index_document("doc1", doc)
    result = service.search("secret")
    assert [hit.document_id for hit in result.hits] == ["doc1"]
    service.remove_document("doc1")
    assert service.search("secret").hits == []


def test_begin_rebuild_conflict(tmp_path: Path) -> None:
    """Deux begin_rebuild consécutifs → conflit."""
    database = initialize_database(tmp_path / "search.db")
    assert database is not None
    service = DialogueIndexService(DialoguesSearchRepository(database))
    service.begin_rebuild()
    with pytest.raises(DialogueReindexConflictError):
        service.begin_rebuild()


def test_rebuild_from_directory(tmp_path: Path) -> None:
    """Rebuild scanne le dossier Unity."""
    database = initialize_database(tmp_path / "search.db")
    assert database is not None
    unity = tmp_path / "Dialogues"
    unity.mkdir()
    (unity / "a.json").write_text(
        json.dumps(
            {
                "schemaVersion": "1.2.0",
                "nodes": [{"id": "START", "speaker": "A", "line": "pomme rouge"}],
            }
        ),
        encoding="utf-8",
    )
    service = DialogueIndexService(DialoguesSearchRepository(database))
    service.begin_rebuild()
    count = service.rebuild_from_directory(unity)
    assert count == 1
    assert service.search("pomme").hits[0].document_id == "a"
    stats = service.get_stats()
    assert stats.rebuild_status == "done"
    assert stats.indexed_count == 1

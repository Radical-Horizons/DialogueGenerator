"""Tests API Story 8.6 — recherche FTS + reindex admin (FR85)."""

from __future__ import annotations

from pathlib import Path
from typing import Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app
from api.routers.auth import get_current_user, get_current_user_or_none
from services.configuration_service import ConfigurationService
from services.repositories.sqlite.connection import DatabaseConnection


def _user(user_id: str, role: str = "writer") -> dict[str, object]:
    """Construit une identité active pour une dépendance de test."""
    return {
        "id": user_id,
        "username": user_id,
        "role": role,
        "is_active": True,
    }


@pytest.fixture
def search_client(
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
) -> Iterator[tuple[TestClient, Path]]:
    """Client API avec writers + admin et dossier Unity temporaire."""
    dialogue_dir = tmp_path / "Dialogues"
    layout_dir = tmp_path / "Layouts"
    dialogue_dir.mkdir()
    layout_dir.mkdir()
    config = MagicMock(spec=ConfigurationService)
    config.get_unity_dialogues_path.return_value = dialogue_dir
    config.get_unity_layouts_path.return_value = layout_dir
    for user_id, role in (
        ("writer-a", "writer"),
        ("writer-b", "writer"),
        ("admin-a", "admin"),
    ):
        isolated_app_database.execute(
            """
            INSERT INTO users(
                id, username, role, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
            """,
            (user_id, user_id, role),
        )
    app.dependency_overrides[get_config_service] = lambda: config
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    app.dependency_overrides[get_current_user_or_none] = lambda: _user("writer-a")
    try:
        yield TestClient(app), dialogue_dir
    finally:
        app.dependency_overrides.clear()


def _put_doc(client: TestClient, document_id: str, line: str, speaker: str) -> None:
    """Crée un document indexable."""
    assert client.put(
        f"/api/v1/documents/{document_id}",
        json={
            "document": {
                "schemaVersion": "1.2.0",
                "nodes": [
                    {
                        "id": "START",
                        "speaker": speaker,
                        "line": line,
                        "choices": [],
                    }
                ],
            },
            "revision": 1,
        },
    ).status_code == 200


def test_index_on_write_and_search_hit(
    search_client: tuple[TestClient, Path],
) -> None:
    """PUT indexe ; search retrouve le terme."""
    client, _ = search_client
    _put_doc(client, "quest-alpha", "La trahison du seigneur", "Uresair")
    found = client.get("/api/v1/unity-dialogues/search", params={"q": "trahison"})
    assert found.status_code == 200
    body = found.json()
    assert "quest-alpha" in body["document_ids"]
    assert body["elapsed_ms"] >= 0


def test_search_miss_and_delete_removes(
    search_client: tuple[TestClient, Path],
) -> None:
    """Terme inconnu → [] ; DELETE retire de l'index."""
    client, dialogue_dir = search_client
    _put_doc(client, "quest-beta", "Un secret ancestral", "Valkazer")
    miss = client.get("/api/v1/unity-dialogues/search", params={"q": "zzzznotinindex"})
    assert miss.status_code == 200
    assert miss.json()["document_ids"] == []

    assert client.delete("/api/v1/unity-dialogues/quest-beta.json").status_code == 204
    after = client.get("/api/v1/unity-dialogues/search", params={"q": "ancestral"})
    assert after.status_code == 200
    assert "quest-beta" not in after.json()["document_ids"]


def test_search_rbac_hides_private_doc(
    search_client: tuple[TestClient, Path],
) -> None:
    """Writer B ne voit pas le document privé de A via search."""
    client, _ = search_client
    _put_doc(client, "private-a", "Mot clef unique xyz", "Npc")
    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    app.dependency_overrides[get_current_user_or_none] = lambda: _user("writer-b")
    found = client.get("/api/v1/unity-dialogues/search", params={"q": "xyz"})
    assert found.status_code == 200
    assert "private-a" not in found.json()["document_ids"]


def test_search_empty_query_rejected(
    search_client: tuple[TestClient, Path],
) -> None:
    """q vide → 422."""
    client, _ = search_client
    response = client.get("/api/v1/unity-dialogues/search", params={"q": "   "})
    assert response.status_code == 422


def test_admin_reindex_and_stats(
    search_client: tuple[TestClient, Path],
) -> None:
    """Admin : reindex 202 + stats ; non-admin 403."""
    client, dialogue_dir = search_client
    _put_doc(client, "idx-1", "Hello indexed world", "Narrator")
    legacy = dialogue_dir / "legacy-file.json"
    legacy.write_text(
        '{"schemaVersion":"1.2.0","nodes":[{"id":"START","speaker":"X","line":"legacy token"}]}',
        encoding="utf-8",
    )

    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    app.dependency_overrides[get_current_user_or_none] = lambda: _user("writer-a")
    assert client.post("/api/v1/admin/reindex").status_code == 403

    app.dependency_overrides[get_current_user] = lambda: _user("admin-a", role="admin")
    app.dependency_overrides[get_current_user_or_none] = lambda: _user(
        "admin-a", role="admin"
    )
    started = client.post("/api/v1/admin/reindex")
    assert started.status_code == 202

    import time

    for _ in range(80):
        stats = client.get("/api/v1/admin/search-stats")
        assert stats.status_code == 200
        status_value = stats.json()["rebuild_status"]
        if status_value != "running":
            break
        time.sleep(0.05)

    stats = client.get("/api/v1/admin/search-stats").json()
    assert stats["rebuild_status"] in ("done", "idle")
    assert stats["indexed_count"] >= 1

    found = client.get("/api/v1/unity-dialogues/search", params={"q": "legacy"})
    assert found.status_code == 200
    assert "legacy-file" in found.json()["document_ids"]

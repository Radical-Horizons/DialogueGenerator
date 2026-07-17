"""Tests API Story 7.6 — partage co-édition entre writers."""

from __future__ import annotations

from pathlib import Path
from typing import Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app
from api.routers.auth import get_current_user
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
def shares_client(
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
) -> Iterator[tuple[TestClient, Path]]:
    """Client API avec writers A/B, admin et stockage temporaire."""
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
    try:
        yield TestClient(app), dialogue_dir
    finally:
        app.dependency_overrides.clear()


def _create_owned(client: TestClient, document_id: str = "shared-doc") -> None:
    """Crée un document propriétaire pour writer-a."""
    assert client.put(
        f"/api/v1/documents/{document_id}",
        json={
            "document": {"schemaVersion": "1.2.0", "nodes": []},
            "revision": 1,
        },
    ).status_code == 200


def test_owner_grant_lists_coeditor_and_allows_put(
    shares_client: tuple[TestClient, Path],
) -> None:
    """Grant → B voit et édite ; last_modified_by = B."""
    client, _ = shares_client
    _create_owned(client)

    granted = client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-b"},
    )
    assert granted.status_code == 201
    assert granted.json()["username"] == "writer-b"
    assert granted.json()["permission"] == "writer"

    listed = client.get("/api/v1/dialogues/shared-doc/shares")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    loaded = client.get("/api/v1/documents/shared-doc")
    assert loaded.status_code == 200
    assert loaded.json()["capabilities"] == {
        "can_read": True,
        "can_edit": True,
        "can_delete": False,
        "is_owner": False,
    }

    updated = client.put(
        "/api/v1/documents/shared-doc",
        json={
            "document": {
                "schemaVersion": "1.2.0",
                "title": "by-b",
                "nodes": [],
            },
            "revision": 1,
        },
    )
    assert updated.status_code == 200

    index = app.state.container.get_dialogues_index_repository().find_by_document_id(
        "shared-doc"
    )
    assert index is not None
    assert index.last_modified_by == "writer-b"

    listed_for_b = client.get("/api/v1/unity-dialogues")
    assert listed_for_b.status_code == 200
    payload = listed_for_b.json()
    items = payload["dialogues"] if isinstance(payload, dict) else payload
    filenames = {item["filename"] for item in items}
    assert "shared-doc.json" in filenames


def test_coeditor_delete_denied_and_revoke_removes_access(
    shares_client: tuple[TestClient, Path],
) -> None:
    """Delete interdit au co-éditeur ; revoke → 403 lecture."""
    client, dialogue_dir = shares_client
    _create_owned(client)
    assert client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-b"},
    ).status_code == 201

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert client.delete("/api/v1/documents/shared-doc").status_code == 403
    assert (dialogue_dir / "shared-doc.json").exists()

    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    revoked = client.delete("/api/v1/dialogues/shared-doc/shares/writer-b")
    assert revoked.status_code == 204

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert client.get("/api/v1/documents/shared-doc").status_code == 403
    assert client.put(
        "/api/v1/documents/shared-doc",
        json={
            "document": {"schemaVersion": "1.2.0", "nodes": []},
            "revision": 1,
        },
    ).status_code == 403


def test_non_owner_grant_forbidden_and_self_share_rejected(
    shares_client: tuple[TestClient, Path],
) -> None:
    """Non-owner → 403 ; auto-partage → 400."""
    client, _ = shares_client
    _create_owned(client)

    self_share = client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-a"},
    )
    assert self_share.status_code == 400

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-a"},
    ).status_code == 403


def test_admin_can_grant_and_guest_cannot_manage_shares(
    shares_client: tuple[TestClient, Path],
) -> None:
    """Admin grant OK ; guest management 403."""
    client, _ = shares_client
    _create_owned(client)

    app.dependency_overrides[get_current_user] = lambda: _user("admin-a", "admin")
    granted = client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-b"},
    )
    assert granted.status_code == 201

    app.dependency_overrides[get_current_user] = lambda: {
        "id": "guest-session",
        "username": "guest",
        "role": "guest",
        "is_active": True,
    }
    assert client.get("/api/v1/dialogues/shared-doc/shares").status_code == 403
    assert client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-b"},
    ).status_code == 403


def test_coeditor_cannot_list_shares(
    shares_client: tuple[TestClient, Path],
) -> None:
    """Le co-éditeur ne gère pas les partages."""
    client, _ = shares_client
    _create_owned(client)
    assert client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-b"},
    ).status_code == 201
    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert client.get("/api/v1/dialogues/shared-doc/shares").status_code == 403


def test_inactive_writer_share_loses_edit_access(
    shares_client: tuple[TestClient, Path],
    isolated_app_database: DatabaseConnection,
) -> None:
    """Un writer désactivé ne conserve pas can_edit via share."""
    client, _ = shares_client
    _create_owned(client)
    assert client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-b"},
    ).status_code == 201
    isolated_app_database.execute(
        "UPDATE users SET is_active = 0 WHERE id = ?",
        ("writer-b",),
    )
    app.dependency_overrides[get_current_user] = lambda: {
        **_user("writer-b"),
        "is_active": False,
    }
    assert client.get("/api/v1/documents/shared-doc").status_code == 403


def test_unknown_user_and_duplicate_share(
    shares_client: tuple[TestClient, Path],
) -> None:
    """404 utilisateur inconnu ; 409 doublon."""
    client, _ = shares_client
    _create_owned(client)

    missing = client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "inconnu"},
    )
    assert missing.status_code == 404

    assert client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-b"},
    ).status_code == 201
    duplicate = client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-b"},
    )
    assert duplicate.status_code == 409


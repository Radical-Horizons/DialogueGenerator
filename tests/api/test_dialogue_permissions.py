"""Tests API Story 7.7 — vue agrégée des permissions dialogue."""

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
    """Construit une identité active pour les tests d'autorisation."""
    return {
        "id": user_id,
        "username": user_id,
        "role": role,
        "is_active": True,
    }


@pytest.fixture
def permissions_client(
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
) -> Iterator[TestClient]:
    """Crée un client isolé avec owner, co-éditeur, outsider et admin."""
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
        ("writer-c", "writer"),
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
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _create_owned(client: TestClient, document_id: str = "shared-doc") -> None:
    """Crée un document appartenant à writer-a."""
    response = client.put(
        f"/api/v1/documents/{document_id}",
        json={
            "document": {"schemaVersion": "1.2.0", "nodes": []},
            "revision": 1,
        },
    )
    assert response.status_code == 200


def _share_with_writer_b(client: TestClient) -> None:
    """Partage le document de test avec writer-b."""
    response = client.post(
        "/api/v1/dialogues/shared-doc/shares",
        json={"username": "writer-b"},
    )
    assert response.status_code == 201


def test_owner_coeditor_and_admin_can_view_permissions(
    permissions_client: TestClient,
) -> None:
    """Owner/co-éditeur/admin voient l'agrégat avec can_manage adapté."""
    client = permissions_client
    _create_owned(client)
    _share_with_writer_b(client)

    owner_response = client.get("/api/v1/dialogues/shared-doc/permissions")
    assert owner_response.status_code == 200
    assert owner_response.json() == {
        "owner": {"user_id": "writer-a", "username": "writer-a"},
        "co_editors": [
            {
                "document_id": "shared-doc",
                "user_id": "writer-b",
                "username": "writer-b",
                "permission": "writer",
                "created_at": owner_response.json()["co_editors"][0]["created_at"],
            }
        ],
        "can_manage": True,
    }

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    coeditor_response = client.get("/api/v1/dialogues/shared-doc/permissions")
    assert coeditor_response.status_code == 200
    assert coeditor_response.json()["can_manage"] is False
    assert coeditor_response.json()["owner"]["username"] == "writer-a"

    app.dependency_overrides[get_current_user] = lambda: _user("admin-a", "admin")
    admin_response = client.get("/api/v1/dialogues/shared-doc/permissions")
    assert admin_response.status_code == 200
    assert admin_response.json()["can_manage"] is True


def test_permissions_reject_guest_outsider_and_missing_document(
    permissions_client: TestClient,
) -> None:
    """Guest et writer sans can_read reçoivent 403 ; document absent 404."""
    client = permissions_client
    _create_owned(client)

    app.dependency_overrides[get_current_user] = lambda: _user("writer-c")
    assert client.get("/api/v1/dialogues/shared-doc/permissions").status_code == 403
    assert client.get("/api/v1/dialogues/absent/permissions").status_code == 404

    app.dependency_overrides[get_current_user] = lambda: {
        **_user("guest-session", "guest"),
    }
    assert client.get("/api/v1/dialogues/shared-doc/permissions").status_code == 403


def test_revoke_updates_permissions_and_access(
    permissions_client: TestClient,
) -> None:
    """Une révocation retire le co-éditeur de l'agrégat et son accès."""
    client = permissions_client
    _create_owned(client)
    _share_with_writer_b(client)

    revoked = client.delete("/api/v1/dialogues/shared-doc/shares/writer-b")
    assert revoked.status_code == 204
    permissions = client.get("/api/v1/dialogues/shared-doc/permissions")
    assert permissions.status_code == 200
    assert permissions.json()["co_editors"] == []

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert client.get("/api/v1/dialogues/shared-doc/permissions").status_code == 403
    assert client.get("/api/v1/documents/shared-doc").status_code == 403


def test_unity_dialogue_list_exposes_batch_share_count(
    permissions_client: TestClient,
) -> None:
    """Le listing expose zéro ou N partages sans appel permissions par item."""
    client = permissions_client
    _create_owned(client, "private-doc")
    _create_owned(client)
    _share_with_writer_b(client)

    response = client.get("/api/v1/unity-dialogues")
    assert response.status_code == 200
    by_filename = {
        item["filename"]: item["share_count"]
        for item in response.json()["dialogues"]
    }
    assert by_filename["private-doc.json"] == 0
    assert by_filename["shared-doc.json"] == 1


def test_inactive_share_excluded_from_permissions_and_count(
    permissions_client: TestClient,
    isolated_app_database: DatabaseConnection,
) -> None:
    """Un co-éditeur désactivé n'apparaît plus dans l'agrégat ni le badge."""
    client = permissions_client
    _create_owned(client)
    _share_with_writer_b(client)
    isolated_app_database.execute(
        "UPDATE users SET is_active = 0 WHERE id = ?",
        ("writer-b",),
    )

    permissions = client.get("/api/v1/dialogues/shared-doc/permissions")
    assert permissions.status_code == 200
    assert permissions.json()["co_editors"] == []

    listing = client.get("/api/v1/unity-dialogues")
    assert listing.status_code == 200
    by_filename = {
        item["filename"]: item["share_count"]
        for item in listing.json()["dialogues"]
    }
    assert by_filename["shared-doc.json"] == 0

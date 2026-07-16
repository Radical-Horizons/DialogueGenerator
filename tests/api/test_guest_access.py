"""Tests d'accès invité applicatif (Story 7.5)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app
from services.configuration_service import ConfigurationService
from services.repositories.sqlite.connection import DatabaseConnection


@pytest.fixture
def guest_token(seeded_auth_client: TestClient) -> str:
    """Émet un access token invité via POST /auth/guest."""
    response = seeded_auth_client.post("/api/v1/auth/guest")
    assert response.status_code == 200
    assert "refresh_token=" not in response.headers.get("set-cookie", "")
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 8 * 60 * 60
    return data["access_token"]


def test_guest_login_and_me(seeded_auth_client: TestClient, guest_token: str) -> None:
    """L'invité résout /me avec role=guest sans compte SQLite."""
    response = seeded_auth_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {guest_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "guest"
    assert data["username"] == "guest"
    assert data["is_active"] is True


def test_guest_can_read_document(
    seeded_auth_client: TestClient,
    guest_token: str,
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
) -> None:
    """Un invité lit un document existant en bibliothèque."""
    dialogue_dir = tmp_path / "Dialogues"
    layout_dir = tmp_path / "Layouts"
    dialogue_dir.mkdir()
    layout_dir.mkdir()
    doc_id = "demo-guest"
    document = {"schemaVersion": "1.1.0", "nodes": []}
    (dialogue_dir / f"{doc_id}.json").write_text(
        json.dumps(document),
        encoding="utf-8",
    )
    isolated_app_database.execute(
        """
        INSERT INTO users(id, username, role, is_active, created_at, updated_at)
        VALUES ('writer-a', 'writer-a', 'writer', 1, datetime('now'), datetime('now'))
        """
    )
    isolated_app_database.execute(
        """
        INSERT INTO dialogues_index(
            document_id, owner_id, storage_path, last_modified_by, created_at, updated_at
        ) VALUES (?, 'writer-a', ?, 'writer-a', datetime('now'), datetime('now'))
        """,
        (doc_id, str(dialogue_dir / f"{doc_id}.json")),
    )
    config = MagicMock(spec=ConfigurationService)
    config.get_unity_dialogues_path.return_value = dialogue_dir
    config.get_unity_layouts_path.return_value = layout_dir
    app.dependency_overrides[get_config_service] = lambda: config
    try:
        response = seeded_auth_client.get(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {guest_token}"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["capabilities"]["can_read"] is True
        assert payload["capabilities"]["can_edit"] is False
        assert payload["capabilities"]["can_delete"] is False
    finally:
        app.dependency_overrides.pop(get_config_service, None)


def test_guest_cannot_mutate_document(
    seeded_auth_client: TestClient,
    guest_token: str,
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
) -> None:
    """PUT/DELETE document sont refusés pour un invité."""
    dialogue_dir = tmp_path / "Dialogues"
    layout_dir = tmp_path / "Layouts"
    dialogue_dir.mkdir()
    layout_dir.mkdir()
    doc_id = "locked-guest"
    document = {"schemaVersion": "1.1.0", "nodes": []}
    (dialogue_dir / f"{doc_id}.json").write_text(
        json.dumps(document),
        encoding="utf-8",
    )
    (dialogue_dir / f"{doc_id}.meta").write_text(
        json.dumps({"revision": 1}),
        encoding="utf-8",
    )
    isolated_app_database.execute(
        """
        INSERT INTO users(id, username, role, is_active, created_at, updated_at)
        VALUES ('writer-a', 'writer-a', 'writer', 1, datetime('now'), datetime('now'))
        """
    )
    isolated_app_database.execute(
        """
        INSERT INTO dialogues_index(
            document_id, owner_id, storage_path, last_modified_by, created_at, updated_at
        ) VALUES (?, 'writer-a', ?, 'writer-a', datetime('now'), datetime('now'))
        """,
        (doc_id, str(dialogue_dir / f"{doc_id}.json")),
    )
    config = MagicMock(spec=ConfigurationService)
    config.get_unity_dialogues_path.return_value = dialogue_dir
    config.get_unity_layouts_path.return_value = layout_dir
    app.dependency_overrides[get_config_service] = lambda: config
    try:
        put_response = seeded_auth_client.put(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {guest_token}"},
            json={"document": document, "revision": 1},
        )
        delete_response = seeded_auth_client.delete(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {guest_token}"},
        )
        assert put_response.status_code == 403
        assert delete_response.status_code == 403
        assert (dialogue_dir / f"{doc_id}.json").exists()
    finally:
        app.dependency_overrides.pop(get_config_service, None)


def test_guest_cannot_generate_node(
    seeded_auth_client: TestClient,
    guest_token: str,
) -> None:
    """La génération de nœud est refusée pour un invité."""
    response = seeded_auth_client.post(
        "/api/v1/unity-dialogues/graph/generate-node",
        headers={"Authorization": f"Bearer {guest_token}"},
        json={
            "parent_node_id": "START",
            "parent_node_content": "Bonjour",
            "user_instructions": "suite",
            "context_selections": {"characters_full": ["Hero"]},
        },
    )
    assert response.status_code == 403

def test_guest_cannot_access_admin(
    seeded_auth_client: TestClient,
    guest_token: str,
) -> None:
    """Les routes admin restent interdites à l'invité."""
    response = seeded_auth_client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {guest_token}"},
    )
    assert response.status_code == 403

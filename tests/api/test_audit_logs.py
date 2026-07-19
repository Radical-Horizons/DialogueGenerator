"""Tests API Story 7.8 — journaux d'audit append-only (FR71)."""

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


def _admin_user() -> dict[str, object]:
    """Identité admin pour les overrides de dépendances."""
    return {
        "id": "admin-a",
        "username": "admin-a",
        "role": "admin",
        "is_active": True,
    }


def _writer_user() -> dict[str, object]:
    """Identité writer pour les overrides de dépendances."""
    return {
        "id": "writer-a",
        "username": "writer-a",
        "role": "writer",
        "is_active": True,
    }


def _guest_user() -> dict[str, object]:
    """Identité guest pour les overrides de dépendances."""
    return {
        "id": "guest",
        "username": "guest",
        "role": "guest",
        "is_active": True,
    }


@pytest.fixture
def audit_client(
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
) -> Iterator[TestClient]:
    """Client isolé avec users seedés et auth admin par défaut."""
    dialogue_dir = tmp_path / "Dialogues"
    layout_dir = tmp_path / "Layouts"
    dialogue_dir.mkdir()
    layout_dir.mkdir()
    config = MagicMock(spec=ConfigurationService)
    config.get_unity_dialogues_path.return_value = dialogue_dir
    config.get_unity_layouts_path.return_value = layout_dir
    for user_id, role in (
        ("admin-a", "admin"),
        ("writer-a", "writer"),
        ("writer-b", "writer"),
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
    app.dependency_overrides[get_current_user] = _admin_user
    app.dependency_overrides[get_current_user_or_none] = _admin_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_user_create_persists_audit_entry(audit_client: TestClient) -> None:
    """Une création de compte produit une entrée user.created."""
    created = audit_client.post(
        "/api/v1/users",
        json={
            "username": "new-writer",
            "email": "new-writer@example.com",
            "password": "strong-pass-123",
        },
    )
    assert created.status_code == 201

    response = audit_client.get("/api/v1/audit-logs", params={"action": "user.created"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    entry = body["items"][0]
    assert entry["action"] == "user.created"
    assert entry["actor_username"] == "admin-a"
    assert entry["target_type"] == "user"
    assert entry["metadata"]["username"] == "new-writer"


def test_dialogue_save_and_share_produce_audit_entries(
    audit_client: TestClient,
) -> None:
    """Save + grant/revoke partages journalisent les actions dialogue.*."""
    app.dependency_overrides[get_current_user] = _writer_user
    app.dependency_overrides[get_current_user_or_none] = _writer_user
    put = audit_client.put(
        "/api/v1/documents/audit-doc",
        json={
            "document": {"schemaVersion": "1.2.0", "nodes": []},
            "revision": 1,
        },
    )
    assert put.status_code == 200

    share = audit_client.post(
        "/api/v1/dialogues/audit-doc/shares",
        json={"username": "writer-b"},
    )
    assert share.status_code == 201
    revoke = audit_client.delete("/api/v1/dialogues/audit-doc/shares/writer-b")
    assert revoke.status_code == 204

    app.dependency_overrides[get_current_user] = _admin_user
    app.dependency_overrides[get_current_user_or_none] = _admin_user

    saved = audit_client.get(
        "/api/v1/audit-logs",
        params={"action": "dialogue.saved"},
    )
    assert saved.status_code == 200
    assert saved.json()["total"] >= 1
    assert saved.json()["items"][0]["target_id"] == "audit-doc"

    granted = audit_client.get(
        "/api/v1/audit-logs",
        params={"action": "dialogue.share.granted"},
    )
    assert granted.json()["total"] >= 1

    revoked = audit_client.get(
        "/api/v1/audit-logs",
        params={"action": "dialogue.share.revoked"},
    )
    assert revoked.json()["total"] >= 1


def test_role_update_and_dialogue_delete_persist_audit(
    audit_client: TestClient,
) -> None:
    """PATCH user et DELETE document journalisent les actions MVP manquantes."""
    created = audit_client.post(
        "/api/v1/users",
        json={
            "username": "role-writer",
            "email": "role-writer@example.com",
            "password": "strong-pass-123",
        },
    )
    assert created.status_code == 201
    user_id = created.json()["id"]

    patched = audit_client.patch(
        f"/api/v1/users/{user_id}",
        json={"is_active": False},
    )
    assert patched.status_code == 200

    app.dependency_overrides[get_current_user] = _writer_user
    app.dependency_overrides[get_current_user_or_none] = _writer_user
    put = audit_client.put(
        "/api/v1/documents/delete-doc",
        json={
            "document": {"schemaVersion": "1.2.0", "nodes": []},
            "revision": 1,
        },
    )
    assert put.status_code == 200
    deleted = audit_client.delete("/api/v1/documents/delete-doc")
    assert deleted.status_code == 204

    app.dependency_overrides[get_current_user] = _admin_user
    app.dependency_overrides[get_current_user_or_none] = _admin_user

    role_logs = audit_client.get(
        "/api/v1/audit-logs",
        params={"action": "user.role_status.updated"},
    )
    assert role_logs.status_code == 200
    assert role_logs.json()["total"] >= 1

    delete_logs = audit_client.get(
        "/api/v1/audit-logs",
        params={"action": "dialogue.deleted"},
    )
    assert delete_logs.status_code == 200
    assert delete_logs.json()["total"] >= 1
    assert delete_logs.json()["items"][0]["target_id"] == "delete-doc"


def test_export_headers_and_csv_formula_neutralization(
    audit_client: TestClient,
    isolated_app_database: DatabaseConnection,
) -> None:
    """L'export expose les headers de troncature et neutralise les formules CSV."""
    from services.repositories.sqlite.audit_logs_repository import (
        AuditLogsRepository,
    )

    AuditLogsRepository(isolated_app_database).insert(
        entry_id="formula-1",
        created_at="2026-07-19T12:00:00+00:00",
        actor_user_id="admin-a",
        actor_username="=cmd|calc",
        action="user.created",
        target_type="user",
        target_id="x",
        metadata="{}",
    )
    csv_export = audit_client.get(
        "/api/v1/audit-logs/export",
        params={"format": "csv", "action": "user.created"},
    )
    assert csv_export.status_code == 200
    assert csv_export.headers.get("X-Audit-Export-Truncated") == "false"
    assert "X-Audit-Export-Total" in csv_export.headers
    assert b"'=cmd|calc" in csv_export.content


def test_list_audit_logs_filters_and_empty(
    audit_client: TestClient,
) -> None:
    """Filtres action/username et liste vide fonctionnent."""
    audit_client.post(
        "/api/v1/users",
        json={
            "username": "filter-writer",
            "email": "filter-writer@example.com",
            "password": "strong-pass-123",
        },
    )
    filtered = audit_client.get(
        "/api/v1/audit-logs",
        params={"username": "admin-a", "action": "user.created"},
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] >= 1

    empty = audit_client.get(
        "/api/v1/audit-logs",
        params={"action": "dialogue.deleted"},
    )
    assert empty.status_code == 200
    assert empty.json()["total"] == 0
    assert empty.json()["items"] == []


def test_export_json_and_csv(audit_client: TestClient) -> None:
    """L'export admin renvoie JSON et CSV téléchargeables."""
    audit_client.post(
        "/api/v1/users",
        json={
            "username": "export-writer",
            "email": "export-writer@example.com",
            "password": "strong-pass-123",
        },
    )
    json_export = audit_client.get(
        "/api/v1/audit-logs/export",
        params={"format": "json", "action": "user.created"},
    )
    assert json_export.status_code == 200
    assert "application/json" in json_export.headers["content-type"]
    assert b"user.created" in json_export.content

    csv_export = audit_client.get(
        "/api/v1/audit-logs/export",
        params={"format": "csv", "action": "user.created"},
    )
    assert csv_export.status_code == 200
    assert "text/csv" in csv_export.headers["content-type"]
    assert b"actor_username" in csv_export.content


def test_writer_and_guest_forbidden_on_audit_endpoints(
    audit_client: TestClient,
) -> None:
    """Writer et guest reçoivent 403 sur list et export."""
    for identity in (_writer_user, _guest_user):
        app.dependency_overrides[get_current_user_or_none] = identity
        listed = audit_client.get("/api/v1/audit-logs")
        exported = audit_client.get(
            "/api/v1/audit-logs/export",
            params={"format": "json"},
        )
        assert listed.status_code == 403
        assert exported.status_code == 403


def test_invalid_date_range_returns_422(audit_client: TestClient) -> None:
    """Une plage de dates inversée est rejetée."""
    response = audit_client.get(
        "/api/v1/audit-logs",
        params={"start_date": "2026-07-19", "end_date": "2026-07-01"},
    )
    assert response.status_code == 422


def test_audit_repository_has_no_update_delete_api(
    isolated_app_database: DatabaseConnection,
) -> None:
    """Le repository n'expose que insert et lecture filtrée."""
    from services.repositories.sqlite.audit_logs_repository import (
        AuditLogsRepository,
    )

    repository = AuditLogsRepository(isolated_app_database)
    assert not hasattr(repository, "update")
    assert not hasattr(repository, "delete")
    assert callable(repository.insert)
    assert callable(repository.list_filtered)

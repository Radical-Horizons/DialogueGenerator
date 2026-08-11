"""Tests API Story 8.5 — collections de dialogues (FR84)."""

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
def collections_client(
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
) -> Iterator[tuple[TestClient, Path]]:
    """Client API avec writers A/B et stockage temporaire."""
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


def _create_owned(client: TestClient, document_id: str) -> None:
    """Crée un document propriétaire pour l'utilisateur courant."""
    assert client.put(
        f"/api/v1/documents/{document_id}",
        json={
            "document": {"schemaVersion": "1.2.0", "nodes": []},
            "revision": 1,
        },
    ).status_code == 200


def test_create_collection_empty(
    collections_client: tuple[TestClient, Path],
) -> None:
    """Création → 201 ; dialogue_ids vide ; listée."""
    client, _ = collections_client
    created = client.post(
        "/api/v1/collections",
        json={"name": "Chapitre 1", "icon": "📁"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Chapitre 1"
    assert body["icon"] == "📁"
    assert body["dialogue_ids"] == []

    listed = client.get("/api/v1/collections")
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_add_two_documents_and_filter_membership(
    collections_client: tuple[TestClient, Path],
) -> None:
    """Ajout de 2 docs → membership 2."""
    client, _ = collections_client
    _create_owned(client, "doc-a")
    _create_owned(client, "doc-b")
    collection_id = client.post(
        "/api/v1/collections",
        json={"name": "C"},
    ).json()["id"]

    added = client.post(
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": ["doc-a", "doc-b"]},
    )
    assert added.status_code == 200
    assert set(added.json()["dialogue_ids"]) == {"doc-a", "doc-b"}

    fetched = client.get(f"/api/v1/collections/{collection_id}")
    assert set(fetched.json()["dialogue_ids"]) == {"doc-a", "doc-b"}


def test_document_in_multiple_collections(
    collections_client: tuple[TestClient, Path],
) -> None:
    """Un même dialogue peut appartenir à deux collections."""
    client, _ = collections_client
    _create_owned(client, "shared-doc")
    c1 = client.post("/api/v1/collections", json={"name": "C1"}).json()["id"]
    c2 = client.post("/api/v1/collections", json={"name": "C2"}).json()["id"]
    assert (
        client.post(
            f"/api/v1/collections/{c1}/dialogues",
            json={"document_ids": ["shared-doc"]},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/collections/{c2}/dialogues",
            json={"document_ids": ["shared-doc"]},
        ).status_code
        == 200
    )
    assert "shared-doc" in client.get(f"/api/v1/collections/{c1}").json()["dialogue_ids"]
    assert "shared-doc" in client.get(f"/api/v1/collections/{c2}").json()["dialogue_ids"]


def test_delete_collection_keeps_dialogues(
    collections_client: tuple[TestClient, Path],
) -> None:
    """DELETE collection retire les liens, pas les documents."""
    client, _ = collections_client
    for doc_id in ("d1", "d2", "d3"):
        _create_owned(client, doc_id)
    collection_id = client.post(
        "/api/v1/collections",
        json={"name": "Temp"},
    ).json()["id"]
    client.post(
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": ["d1", "d2", "d3"]},
    )
    deleted = client.delete(f"/api/v1/collections/{collection_id}")
    assert deleted.status_code == 200
    assert deleted.json()["removed_dialogue_count"] == 3
    assert client.get(f"/api/v1/collections/{collection_id}").status_code == 404
    for doc_id in ("d1", "d2", "d3"):
        assert client.get(f"/api/v1/documents/{doc_id}").status_code == 200


def test_readd_document_is_idempotent(
    collections_client: tuple[TestClient, Path],
) -> None:
    """Re-ajout d'un membre existant → 200 no-op."""
    client, _ = collections_client
    _create_owned(client, "doc-once")
    collection_id = client.post(
        "/api/v1/collections",
        json={"name": "Idem"},
    ).json()["id"]
    first = client.post(
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": ["doc-once"]},
    )
    second = client.post(
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": ["doc-once"]},
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["dialogue_ids"] == ["doc-once"]


def test_add_unknown_document_returns_404(
    collections_client: tuple[TestClient, Path],
) -> None:
    """document_id absent de l'index → 404."""
    client, _ = collections_client
    collection_id = client.post(
        "/api/v1/collections",
        json={"name": "Orphan"},
    ).json()["id"]
    response = client.post(
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": ["missing-doc"]},
    )
    assert response.status_code == 404


def test_non_owner_gets_404(
    collections_client: tuple[TestClient, Path],
) -> None:
    """GET/PUT/DELETE d'une collection d'autrui → 404."""
    client, _ = collections_client
    collection_id = client.post(
        "/api/v1/collections",
        json={"name": "Privée"},
    ).json()["id"]
    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert client.get(f"/api/v1/collections/{collection_id}").status_code == 404
    assert (
        client.put(
            f"/api/v1/collections/{collection_id}",
            json={"name": "Hack"},
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/collections/{collection_id}").status_code == 404


def test_guest_mutate_forbidden(
    collections_client: tuple[TestClient, Path],
) -> None:
    """Guest sur toutes les mutations → 403."""
    client, _ = collections_client
    _create_owned(client, "guest-doc")
    collection_id = client.post(
        "/api/v1/collections",
        json={"name": "Owned"},
    ).json()["id"]
    app.dependency_overrides[get_current_user] = lambda: _user("guest-1", role="guest")
    assert (
        client.post("/api/v1/collections", json={"name": "Nope"}).status_code == 403
    )
    assert (
        client.put(
            f"/api/v1/collections/{collection_id}",
            json={"name": "Nope"},
        ).status_code
        == 403
    )
    assert client.delete(f"/api/v1/collections/{collection_id}").status_code == 403
    assert (
        client.post(
            f"/api/v1/collections/{collection_id}/dialogues",
            json={"document_ids": ["guest-doc"]},
        ).status_code
        == 403
    )
    assert (
        client.request(
            "DELETE",
            f"/api/v1/collections/{collection_id}/dialogues",
            json={"document_ids": ["guest-doc"]},
        ).status_code
        == 403
    )


def test_remove_dialogues_from_collection(
    collections_client: tuple[TestClient, Path],
) -> None:
    """DELETE membership retire le document sans supprimer le dialogue."""
    client, _ = collections_client
    _create_owned(client, "to-remove")
    collection_id = client.post(
        "/api/v1/collections",
        json={"name": "WithDoc"},
    ).json()["id"]
    client.post(
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": ["to-remove"]},
    )
    removed = client.request(
        "DELETE",
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": ["to-remove"]},
    )
    assert removed.status_code == 200
    assert removed.json()["dialogue_ids"] == []
    assert client.get("/api/v1/documents/to-remove").status_code == 200


def test_rename_collection(
    collections_client: tuple[TestClient, Path],
) -> None:
    """PUT name → libellé mis à jour."""
    client, _ = collections_client
    collection_id = client.post(
        "/api/v1/collections",
        json={"name": "Ancien"},
    ).json()["id"]
    updated = client.put(
        f"/api/v1/collections/{collection_id}",
        json={"name": "Nouveau"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Nouveau"

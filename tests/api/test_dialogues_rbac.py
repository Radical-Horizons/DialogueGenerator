"""Régressions RBAC owner/admin sur toutes les voies CRUD dialogue."""

import json
from concurrent.futures import ThreadPoolExecutor
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
def rbac_client(
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
) -> Iterator[tuple[TestClient, MagicMock, Path, Path]]:
    """Fournit un stockage temporaire et un writer A courant."""
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
        yield TestClient(app), config, dialogue_dir, layout_dir
    finally:
        app.dependency_overrides.clear()


def test_writer_create_reload_update_delete_owns_dialogue(
    rbac_client: tuple[TestClient, MagicMock, Path, Path],
) -> None:
    """Le writer créateur garde un CRUD complet après rechargement."""
    client, _, dialogue_dir, _ = rbac_client
    document = {"schemaVersion": "1.2.0", "nodes": []}

    created = client.put(
        "/api/v1/documents/owned",
        json={"document": document, "revision": 1},
    )
    loaded = client.get("/api/v1/documents/owned")
    updated = client.put(
        "/api/v1/documents/owned",
        json={"document": document, "revision": 1},
    )
    deleted = client.delete("/api/v1/documents/owned")

    assert created.status_code == 200
    assert loaded.status_code == 200
    assert loaded.json()["capabilities"] == {
        "can_read": True,
        "can_edit": True,
        "can_delete": True,
        "is_owner": True,
    }
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    assert deleted.status_code == 204
    assert not (dialogue_dir / "owned.json").exists()
    assert app.state.container.get_dialogues_index_repository().find_by_document_id("owned") is None


def test_other_writer_get_put_layout_and_delete_are_403_without_mutation(
    rbac_client: tuple[TestClient, MagicMock, Path, Path],
) -> None:
    """Un writer tiers ne lit ni ne modifie aucune ressource persistée."""
    client, _, dialogue_dir, layout_dir = rbac_client
    original = {"schemaVersion": "1.2.0", "nodes": []}
    assert client.put(
        "/api/v1/documents/private",
        json={"document": original, "revision": 1},
    ).status_code == 200
    assert client.put(
        "/api/v1/documents/private/layout",
        json={"layout": {"nodes": {}}, "revision": 1},
    ).status_code == 200

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    attempts = [
        client.get("/api/v1/documents/private"),
        client.put(
            "/api/v1/documents/private",
            json={
                "document": {"schemaVersion": "1.2.0", "nodes": [{"id": "START"}]},
                "revision": 1,
            },
        ),
        client.get("/api/v1/documents/private/layout"),
        client.put(
            "/api/v1/documents/private/layout",
            json={"layout": {"nodes": {"START": {"x": 1, "y": 2}}}, "revision": 1},
        ),
        client.get("/api/v1/unity-dialogues/private.json"),
        client.delete("/api/v1/unity-dialogues/private.json"),
        client.post(
            "/api/v1/unity-dialogues/graph/save-and-write",
            json={
                "nodes": [],
                "edges": [],
                "metadata": {
                    "title": "Private",
                    "node_count": 0,
                    "edge_count": 0,
                },
                "document_id": "private",
            },
        ),
        client.post(
            "/api/v1/dialogues/unity/export",
            json={
                "json_content": json.dumps(original),
                "title": "Private",
                "filename": "private",
            },
        ),
    ]

    assert [response.status_code for response in attempts] == [403] * len(attempts)
    assert json.loads((dialogue_dir / "private.json").read_text(encoding="utf-8")) == original
    assert json.loads(
        (layout_dir / "private.layout.json").read_text(encoding="utf-8")
    ) == {"nodes": {}}
    listed = client.get("/api/v1/unity-dialogues")
    assert listed.status_code == 200
    assert listed.json()["dialogues"] == []


def test_admin_can_manage_historical_unindexed_dialogue(
    rbac_client: tuple[TestClient, MagicMock, Path, Path],
) -> None:
    """Un admin gère un fichier historique sans attribution implicite."""
    client, _, dialogue_dir, _ = rbac_client
    historical = {"schemaVersion": "1.2.0", "nodes": []}
    (dialogue_dir / "historical.json").write_text(
        json.dumps(historical),
        encoding="utf-8",
    )
    app.dependency_overrides[get_current_user] = lambda: _user("admin-a", "admin")

    loaded = client.get("/api/v1/documents/historical")
    updated = client.put(
        "/api/v1/documents/historical",
        json={"document": historical, "revision": 1},
    )

    assert loaded.status_code == 200
    assert loaded.json()["capabilities"]["is_owner"] is False
    assert updated.status_code == 200
    assert (
        app.state.container.get_dialogues_index_repository().find_by_document_id(
            "historical"
        )
        is None
    )


def test_create_only_never_overwrites_existing_revision_one(
    rbac_client: tuple[TestClient, MagicMock, Path, Path],
) -> None:
    """Une création explicite retourne le document canonique sans l'écraser."""
    client, _, dialogue_dir, _ = rbac_client
    original = {"schemaVersion": "1.2.0", "title": "Original", "nodes": []}
    assert client.put(
        "/api/v1/documents/same-title",
        json={"document": original, "revision": 1},
    ).status_code == 200

    conflict = client.put(
        "/api/v1/documents/same-title",
        json={
            "document": {
                "schemaVersion": "1.2.0",
                "title": "Replacement",
                "nodes": [],
            },
            "revision": 1,
            "createOnly": True,
        },
    )

    assert conflict.status_code == 409
    assert conflict.json()["document"] == original
    assert conflict.json()["revision"] == 1
    assert json.loads(
        (dialogue_dir / "same-title.json").read_text(encoding="utf-8")
    ) == original


def test_concurrent_create_only_has_single_winner(
    rbac_client: tuple[TestClient, MagicMock, Path, Path],
) -> None:
    """Deux créations concurrentes du même ID produisent un seul succès."""
    client, _, dialogue_dir, _ = rbac_client

    def create(title: str) -> tuple[int, str]:
        response = client.put(
            "/api/v1/documents/concurrent-title",
            json={
                "document": {
                    "schemaVersion": "1.2.0",
                    "title": title,
                    "nodes": [],
                },
                "revision": 1,
                "createOnly": True,
            },
        )
        return response.status_code, title

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(create, ("First", "Second")))

    assert sorted(status for status, _ in results) == [200, 409]
    winning_title = next(title for status, title in results if status == 200)
    persisted = json.loads(
        (dialogue_dir / "concurrent-title.json").read_text(encoding="utf-8")
    )
    assert persisted["title"] == winning_title


def test_indexed_storage_path_cannot_authorize_homonymous_file(
    rbac_client: tuple[TestClient, MagicMock, Path, Path],
    tmp_path: Path,
) -> None:
    """Un index d'un ancien dossier n'autorise pas un homonyme ailleurs."""
    client, config, original_dir, _ = rbac_client
    document = {"schemaVersion": "1.2.0", "nodes": []}
    assert client.put(
        "/api/v1/documents/path-bound",
        json={"document": document, "revision": 1},
    ).status_code == 200
    replacement_dir = tmp_path / "Replacement"
    replacement_dir.mkdir()
    (replacement_dir / "path-bound.json").write_text(
        json.dumps({"schemaVersion": "1.2.0", "title": "Other", "nodes": []}),
        encoding="utf-8",
    )
    config.get_unity_dialogues_path.return_value = replacement_dir

    assert client.get("/api/v1/documents/path-bound").status_code == 403
    assert (original_dir / "path-bound.json").exists()


def test_inline_validation_allows_unsaved_document(
    rbac_client: tuple[TestClient, MagicMock, Path, Path],
) -> None:
    """La validation inline authentifiée ne crée ni ne requiert d'ownership."""
    client, _, dialogue_dir, _ = rbac_client
    response = client.post(
        "/api/v1/documents/not-yet-saved/validate-flag-references",
        json={"document": {"schemaVersion": "1.2.0", "nodes": []}},
    )

    assert response.status_code == 200
    assert not (dialogue_dir / "not-yet-saved.json").exists()
    assert (
        app.state.container.get_dialogues_index_repository().find_by_document_id(
            "not-yet-saved"
        )
        is None
    )


def test_delete_does_not_require_layout_configuration(
    rbac_client: tuple[TestClient, MagicMock, Path, Path],
) -> None:
    """DELETE fonctionne quand aucun dossier layout n'est configuré."""
    client, config, dialogue_dir, _ = rbac_client
    assert client.put(
        "/api/v1/documents/no-layout",
        json={
            "document": {"schemaVersion": "1.2.0", "nodes": []},
            "revision": 1,
        },
    ).status_code == 200
    config.get_unity_layouts_path.return_value = None

    response = client.delete("/api/v1/documents/no-layout")

    assert response.status_code == 204
    assert not (dialogue_dir / "no-layout.json").exists()

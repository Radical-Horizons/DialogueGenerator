"""Tests API Story 6.8 — partage d'équipe des templates custom."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterator
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_template_service
from api.main import app
from api.routers.auth import get_current_user
from services.preset_service import PresetService
from services.repositories.sqlite.connection import DatabaseConnection
from services.template_service import TemplateService


def _sample_create_payload(**overrides: Any) -> Dict[str, Any]:
    """Payload POST générique (IDs fixtures, pas de noms GDD réels)."""
    payload: Dict[str, Any] = {
        "name": "Template partagé",
        "description": "Desc share",
        "category": "Confrontation",
        "icon": "⚔️",
        "configuration": {
            "characters": ["char-alpha"],
            "locations": ["loc-alpha"],
            "region": "loc-alpha",
            "sceneType": "Generic",
            "instructions": "Brief de test",
            "llmModel": "gpt-5.6-terra",
        },
    }
    payload.update(overrides)
    return payload


def _user(user_id: str, role: str = "writer") -> dict[str, object]:
    """Identité active pour override ``get_current_user``."""
    return {
        "id": user_id,
        "username": user_id,
        "role": role,
        "is_active": True,
    }


@pytest.fixture
def mock_context_builder() -> Mock:
    """ContextBuilder mocké avec IDs génériques."""
    from services.element_repository import ElementRepository
    from services.gdd_loader import GDDData

    gdd_data = GDDData(
        characters=[{"Nom": "char-alpha", "id": "char-001"}],
        locations=[{"Nom": "loc-alpha", "id": "loc-001"}],
    )
    repo = ElementRepository(gdd_data)
    builder = Mock()
    builder._gdd_data = gdd_data
    builder._element_repository = repo
    builder.get_characters_names.return_value = ["char-alpha"]
    builder.get_locations_names.return_value = ["loc-alpha"]
    builder.load_gdd_files = Mock()
    return builder


@pytest.fixture
def template_service(tmp_path: Path, mock_context_builder: Mock) -> TemplateService:
    """TemplateService réel sur tmp_path (disque isolé)."""
    preset_service = PresetService(
        config_service=Mock(),
        context_builder=mock_context_builder,
        presets_dir=tmp_path / "presets",
    )
    return TemplateService(
        preset_service=preset_service,
        templates_dir=tmp_path / "templates" / "custom",
    )


@pytest.fixture
def share_client(
    template_service: TemplateService,
    isolated_app_database: DatabaseConnection,
) -> Iterator[TestClient]:
    """Client API avec writers seedés et custom isolé."""
    for user_id, role, active in (
        ("writer-a", "writer", 1),
        ("writer-b", "writer", 1),
        ("writer-c", "writer", 1),
        ("admin-a", "admin", 1),
        ("writer-inactive", "writer", 0),
    ):
        isolated_app_database.execute(
            """
            INSERT INTO users(
                id, username, role, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            """,
            (user_id, user_id, role, active),
        )
    app.dependency_overrides[get_template_service] = lambda: template_service
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_template_service, None)
        app.dependency_overrides.pop(get_current_user, None)


def _create_owned(client: TestClient, name: str = "Template partagé") -> str:
    """Crée un custom owned par l'acteur courant et retourne son id."""
    created = client.post("/api/v1/templates", json=_sample_create_payload(name=name))
    assert created.status_code == 201
    return str(created.json()["id"])


def test_owner_grant_lists_shared_and_allows_get_not_put(
    share_client: TestClient,
) -> None:
    """Grant → B voit le live ; PUT/DELETE destinataire 403 ; apply GET 200."""
    client = share_client
    template_id = _create_owned(client)

    granted = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-b"},
    )
    assert granted.status_code == 201
    assert granted.json()["username"] == "writer-b"
    assert granted.json()["user_id"] == "writer-b"

    listed = client.get(f"/api/v1/templates/{template_id}/shares")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    visible = client.get("/api/v1/templates")
    assert visible.status_code == 200
    items = visible.json()
    assert len(items) == 1
    assert items[0]["id"] == template_id
    assert items[0]["relation"] == "granted"
    assert items[0]["sharedByUsername"] == "writer-a"

    loaded = client.get(f"/api/v1/templates/{template_id}")
    assert loaded.status_code == 200
    assert loaded.json()["name"] == "Template partagé"

    denied = client.put(
        f"/api/v1/templates/{template_id}",
        json={"name": "Hacké par B"},
    )
    assert denied.status_code == 403
    denied_delete = client.delete(f"/api/v1/templates/{template_id}")
    assert denied_delete.status_code == 403


def test_unknown_user_self_share_duplicate_and_non_owner(
    share_client: TestClient,
) -> None:
    """404 username ; 400 self ; 409 doublon ; 403 non-owner."""
    client = share_client
    template_id = _create_owned(client)

    missing = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "inconnu"},
    )
    assert missing.status_code == 404

    inactive = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-inactive"},
    )
    assert inactive.status_code == 404

    admin_target = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "admin-a"},
    )
    assert admin_target.status_code == 404

    self_share = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-a"},
    )
    assert self_share.status_code == 400

    first = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-b"},
    )
    assert first.status_code == 201
    duplicate = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-b"},
    )
    assert duplicate.status_code == 409

    app.dependency_overrides[get_current_user] = lambda: _user("writer-c")
    forbidden = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-b"},
    )
    assert forbidden.status_code == 403


def test_guest_owner_can_share_writer_not_guest_target(
    share_client: TestClient,
) -> None:
    """Guest owner → writer 201 ; cible guest 404."""
    client = share_client
    app.dependency_overrides[get_current_user] = lambda: _user("guest", role="guest")
    template_id = _create_owned(client, name="Guest owned")

    granted = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-b"},
    )
    assert granted.status_code == 201

    guest_target = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "guest"},
    )
    assert guest_target.status_code == 404


def test_copy_is_snapshot_and_revoke_hides_live(
    share_client: TestClient,
) -> None:
    """Copy = nouvel owner ; révocation retire le live, pas la copie.

    Le template est `private` : sur un `shared`, la révocation d'un partage nominatif
    ne masquerait rien, puisque le statut le rend déjà visible de l'équipe.
    """
    client = share_client
    created = client.post(
        "/api/v1/templates",
        json=_sample_create_payload(visibility="private"),
    )
    assert created.status_code == 201
    template_id = str(created.json()["id"])
    assert client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-b"},
    ).status_code == 201

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    copied = client.post(f"/api/v1/templates/{template_id}/copy")
    assert copied.status_code == 201
    body = copied.json()
    assert body["name"].endswith(" (copie)")
    assert body["ownerId"] == "writer-b"
    assert body["relation"] == "owned"
    copy_id = body["id"]
    assert copy_id != template_id

    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    revoked = client.delete(f"/api/v1/templates/{template_id}/shares/writer-b")
    assert revoked.status_code == 204

    missing_share = client.delete(f"/api/v1/templates/{template_id}/shares/writer-b")
    assert missing_share.status_code == 404

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert client.get(f"/api/v1/templates/{template_id}").status_code == 404
    assert client.post(f"/api/v1/templates/{template_id}/copy").status_code == 404
    kept = client.get(f"/api/v1/templates/{copy_id}")
    assert kept.status_code == 200
    assert kept.json()["ownerId"] == "writer-b"


def test_owner_put_is_live_for_recipient(
    share_client: TestClient,
) -> None:
    """PUT owner visible immédiatement au GET destinataire."""
    client = share_client
    template_id = _create_owned(client)
    assert client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-b"},
    ).status_code == 201

    updated = client.put(
        f"/api/v1/templates/{template_id}",
        json={"name": "Nom live"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Nom live"

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    loaded = client.get(f"/api/v1/templates/{template_id}")
    assert loaded.status_code == 200
    assert loaded.json()["name"] == "Nom live"


def test_legacy_public_not_shareable_prebuilt_400(
    share_client: TestClient,
    template_service: TemplateService,
) -> None:
    """Sans owner_id = public ; pré-built 400."""
    client = share_client
    legacy, _ = template_service.create_template(_sample_create_payload(name="Legacy"))
    assert legacy.ownerId is None

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    listed = client.get("/api/v1/templates")
    assert listed.status_code == 200
    names = {item["name"] for item in listed.json()}
    assert "Legacy" in names
    vis = next(item["relation"] for item in listed.json() if item["id"] == legacy.id)
    assert vis == "legacy"

    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    refused = client.post(
        f"/api/v1/templates/{legacy.id}/shares",
        json={"username": "writer-b"},
    )
    assert refused.status_code == 400

    prebuilt = client.post(
        "/api/v1/templates/confrontation/shares",
        json={"username": "writer-b"},
    )
    assert prebuilt.status_code == 400


@pytest.mark.p0
def test_legacy_is_read_only_for_non_admin(
    share_client: TestClient,
    template_service: TemplateService,
) -> None:
    """Given un template sans ownerId, when un writer PUT/DELETE, then 403 ; l'admin passe.

    Régression : le repli ``owner is None -> True`` de can_write/can_delete
    rendait tout template sans propriétaire mutable par n'importe quel compte
    authentifié, invité compris. La lecture publique (``visibility: legacy``)
    reste acquise — seule la mutation est réservée à l'admin.
    """
    client = share_client
    legacy, _ = template_service.create_template(_sample_create_payload(name="Legacy RO"))
    assert legacy.ownerId is None

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert client.get(f"/api/v1/templates/{legacy.id}").status_code == 200
    assert client.put(
        f"/api/v1/templates/{legacy.id}",
        json={"name": "Détourné"},
    ).status_code == 403
    assert client.delete(f"/api/v1/templates/{legacy.id}").status_code == 403

    app.dependency_overrides[get_current_user] = lambda: _user("guest-x", role="guest")
    assert client.delete(f"/api/v1/templates/{legacy.id}").status_code == 403

    app.dependency_overrides[get_current_user] = lambda: _user("admin-1", role="admin")
    assert client.delete(f"/api/v1/templates/{legacy.id}").status_code == 204


def test_delete_cascades_shares(
    share_client: TestClient,
    isolated_app_database: DatabaseConnection,
) -> None:
    """Suppression du JSON retire les lignes template_shares."""
    client = share_client
    template_id = _create_owned(client)
    assert client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-b"},
    ).status_code == 201

    deleted = client.delete(f"/api/v1/templates/{template_id}")
    assert deleted.status_code == 204
    remaining = isolated_app_database.execute_scalar(
        "SELECT COUNT(*) FROM template_shares WHERE template_id = ?",
        (template_id,),
    )
    assert remaining == 0

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert client.get(f"/api/v1/templates/{template_id}").status_code == 404


def test_share_can_edit_allows_put_not_delete(
    share_client: TestClient,
) -> None:
    """Share canEdit → PUT 200, DELETE 403."""
    client = share_client
    template_id = _create_owned(client)
    granted = client.post(
        f"/api/v1/templates/{template_id}/shares",
        json={"username": "writer-b", "canEdit": True},
    )
    assert granted.status_code == 201
    assert granted.json()["can_edit"] is True

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    updated = client.put(
        f"/api/v1/templates/{template_id}",
        json={"name": "Édité par B"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Édité par B"
    denied = client.delete(f"/api/v1/templates/{template_id}")
    assert denied.status_code == 403


def test_share_targets_lists_other_writers(
    share_client: TestClient,
) -> None:
    """Le picker n'expose que les writers actifs hors soi-même."""
    listed = share_client.get("/api/v1/templates/share-targets")
    assert listed.status_code == 200
    names = {item["username"] for item in listed.json()}
    assert "writer-b" in names
    assert "writer-a" not in names
    assert "writer-inactive" not in names
    assert "admin-a" not in names


def test_guest_sessions_do_not_share_templates(
    share_client: TestClient,
) -> None:
    """Deux guests avec sid distincts ne voient pas Mes templates l'un de l'autre."""
    client = share_client
    app.dependency_overrides[get_current_user] = lambda: {
        **_user("guest", role="guest"),
        "session_id": "sid-a",
    }
    template_id = _create_owned(client, name="Guest A only")
    listed_a = client.get("/api/v1/templates")
    assert template_id in {item["id"] for item in listed_a.json()}

    app.dependency_overrides[get_current_user] = lambda: {
        **_user("guest", role="guest"),
        "session_id": "sid-b",
    }
    listed_b = client.get("/api/v1/templates")
    assert template_id not in {item["id"] for item in listed_b.json()}
    assert client.get(f"/api/v1/templates/{template_id}").status_code == 404


@pytest.mark.p0
def test_list_does_not_dump_others_private_templates(
    share_client: TestClient,
) -> None:
    """La liste admin n'expose pas un template privé d'un autre writer.

    Un template `shared` est au contraire visible de toute l'équipe, admin compris :
    c'est le sens du statut depuis l'unification.
    """
    client = share_client
    created = client.post(
        "/api/v1/templates",
        json=_sample_create_payload(visibility="private"),
    )
    assert created.status_code == 201
    template_id = str(created.json()["id"])

    app.dependency_overrides[get_current_user] = lambda: _user("admin-a", role="admin")
    listed = client.get("/api/v1/templates")
    assert listed.status_code == 200
    ids = {item["id"] for item in listed.json()}
    assert template_id not in ids

    loaded = client.get(f"/api/v1/templates/{template_id}")
    assert loaded.status_code == 200

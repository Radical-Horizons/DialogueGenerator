"""Tests API marketplace de templates (Story 6.6 — matrice I/O)."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterator
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_template_marketplace_service, get_template_service
from api.main import app
from api.routers.auth import get_current_user
from services.preset_service import PresetService
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.shared_templates_repository import SharedTemplatesRepository
from services.template_marketplace_service import TemplateMarketplaceService
from services.template_service import TemplateService


def _sample_create_payload(**overrides: Any) -> Dict[str, Any]:
    """Payload POST custom générique."""
    payload: Dict[str, Any] = {
        "name": "Template marché",
        "description": "Desc marché",
        "category": "Confrontation",
        "icon": "⚔️",
        "configuration": {
            "characters": ["char-alpha"],
            "locations": ["loc-alpha"],
            "region": "loc-alpha",
            "sceneType": "Generic",
            "instructions": "Brief marketplace",
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
    """TemplateService réel sur tmp_path."""
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
def marketplace_client(
    template_service: TemplateService,
    isolated_app_database: DatabaseConnection,
) -> Iterator[TestClient]:
    """Client API marketplace avec writers seedés et custom isolé."""
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
    marketplace = TemplateMarketplaceService(
        repository=SharedTemplatesRepository(isolated_app_database),
        template_service=template_service,
    )
    app.dependency_overrides[get_template_service] = lambda: template_service
    app.dependency_overrides[get_template_marketplace_service] = lambda: marketplace
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_template_service, None)
        app.dependency_overrides.pop(get_template_marketplace_service, None)
        app.dependency_overrides.pop(get_current_user, None)


def _create_custom(client: TestClient, **overrides: Any) -> str:
    """Crée un custom et retourne son id."""
    response = client.post("/api/v1/templates", json=_sample_create_payload(**overrides))
    assert response.status_code == 201
    return str(response.json()["id"])


def test_marketplace_empty_list(marketplace_client: TestClient) -> None:
    """Given aucune fiche, when GET marketplace, then liste vide."""
    response = marketplace_client.get("/api/v1/templates/marketplace")
    assert response.status_code == 200
    assert response.json() == []


def test_publish_writer_lists_username(marketplace_client: TestClient) -> None:
    """Given un writer + custom, when POST marketplace, then listing + username."""
    template_id = _create_custom(marketplace_client)
    published = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    )
    assert published.status_code == 201
    body = published.json()
    assert body["authorUsername"] == "writer-a"
    assert body["name"] == "Template marché"
    assert body["usageCount"] == 0
    assert body["ratingAverage"] is None
    assert body["configuration"]["instructions"] == "Brief marketplace"
    assert body["configuration"]["characters"] == ["char-alpha"]
    assert UUID(body["id"])

    listed = marketplace_client.get("/api/v1/templates/marketplace")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == body["id"]


def test_publish_missing_custom_404(marketplace_client: TestClient) -> None:
    """Given un UUID absent, when publier, then 404."""
    response = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": str(uuid4())},
    )
    assert response.status_code == 404


def test_guest_publish_403(marketplace_client: TestClient) -> None:
    """Given un guest, when POST marketplace, then 403."""
    template_id = _create_custom(marketplace_client)
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "guest",
        "username": "guest",
        "role": "guest",
        "is_active": True,
    }
    response = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    )
    assert response.status_code == 403


def test_republish_keeps_id(marketplace_client: TestClient) -> None:
    """Given le même custom+auteur, when republier, then même id, notes et usages."""
    template_id = _create_custom(marketplace_client)
    first = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    )
    assert first.status_code == 201
    listing_id = first.json()["id"]
    marketplace_client.post(f"/api/v1/templates/marketplace/{listing_id}/use")
    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    rated = marketplace_client.put(
        f"/api/v1/templates/marketplace/{listing_id}/rating",
        json={"stars": 4},
    )
    assert rated.status_code == 200
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")

    updated = marketplace_client.put(
        f"/api/v1/templates/{template_id}",
        json={"name": "Template marché v2"},
    )
    assert updated.status_code == 200

    second = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    )
    assert second.status_code == 201
    assert second.json()["id"] == listing_id
    assert second.json()["name"] == "Template marché v2"
    assert second.json()["usageCount"] == 1
    assert second.json()["ratingAverage"] == 4.0
    assert second.json()["ratingCount"] == 1


def test_listing_keeps_snapshot_until_republish(marketplace_client: TestClient) -> None:
    """Given un PUT custom sans republication, when GET listing, then snapshot d'origine."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    marketplace_client.put(
        f"/api/v1/templates/{template_id}",
        json={"name": "Local seulement"},
    )
    detail = marketplace_client.get(f"/api/v1/templates/marketplace/{listing_id}")
    assert detail.status_code == 200
    assert detail.json()["name"] == "Template marché"


def test_use_copies_custom_and_increments_usage(marketplace_client: TestClient) -> None:
    """Given une fiche, when POST use, then copie custom et usage++."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]

    used = marketplace_client.post(f"/api/v1/templates/marketplace/{listing_id}/use")
    assert used.status_code == 201
    assert used.json()["name"] == "Template marché (copie)"
    assert used.json()["id"] != template_id
    assert used.json()["configuration"]["instructions"] == "Brief marketplace"

    detail = marketplace_client.get(f"/api/v1/templates/marketplace/{listing_id}")
    assert detail.status_code == 200
    assert detail.json()["usageCount"] == 1

    customs = marketplace_client.get("/api/v1/templates")
    names = [item["name"] for item in customs.json()]
    assert "Template marché (copie)" in names


def test_use_missing_listing_404(marketplace_client: TestClient) -> None:
    """Given un listing absent, when use, then 404."""
    response = marketplace_client.post(
        f"/api/v1/templates/marketplace/{uuid4()}/use"
    )
    assert response.status_code == 404


def test_guest_can_get_and_use(marketplace_client: TestClient) -> None:
    """Given un guest, when GET + use, then 200/201."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "guest",
        "username": "guest",
        "role": "guest",
        "is_active": True,
    }
    listed = marketplace_client.get("/api/v1/templates/marketplace")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == listing_id
    used = marketplace_client.post(f"/api/v1/templates/marketplace/{listing_id}/use")
    assert used.status_code == 201


def test_rate_other_author_updates_average(marketplace_client: TestClient) -> None:
    """Given PUT 1–5 d'un autre auteur, when noter, then upsert + moyenne."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    rated = marketplace_client.put(
        f"/api/v1/templates/marketplace/{listing_id}/rating",
        json={"stars": 4},
    )
    assert rated.status_code == 200
    assert rated.json()["ratingAverage"] == 4.0
    assert rated.json()["ratingCount"] == 1

    again = marketplace_client.put(
        f"/api/v1/templates/marketplace/{listing_id}/rating",
        json={"stars": 2},
    )
    assert again.status_code == 200
    assert again.json()["ratingAverage"] == 2.0
    assert again.json()["ratingCount"] == 1


def test_rate_own_listing_400(marketplace_client: TestClient) -> None:
    """Given l'auteur, when noter sa fiche, then 400."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    response = marketplace_client.put(
        f"/api/v1/templates/marketplace/{listing_id}/rating",
        json={"stars": 5},
    )
    assert response.status_code == 400


def test_guest_rate_403(marketplace_client: TestClient) -> None:
    """Given un guest, when noter, then 403."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "guest",
        "username": "guest",
        "role": "guest",
        "is_active": True,
    }
    response = marketplace_client.put(
        f"/api/v1/templates/marketplace/{listing_id}/rating",
        json={"stars": 3},
    )
    assert response.status_code == 403


def test_rate_stars_out_of_range_422(marketplace_client: TestClient) -> None:
    """Given une note hors 1–5, when PUT, then 422."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    response = marketplace_client.put(
        f"/api/v1/templates/marketplace/{listing_id}/rating",
        json={"stars": 6},
    )
    assert response.status_code == 422


def test_unpublish_author_removes_listing(marketplace_client: TestClient) -> None:
    """Given DELETE auteur, when retirer, then listing disparu."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    deleted = marketplace_client.delete(f"/api/v1/templates/marketplace/{listing_id}")
    assert deleted.status_code == 204
    assert marketplace_client.get(
        f"/api/v1/templates/marketplace/{listing_id}"
    ).status_code == 404


def test_unpublish_other_writer_403(marketplace_client: TestClient) -> None:
    """Given un autre writer, when DELETE, then 403."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    response = marketplace_client.delete(f"/api/v1/templates/marketplace/{listing_id}")
    assert response.status_code == 403


def test_guest_unpublish_403(marketplace_client: TestClient) -> None:
    """Given un guest, when DELETE, then 403 et listing encore visible."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "guest",
        "username": "guest",
        "role": "guest",
        "is_active": True,
    }
    response = marketplace_client.delete(f"/api/v1/templates/marketplace/{listing_id}")
    assert response.status_code == 403
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    assert marketplace_client.get(
        f"/api/v1/templates/marketplace/{listing_id}"
    ).status_code == 200


def test_unpublish_missing_404(marketplace_client: TestClient) -> None:
    """Given un listing absent, when DELETE, then 404."""
    response = marketplace_client.delete(f"/api/v1/templates/marketplace/{uuid4()}")
    assert response.status_code == 404


def test_admin_can_unpublish_other_listing(marketplace_client: TestClient) -> None:
    """Given un admin, when DELETE la fiche d'un writer, then 204."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    app.dependency_overrides[get_current_user] = lambda: _user("admin-a", "admin")
    response = marketplace_client.delete(f"/api/v1/templates/marketplace/{listing_id}")
    assert response.status_code == 204


def test_marketplace_anonymous_hides_username_for_others(
    marketplace_client: TestClient,
) -> None:
    """Publication anonyme : les autres voient Anonyme."""
    template_id = _create_custom(marketplace_client)
    published = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id, "anonymous": True},
    )
    assert published.status_code == 201
    listing_id = published.json()["id"]
    assert published.json()["isAnonymous"] is True
    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    loaded = marketplace_client.get(f"/api/v1/templates/marketplace/{listing_id}")
    assert loaded.status_code == 200
    assert loaded.json()["authorUsername"] == "Anonyme"
    browsed = marketplace_client.get("/api/v1/templates/marketplace")
    assert browsed.status_code == 200
    listed = next(item for item in browsed.json() if item["id"] == listing_id)
    assert listed["authorUsername"] == "Anonyme"


def test_marketplace_comments_and_official(
    marketplace_client: TestClient,
) -> None:
    """Commentaire writer + marquage officiel admin."""
    template_id = _create_custom(marketplace_client)
    listing_id = marketplace_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    ).json()["id"]
    commented = marketplace_client.post(
        f"/api/v1/templates/marketplace/{listing_id}/comments",
        json={"body": "Utile pour les tests."},
    )
    assert commented.status_code == 201
    listed = marketplace_client.get(
        f"/api/v1/templates/marketplace/{listing_id}/comments"
    )
    assert listed.status_code == 200
    assert listed.json()[0]["body"] == "Utile pour les tests."
    app.dependency_overrides[get_current_user] = lambda: _user("admin-a", "admin")
    official = marketplace_client.patch(
        f"/api/v1/templates/marketplace/{listing_id}/official",
        json={"isOfficial": True},
    )
    assert official.status_code == 200
    assert official.json()["isOfficial"] is True

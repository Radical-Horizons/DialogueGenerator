"""Statut de visibilité des templates — `shared` (défaut) ou `private`.

Le lieu de stockage n'est plus un critère : ce qui distingue deux points de départ,
c'est qui peut les voir. Ces tests couvrent les lignes « Création », « Passage en
privé » et « Liste » de la matrice I/O de la spec d'unification.
"""
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


def _payload(**overrides: Any) -> Dict[str, Any]:
    """Payload POST minimal (IDs fixtures, pas de noms GDD réels)."""
    payload: Dict[str, Any] = {
        "name": "Template visibilité",
        "description": "Desc",
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


def _user(user_id: str, role: str = "writer", **extra: Any) -> dict[str, object]:
    """Identité active pour override ``get_current_user``."""
    return {"id": user_id, "username": user_id, "role": role, "is_active": True, **extra}


@pytest.fixture
def mock_context_builder() -> Mock:
    """ContextBuilder mocké avec IDs génériques."""
    from services.element_repository import ElementRepository
    from services.gdd_loader import GDDData

    gdd_data = GDDData(
        characters=[{"Nom": "char-alpha", "id": "char-001"}],
        locations=[{"Nom": "loc-alpha", "id": "loc-001"}],
    )
    builder = Mock()
    builder._gdd_data = gdd_data
    builder._element_repository = ElementRepository(gdd_data)
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
def client(
    template_service: TemplateService,
    isolated_app_database: DatabaseConnection,
) -> Iterator[TestClient]:
    """Client API avec deux writers seedés et un stockage isolé."""
    for user_id, role in (("writer-a", "writer"), ("writer-b", "writer"), ("admin-a", "admin")):
        isolated_app_database.execute(
            """
            INSERT INTO users(id, username, role, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
            """,
            (user_id, user_id, role),
        )
    app.dependency_overrides[get_template_service] = lambda: template_service
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_template_service, None)
        app.dependency_overrides.pop(get_current_user, None)


def _ids(response: Any) -> set[str]:
    """Ensemble des ids d'une réponse liste."""
    return {item["id"] for item in response.json()}


@pytest.mark.p0
def test_created_template_is_shared_by_default(client: TestClient) -> None:
    """Given aucun statut demandé, when POST, then le template est partagé."""
    created = client.post("/api/v1/templates", json=_payload())
    assert created.status_code == 201
    assert created.json()["visibility"] == "shared"


def test_shared_template_is_visible_to_the_team(client: TestClient) -> None:
    """Given un template partagé, when un collègue liste, then il le voit.

    C'est le cœur du modèle : `shared` suffit, aucun partage nominatif requis.
    """
    created = client.post("/api/v1/templates", json=_payload(name="Partagé"))
    template_id = created.json()["id"]

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    listed = client.get("/api/v1/templates")
    assert listed.status_code == 200
    assert template_id in _ids(listed)
    assert client.get(f"/api/v1/templates/{template_id}").status_code == 200


@pytest.mark.p0
def test_private_template_is_hidden_from_others(client: TestClient) -> None:
    """Given un brouillon privé, when un collègue liste, then il ne le voit pas."""
    created = client.post("/api/v1/templates", json=_payload(visibility="private"))
    assert created.json()["visibility"] == "private"
    template_id = created.json()["id"]

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert template_id not in _ids(client.get("/api/v1/templates"))
    assert client.get(f"/api/v1/templates/{template_id}").status_code == 404


def test_owner_can_switch_visibility_both_ways(client: TestClient) -> None:
    """Given mon template, when je change le statut, then il est persisté."""
    template_id = client.post("/api/v1/templates", json=_payload()).json()["id"]

    to_private = client.put(f"/api/v1/templates/{template_id}", json={"visibility": "private"})
    assert to_private.status_code == 200
    assert to_private.json()["visibility"] == "private"

    back = client.put(f"/api/v1/templates/{template_id}", json={"visibility": "shared"})
    assert back.status_code == 200
    assert back.json()["visibility"] == "shared"


@pytest.mark.p0
def test_non_owner_cannot_change_visibility(client: TestClient) -> None:
    """Given un template partagé d'autrui, when j'en change le statut, then 403.

    Un collègue peut le lire et l'appliquer ; décider qui le voit reste au propriétaire.
    """
    template_id = client.post("/api/v1/templates", json=_payload()).json()["id"]

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    refused = client.put(f"/api/v1/templates/{template_id}", json={"visibility": "private"})
    assert refused.status_code == 403


def test_admin_can_change_visibility(client: TestClient) -> None:
    """Given un template d'autrui, when un admin change le statut, then 200."""
    template_id = client.post("/api/v1/templates", json=_payload()).json()["id"]

    app.dependency_overrides[get_current_user] = lambda: _user("admin-a", role="admin")
    changed = client.put(f"/api/v1/templates/{template_id}", json={"visibility": "private"})
    assert changed.status_code == 200


def test_guest_cannot_create_templates(client: TestClient) -> None:
    """Given une session invitée, when elle crée, then 403.

    La question du statut par défaut ne se pose plus : un invité n'écrit rien.
    La version précédente forçait `private` à la création, mais seulement quand le
    client omettait `visibility` — un invité qui posait `"visibility": "shared"`
    publiait donc à toute l'équipe, ce que la garde prétendait justement empêcher.
    """
    app.dependency_overrides[get_current_user] = lambda: _user(
        "guest", role="guest", session_id="sid-a"
    )

    assert client.post(
        "/api/v1/templates", json=_payload(name="Brouillon invité")
    ).status_code == 403
    assert client.post(
        "/api/v1/templates", json={**_payload(name="Publication forcée"), "visibility": "shared"}
    ).status_code == 403


def test_visibility_survives_reload_from_disk(
    client: TestClient, template_service: TemplateService
) -> None:
    """Given un statut posé, when on relit le disque, then il est conservé."""
    template_id = client.post(
        "/api/v1/templates", json=_payload(visibility="private")
    ).json()["id"]

    assert template_service.get_template(template_id).visibility == "private"


def test_legacy_file_without_status_reads_as_shared(
    client: TestClient, template_service: TemplateService
) -> None:
    """Given un JSON antérieur au champ, when on le lit, then il vaut `shared`.

    Les fichiers écrits avant l'unification n'ont pas de `visibility` : le défaut du
    schéma s'applique, ils restent visibles de l'équipe.
    """
    template_id = client.post("/api/v1/templates", json=_payload()).json()["id"]
    path = template_service.templates_dir / f"{template_id}.json"
    import json

    payload = json.loads(path.read_text(encoding="utf-8"))
    payload.pop("visibility", None)
    path.write_text(json.dumps(payload), encoding="utf-8")

    assert template_service.get_template(template_id).visibility == "shared"

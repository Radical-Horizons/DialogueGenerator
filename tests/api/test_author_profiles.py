"""Profils d'auteur — objet serveur, propriété et statut de visibilité.

Couvre la matrice I/O de la spec : création (partagé par défaut), profil privé
invisible d'autrui, changement de statut réservé au propriétaire, et pré-built en
lecture seule.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterator

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_author_profile_service
from api.main import app
from api.routers.auth import get_current_user
from services.author_profile_service import AuthorProfileService


def _payload(**overrides: Any) -> Dict[str, Any]:
    """Payload POST minimal."""
    payload: Dict[str, Any] = {
        "name": "Voix sombre",
        "description": "Registre tendu",
        "content": "Phrases courtes. Peu d'adjectifs.",
    }
    payload.update(overrides)
    return payload


def _user(user_id: str, role: str = "writer", **extra: Any) -> dict[str, object]:
    """Identité active pour override ``get_current_user``."""
    return {"id": user_id, "username": user_id, "role": role, "is_active": True, **extra}


@pytest.fixture
def profile_service(tmp_path: Path) -> AuthorProfileService:
    """Service réel sur disque isolé, avec un catalogue de deux voix."""
    catalog = tmp_path / "author_profile_templates.json"
    catalog.write_text(
        '{"templates": ['
        '{"id": "default", "name": "Neutre", "description": "d1", "profile": "texte neutre"},'
        '{"id": "literary", "name": "Littéraire", "description": "d2", "profile": "texte littéraire"}'
        "]}",
        encoding="utf-8",
    )
    return AuthorProfileService(
        profiles_dir=tmp_path / "author_profiles",
        prebuilt_path=catalog,
    )


@pytest.fixture
def client(profile_service: AuthorProfileService) -> Iterator[TestClient]:
    """Client API avec le service de profils isolé."""
    app.dependency_overrides[get_author_profile_service] = lambda: profile_service
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_author_profile_service, None)
        app.dependency_overrides.pop(get_current_user, None)


def _ids(response: Any) -> set[str]:
    """Ensemble des ids d'une réponse liste."""
    return {item["id"] for item in response.json()}


@pytest.mark.p0
def test_create_profile_is_shared_by_default(client: TestClient) -> None:
    """Given aucun statut demandé, when POST, then le profil est partagé."""
    created = client.post("/api/v1/author-profiles", json=_payload())
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["visibility"] == "shared"
    assert body["content"] == "Phrases courtes. Peu d'adjectifs."
    assert body["relation"] == "owned"


def test_shared_profile_is_visible_to_the_team(client: TestClient) -> None:
    """Given un profil partagé, when un collègue liste, then il le voit."""
    profile_id = client.post("/api/v1/author-profiles", json=_payload()).json()["id"]

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert profile_id in _ids(client.get("/api/v1/author-profiles"))
    assert client.get(f"/api/v1/author-profiles/{profile_id}").status_code == 200


@pytest.mark.p0
def test_private_profile_is_hidden_from_others(client: TestClient) -> None:
    """Given un brouillon privé, when un collègue liste, then il ne le voit pas."""
    created = client.post("/api/v1/author-profiles", json=_payload(visibility="private"))
    profile_id = created.json()["id"]

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert profile_id not in _ids(client.get("/api/v1/author-profiles"))
    assert client.get(f"/api/v1/author-profiles/{profile_id}").status_code == 404


def test_owner_switches_visibility_both_ways(client: TestClient) -> None:
    """Given mon profil, when je change le statut, then il est persisté."""
    profile_id = client.post("/api/v1/author-profiles", json=_payload()).json()["id"]

    to_private = client.put(
        f"/api/v1/author-profiles/{profile_id}", json={"visibility": "private"}
    )
    assert to_private.status_code == 200
    assert to_private.json()["visibility"] == "private"

    back = client.put(f"/api/v1/author-profiles/{profile_id}", json={"visibility": "shared"})
    assert back.json()["visibility"] == "shared"


@pytest.mark.p0
def test_non_owner_cannot_change_visibility(client: TestClient) -> None:
    """Given un profil partagé d'autrui, when j'en change le statut, then 403."""
    profile_id = client.post("/api/v1/author-profiles", json=_payload()).json()["id"]

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    refused = client.put(
        f"/api/v1/author-profiles/{profile_id}", json={"visibility": "private"}
    )
    assert refused.status_code == 403


def test_non_owner_cannot_edit_or_delete(client: TestClient) -> None:
    """Given un profil partagé d'autrui, when je modifie ou supprime, then 403."""
    profile_id = client.post("/api/v1/author-profiles", json=_payload()).json()["id"]

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    assert client.put(
        f"/api/v1/author-profiles/{profile_id}", json={"name": "Détourné"}
    ).status_code == 403
    assert client.delete(f"/api/v1/author-profiles/{profile_id}").status_code == 403


def test_owner_updates_and_deletes(client: TestClient) -> None:
    """Given mon profil, when je le modifie puis le supprime, then il disparaît."""
    profile_id = client.post("/api/v1/author-profiles", json=_payload()).json()["id"]

    renamed = client.put(f"/api/v1/author-profiles/{profile_id}", json={"name": "Voix claire"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Voix claire"

    assert client.delete(f"/api/v1/author-profiles/{profile_id}").status_code == 204
    assert client.get(f"/api/v1/author-profiles/{profile_id}").status_code == 404


def test_prebuilt_catalog_is_read_only(client: TestClient) -> None:
    """Given le catalogue, when GET /prebuilt, then les voix fournies, non modifiables."""
    listed = client.get("/api/v1/author-profiles/prebuilt")
    assert listed.status_code == 200
    body = listed.json()
    assert {item["id"] for item in body} == {"default", "literary"}
    # Le champ historique `profile` du catalogue est exposé comme `content`.
    assert body[0]["content"] == "texte neutre"

    # Un slug n'est pas un UUID : aucune route de mutation ne peut le désigner.
    assert client.put("/api/v1/author-profiles/default", json={"name": "x"}).status_code == 404
    assert client.delete("/api/v1/author-profiles/default").status_code == 404


def test_guest_cannot_create_profiles(client: TestClient) -> None:
    """Given une session invitée, when elle crée, then 403 — lecture seule."""
    app.dependency_overrides[get_current_user] = lambda: _user(
        "guest", role="guest", session_id="sid-a"
    )

    assert client.post(
        "/api/v1/author-profiles", json=_payload(name="Brouillon invité")
    ).status_code == 403


def test_empty_name_is_refused(client: TestClient) -> None:
    """Given un nom vide, when POST, then 422."""
    assert client.post("/api/v1/author-profiles", json=_payload(name="   ")).status_code == 422


def test_visibility_survives_reload_from_disk(
    client: TestClient, profile_service: AuthorProfileService
) -> None:
    """Given un statut posé, when on relit le disque, then il est conservé."""
    profile_id = client.post(
        "/api/v1/author-profiles", json=_payload(visibility="private")
    ).json()["id"]
    assert profile_service.get_profile(profile_id).visibility == "private"


def test_legacy_file_without_status_reads_as_shared(
    client: TestClient, profile_service: AuthorProfileService
) -> None:
    """Given un JSON antérieur au champ, when on le lit, then il vaut `shared`."""
    import json

    profile_id = client.post("/api/v1/author-profiles", json=_payload()).json()["id"]
    path = profile_service.profiles_dir / f"{profile_id}.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload.pop("visibility", None)
    path.write_text(json.dumps(payload), encoding="utf-8")

    assert profile_service.get_profile(profile_id).visibility == "shared"

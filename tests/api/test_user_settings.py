"""Tests API des préférences utilisateur synchronisées."""

from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from api.config.security_config import get_security_config
from api.main import app
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.user_repository import UserRepository


def _insert_user(
    repository: UserRepository,
    username: str,
    *,
    role: str = "writer",
) -> dict[str, object]:
    """Insère un compte de test persistant."""
    return dict(
        repository.insert(
            {
                "username": username,
                "email": f"{username}@example.com",
                "hashed_password": "not-used",
                "role": role,
            }
        )
    )


def _auth_headers(username: str) -> dict[str, str]:
    """Crée un Bearer valide pour un compte SQLite existant."""
    token = app.state.container.get_auth_service().create_access_token(
        {"sub": username}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def authenticated_client(
    client: TestClient,
    isolated_app_database: DatabaseConnection,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[TestClient]:
    """Fournit un client en auth réelle sur une base temporaire."""
    monkeypatch.setattr(get_security_config(), "disable_auth", False)
    yield client


def test_user_settings_round_trip_and_partial_upsert(
    authenticated_client: TestClient,
) -> None:
    """Un writer relit ses valeurs JSON et les clés omises sont conservées."""
    repository = app.state.container.get_user_repository()
    _insert_user(repository, "writer-a")
    headers = _auth_headers("writer-a")

    first = authenticated_client.put(
        "/api/v1/users/me/settings/generation",
        json={
            "author_profile": "Style concis",
            "draft": {"scene": "intro", "count": 2},
        },
        headers=headers,
    )
    second = authenticated_client.put(
        "/api/v1/users/me/settings/generation",
        json={"author_profile": "Style lyrique"},
        headers=headers,
    )
    fetched = authenticated_client.get(
        "/api/v1/users/me/settings/generation",
        headers=headers,
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert fetched.json() == {
        "author_profile": "Style lyrique",
        "draft": {"scene": "intro", "count": 2},
    }


def test_user_settings_get_all_returns_nested_namespaces(
    authenticated_client: TestClient,
) -> None:
    """GET global groupe les valeurs par namespace."""
    repository = app.state.container.get_user_repository()
    _insert_user(repository, "writer-all")
    headers = _auth_headers("writer-all")
    authenticated_client.put(
        "/api/v1/users/me/settings/context",
        json={"config": {"organization": "minimal"}},
        headers=headers,
    )
    authenticated_client.put(
        "/api/v1/users/me/settings/generation",
        json={"slop_detection": {"include_repetitions": False}},
        headers=headers,
    )

    response = authenticated_client.get(
        "/api/v1/users/me/settings",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() == {
        "context": {"config": {"organization": "minimal"}},
        "generation": {
            "slop_detection": {"include_repetitions": False}
        },
    }


def test_user_settings_are_isolated_by_user(
    authenticated_client: TestClient,
) -> None:
    """Un writer ne voit jamais les préférences d'un autre writer."""
    repository = app.state.container.get_user_repository()
    _insert_user(repository, "writer-owner")
    _insert_user(repository, "writer-other")
    owner_headers = _auth_headers("writer-owner")
    other_headers = _auth_headers("writer-other")
    authenticated_client.put(
        "/api/v1/users/me/settings/context",
        json={"config": {"private": True}},
        headers=owner_headers,
    )

    response = authenticated_client.get(
        "/api/v1/users/me/settings",
        headers=other_headers,
    )

    assert response.status_code == 200
    assert response.json() == {}


def test_user_settings_guest_is_forbidden(
    authenticated_client: TestClient,
) -> None:
    """Une session guest ne peut ni lire ni modifier les préférences."""
    token = app.state.container.get_auth_service().create_guest_access_token()
    headers = {"Authorization": f"Bearer {token}"}

    assert authenticated_client.get(
        "/api/v1/users/me/settings",
        headers=headers,
    ).status_code == 403
    assert authenticated_client.put(
        "/api/v1/users/me/settings/context",
        json={"config": {}},
        headers=headers,
    ).status_code == 403


@pytest.mark.parametrize("method", ["get", "put"])
def test_user_settings_invalid_namespace_returns_422(
    authenticated_client: TestClient,
    method: str,
) -> None:
    """Un namespace hors liste blanche est refusé par FastAPI."""
    repository = app.state.container.get_user_repository()
    _insert_user(repository, f"writer-{method}")
    headers = _auth_headers(f"writer-{method}")

    response = getattr(authenticated_client, method)(
        "/api/v1/users/me/settings/ui",
        headers=headers,
        **({"json": {}} if method == "put" else {}),
    )

    assert response.status_code == 422


def test_user_settings_invalid_key_returns_422(
    authenticated_client: TestClient,
) -> None:
    """Une clé hors liste blanche du namespace est refusée."""
    repository = app.state.container.get_user_repository()
    _insert_user(repository, "writer-invalid-key")

    response = authenticated_client.put(
        "/api/v1/users/me/settings/context",
        json={"jwt_secret": "forbidden"},
        headers=_auth_headers("writer-invalid-key"),
    )

    assert response.status_code == 422


def test_user_settings_empty_account_and_empty_put(
    authenticated_client: TestClient,
) -> None:
    """Un compte neuf et un PUT vide renvoient des maps vides."""
    repository = app.state.container.get_user_repository()
    _insert_user(repository, "writer-empty")
    headers = _auth_headers("writer-empty")

    assert authenticated_client.get(
        "/api/v1/users/me/settings",
        headers=headers,
    ).json() == {}
    response = authenticated_client.put(
        "/api/v1/users/me/settings/generation",
        json={},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json() == {}


def test_user_settings_disable_auth_resolves_sqlite_admin(
    client: TestClient,
) -> None:
    """Le bypass local emploie l'identifiant réel du compte admin pour la FK."""
    repository = app.state.container.get_user_repository()
    admin = _insert_user(repository, "admin", role="admin")

    response = client.put(
        "/api/v1/users/me/settings/context",
        json={"config": {"source": "dev"}},
    )

    assert response.status_code == 200
    stored_user_id = repository.database.execute_scalar(
        "SELECT user_id FROM user_settings WHERE namespace = 'context'"
    )
    assert stored_user_id == admin["id"]

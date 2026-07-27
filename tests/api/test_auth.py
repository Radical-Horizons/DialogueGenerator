"""Tests pour l'authentification API."""

import pytest
from fastapi.testclient import TestClient

from api.config.security_config import get_security_config
from api.main import app


def test_login_success(seeded_auth_client: TestClient) -> None:
    """Un compte actif SQLite reçoit un JWT et un cookie refresh."""
    response = seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "refresh_token=" in response.headers["set-cookie"]
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "Max-Age=604800" in response.headers["set-cookie"]
    assert "Path=/api/v1/auth" in response.headers["set-cookie"]


def test_login_failure(seeded_auth_client: TestClient) -> None:
    """Des identifiants invalides retournent une erreur générique."""
    response = seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrongpassword"}
    )
    assert response.status_code == 401


def test_get_current_user_without_auth(client: TestClient) -> None:
    """Test d'accès à /me sans authentification."""
    response = client.get("/api/v1/auth/me")
    # En développement, l'auth est désactivée (retourne 200 avec user mock)
    # En production, retourne 401
    from api.config.security_config import get_security_config
    security_config = get_security_config()
    if security_config.is_development:
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "admin"  # User mock
    else:
        assert response.status_code == 401  # HTTPBearer retourne 401 si pas de token


def test_disable_auth_honors_guest_bearer(client: TestClient) -> None:
    """DISABLE_AUTH=true : un JWT guest est honoré (chemin E2E /login guest-first)."""
    assert get_security_config().disable_auth is True
    guest = client.post("/api/v1/auth/guest")
    assert guest.status_code == 200
    token = guest.json()["access_token"]
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "guest"
    assert data["username"] == "guest"


def test_get_current_user_without_auth_when_auth_enabled(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """L'authentification active retourne 401 sans header Bearer."""
    monkeypatch.setattr(get_security_config(), "disable_auth", False)

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401


def test_get_current_user_with_auth(seeded_auth_client: TestClient) -> None:
    """Le token d'un compte SQLite permet de résoudre /me."""
    # D'abord se connecter
    login_response = seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"}
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    
    # Ensuite accéder à /me
    response = seeded_auth_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "username" in data
    assert data["username"] == "admin"


def test_api_created_writer_can_login_and_resolve_me(
    seeded_auth_client: TestClient,
) -> None:
    """Un writer créé par l'API se connecte depuis la même base SQLite."""
    admin_login = seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    create_response = seeded_auth_client.post(
        "/api/v1/users",
        json={
            "username": "writer-from-api",
            "email": "writer-from-api@example.com",
            "password": "writer-pass-123",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_response.status_code == 201

    login_response = seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "writer-from-api", "password": "writer-pass-123"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    me_response = seeded_auth_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert me_response.status_code == 200
    assert me_response.json()["username"] == "writer-from-api"


def test_inactive_account_cannot_login_or_resolve_protected_route(
    seeded_auth_client: TestClient,
) -> None:
    """Un compte inactif ne reçoit aucune session et ne résout aucun JWT."""
    repository = app.state.container.get_user_repository()
    repository.insert(
        {
            "username": "inactive-user",
            "email": "inactive@example.com",
            "hashed_password": app.state.container.get_auth_service().hash_password(
                "inactive-pass-123"
            ),
            "role": "writer",
            "is_active": False,
        }
    )

    login_response = seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "inactive-user", "password": "inactive-pass-123"},
    )

    assert login_response.status_code == 401
    assert "refresh_token=" not in login_response.headers.get("set-cookie", "")

    inactive_token = app.state.container.get_auth_service().create_access_token(
        {"sub": "inactive-user"}
    )
    me_response = seeded_auth_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {inactive_token}"},
    )
    assert me_response.status_code == 401


def test_refresh_requires_an_existing_active_account(
    seeded_auth_client: TestClient,
) -> None:
    """Le refresh valide est refusé si le compte JWT n'est plus actif."""
    login_response = seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert login_response.status_code == 200
    refresh_cookie = login_response.cookies.get("refresh_token")
    assert refresh_cookie

    repository = app.state.container.get_user_repository()
    repository.database.execute(
        "UPDATE users SET is_active = 0 WHERE username = ?",
        ("admin",),
    )

    refresh_response = seeded_auth_client.post(
        "/api/v1/auth/refresh",
        json={},
    )

    assert refresh_response.status_code == 401


def test_logout_is_idempotent_without_valid_access_token(client: TestClient) -> None:
    """La déconnexion supprime le cookie même sans access token exploitable."""
    response = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": "Bearer expired-or-invalid"},
    )

    assert response.status_code == 204
    assert "refresh_token=" in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert "Path=/api/v1/auth" in response.headers["set-cookie"]


def test_auth_service_has_no_parallel_memory_store() -> None:
    """Le service d'authentification ne conserve plus de dictionnaire utilisateur."""
    assert not hasattr(app.state.container.get_auth_service(), "_users_db")


def test_malformed_access_subject_returns_401(seeded_auth_client: TestClient) -> None:
    """Un claim ``sub`` non textuel est rejeté sans erreur 500."""
    token = app.state.container.get_auth_service().create_access_token({"sub": 123})

    response = seeded_auth_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_change_own_password_success(seeded_auth_client: TestClient) -> None:
    """Un admin authentifié peut changer son mot de passe puis se reconnecter."""
    login = seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert login.status_code == 200
    access = login.json()["access_token"]

    change = seeded_auth_client.post(
        "/api/v1/auth/me/password",
        headers={"Authorization": f"Bearer {access}"},
        json={
            "current_password": "admin123",
            "new_password": "admin123-updated",
        },
    )
    assert change.status_code == 204

    assert seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    ).status_code == 401

    relogin = seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123-updated"},
    )
    assert relogin.status_code == 200

    # Restaure le mot de passe seed pour les autres tests de la session.
    restore = seeded_auth_client.post(
        "/api/v1/auth/me/password",
        headers={"Authorization": f"Bearer {relogin.json()['access_token']}"},
        json={
            "current_password": "admin123-updated",
            "new_password": "admin123",
        },
    )
    assert restore.status_code == 204


def test_change_own_password_rejects_wrong_current(
    seeded_auth_client: TestClient,
) -> None:
    """Un mauvais mot de passe actuel est refusé sans mutation."""
    login = seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    access = login.json()["access_token"]

    change = seeded_auth_client.post(
        "/api/v1/auth/me/password",
        headers={"Authorization": f"Bearer {access}"},
        json={
            "current_password": "wrong-password",
            "new_password": "admin123-updated",
        },
    )
    assert change.status_code == 401

    assert seeded_auth_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    ).status_code == 200


def test_change_own_password_rejects_guest(seeded_auth_client: TestClient) -> None:
    """Une session invité ne peut pas changer de mot de passe."""
    guest = seeded_auth_client.post("/api/v1/auth/guest")
    assert guest.status_code == 200
    access = guest.json()["access_token"]

    change = seeded_auth_client.post(
        "/api/v1/auth/me/password",
        headers={"Authorization": f"Bearer {access}"},
        json={
            "current_password": "anything",
            "new_password": "new-password-12",
        },
    )
    assert change.status_code == 403


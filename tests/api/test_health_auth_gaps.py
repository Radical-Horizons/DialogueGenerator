"""Tests API pour les routes non couvertes (gaps brownfield): healthcheck, health/detailed, auth/refresh, auth/logout."""
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from api.config.security_config import get_security_config
from api.main import app
from api.routers.auth import get_current_user_or_none


@pytest.fixture
def client() -> TestClient:
    from api.main import app
    return TestClient(app)


def _admin_user() -> dict[str, object]:
    """Utilisateur admin pour overrides de dépendance."""
    return {
        "id": "admin-id",
        "username": "admin",
        "role": "admin",
        "is_active": True,
    }


def _writer_user() -> dict[str, object]:
    """Utilisateur writer pour overrides de dépendance."""
    return {
        "id": "writer-id",
        "username": "writer",
        "role": "writer",
        "is_active": True,
    }


@pytest.fixture
def admin_client(client: TestClient) -> Iterator[TestClient]:
    """Client authentifié admin (sans s'appuyer sur DISABLE_AUTH)."""
    app.dependency_overrides[get_current_user_or_none] = _admin_user
    yield client
    app.dependency_overrides.pop(get_current_user_or_none, None)


@pytest.fixture
def writer_client(client: TestClient) -> Iterator[TestClient]:
    """Client authentifié writer."""
    app.dependency_overrides[get_current_user_or_none] = _writer_user
    yield client
    app.dependency_overrides.pop(get_current_user_or_none, None)


@pytest.fixture
def unauthenticated_client(client: TestClient) -> Iterator[TestClient]:
    """Client sans utilisateur authentifié."""
    app.dependency_overrides[get_current_user_or_none] = lambda: None
    yield client
    app.dependency_overrides.pop(get_current_user_or_none, None)


class TestHealthGaps:
    """[P0] Health endpoints non couverts par test_health.py."""

    def test_get_healthcheck_alias_returns_200(self, client: TestClient) -> None:
        """GET /api/v1/healthcheck (alias monitoring) retourne 200 et status healthy."""
        response = client.get("/api/v1/healthcheck")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        assert "service" in data
        assert "app_version" in data

    def test_get_health_detailed_returns_200(self, client: TestClient) -> None:
        """GET /health/detailed retourne 200 avec détails (bypass DISABLE_AUTH en pytest)."""
        response = client.get("/health/detailed")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "timestamp" in data
        assert "app_version" in data

    def test_get_health_detailed_as_admin_returns_200(
        self,
        admin_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """GET /health/detailed avec JWT admin retourne 200 même si DISABLE_AUTH est off."""
        monkeypatch.setattr(get_security_config(), "disable_auth", False)
        response = admin_client.get("/health/detailed")
        assert response.status_code == 200
        assert "app_version" in response.json()

    def test_get_health_detailed_as_writer_returns_403(
        self,
        writer_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """GET /health/detailed refuse les writers."""
        monkeypatch.setattr(get_security_config(), "disable_auth", False)
        response = writer_client.get("/health/detailed")
        assert response.status_code == 403

    def test_get_health_detailed_unauthenticated_returns_403(
        self,
        unauthenticated_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """GET /health/detailed refuse les requêtes anonymes hors bypass DISABLE_AUTH."""
        monkeypatch.setattr(get_security_config(), "disable_auth", False)
        response = unauthenticated_client.get("/health/detailed")
        assert response.status_code == 403


class TestAuthGaps:
    """[P0] Auth endpoints non couverts par test_auth.py: refresh, logout."""

    def test_refresh_without_token_returns_401(self, client: TestClient) -> None:
        """POST /api/v1/auth/refresh sans refresh token retourne 401."""
        response = client.post("/api/v1/auth/refresh")
        assert response.status_code == 401

    def test_refresh_with_valid_cookie_returns_200(
        self,
        seeded_auth_client: TestClient,
    ) -> None:
        """POST /api/v1/auth/refresh avec cookie refresh_token (après login) retourne 200."""
        login_resp = seeded_auth_client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert login_resp.status_code == 200
        # refresh_token est dans le cookie
        response = seeded_auth_client.post("/api/v1/auth/refresh")
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_logout_authenticated_returns_204(
        self,
        seeded_auth_client: TestClient,
    ) -> None:
        """POST /api/v1/auth/logout avec token valide retourne 204."""
        login_resp = seeded_auth_client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        response = seeded_auth_client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 204

    def test_logout_without_cookie_or_valid_access_token_is_idempotent(
        self,
        client: TestClient,
    ) -> None:
        """POST /logout reste idempotent sans cookie et avec un access token expiré."""
        response = client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": "Bearer expired-or-invalid"},
        )

        assert response.status_code == 204
        assert "refresh_token=" in response.headers.get("set-cookie", "")

"""Tests API pour les routes non couvertes (gaps brownfield): healthcheck, health/detailed, auth/refresh, auth/logout."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from api.main import app
    return TestClient(app)


class TestHealthGaps:
    """[P0] Health endpoints non couverts par test_health.py."""

    def test_get_healthcheck_alias_returns_200(self, client: TestClient):
        """GET /api/v1/healthcheck (alias monitoring) retourne 200 et status healthy."""
        response = client.get("/api/v1/healthcheck")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        assert "service" in data

    def test_get_health_detailed_returns_200(self, client: TestClient):
        """GET /health/detailed retourne 200 avec détails des dépendances."""
        response = client.get("/health/detailed")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "timestamp" in data


class TestAuthGaps:
    """[P0] Auth endpoints non couverts par test_auth.py: refresh, logout."""

    def test_refresh_without_token_returns_401(self, client: TestClient):
        """POST /api/v1/auth/refresh sans refresh token retourne 401."""
        response = client.post("/api/v1/auth/refresh", json={})
        assert response.status_code == 401

    def test_refresh_with_valid_cookie_returns_200(self, client: TestClient):
        """POST /api/v1/auth/refresh avec cookie refresh_token (après login) retourne 200."""
        login_resp = client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert login_resp.status_code == 200
        # refresh_token est dans le cookie
        response = client.post("/api/v1/auth/refresh", json={})
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_logout_authenticated_returns_204(self, client: TestClient):
        """POST /api/v1/auth/logout avec token valide retourne 204."""
        login_resp = client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        response = client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 204

"""Tests pour le health check."""
import pytest
from fastapi.testclient import TestClient
from api.app_version import APP_VERSION
from api.main import app


@pytest.fixture
def client():
    """Fixture pour créer un client de test FastAPI."""
    return TestClient(app)


def test_health_check(client: TestClient):
    """Test du health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data
    assert "service" in data
    assert data["app_version"] == APP_VERSION


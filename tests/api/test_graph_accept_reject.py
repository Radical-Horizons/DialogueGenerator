"""Tests API pour accept/reject nodes (Story 1.4)."""
import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture
def client():
    """Client de test."""
    yield TestClient(app)


class TestAcceptNode:
    """Tests pour POST /api/v1/unity-dialogues/graph/nodes/{node_id}/accept."""

    def test_accept_node_success(self, client: TestClient):
        """GIVEN un nœud à accepter et dialogue_id=current
        WHEN j'appelle l'endpoint accept
        THEN je reçois un succès"""
        node_id = "test-node-1"
        request_data = {"dialogue_id": "current"}
        response = client.post(
            f"/api/v1/unity-dialogues/graph/nodes/{node_id}/accept",
            json=request_data,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["node_id"] == node_id
        assert data["status"] == "accepted"

    def test_accept_node_missing_dialogue_id(self, client: TestClient):
        """GIVEN une requête sans dialogue_id
        WHEN j'appelle l'endpoint accept
        THEN je reçois une erreur de validation"""
        node_id = "test-node-1"
        request_data = {}
        response = client.post(
            f"/api/v1/unity-dialogues/graph/nodes/{node_id}/accept",
            json=request_data,
        )
        assert response.status_code == 422

    def test_accept_node_dialogue_not_found(self, client: TestClient):
        """GIVEN un dialogue_id qui n'existe pas
        WHEN j'appelle l'endpoint accept
        THEN je reçois 404 NotFound."""
        node_id = "test-node-1"
        request_data = {"dialogue_id": "nonexistent-dialogue-404.json"}
        response = client.post(
            f"/api/v1/unity-dialogues/graph/nodes/{node_id}/accept",
            json=request_data,
        )
        assert response.status_code == 404
        data = response.json()
        assert data.get("error", {}).get("code") == "NOT_FOUND"


class TestRejectNode:
    """Tests pour POST /api/v1/unity-dialogues/graph/nodes/{node_id}/reject."""

    def test_reject_node_success(self, client: TestClient):
        """GIVEN un nœud à rejeter et dialogue_id=current
        WHEN j'appelle l'endpoint reject
        THEN je reçois un succès"""
        node_id = "test-node-1"
        request_data = {"dialogue_id": "current"}
        response = client.post(
            f"/api/v1/unity-dialogues/graph/nodes/{node_id}/reject",
            json=request_data,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["node_id"] == node_id
        assert data["status"] == "rejected"

    def test_reject_node_missing_dialogue_id(self, client: TestClient):
        """GIVEN une requête sans dialogue_id
        WHEN j'appelle l'endpoint reject
        THEN je reçois une erreur de validation"""
        node_id = "test-node-1"
        request_data = {}
        response = client.post(
            f"/api/v1/unity-dialogues/graph/nodes/{node_id}/reject",
            json=request_data,
        )
        assert response.status_code == 422

    def test_reject_node_dialogue_not_found(self, client: TestClient):
        """GIVEN un dialogue_id qui n'existe pas
        WHEN j'appelle l'endpoint reject
        THEN je reçois 404 NotFound."""
        node_id = "test-node-1"
        request_data = {"dialogue_id": "nonexistent-dialogue-404.json"}
        response = client.post(
            f"/api/v1/unity-dialogues/graph/nodes/{node_id}/reject",
            json=request_data,
        )
        assert response.status_code == 404
        data = response.json()
        assert data.get("error", {}).get("code") == "NOT_FOUND"

"""Tests API pour l'endpoint POST /nodes/{node_id}/regenerate (Story 1.10)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from api.main import app
from api.dependencies import get_config_service, get_graph_node_orchestrator


@pytest.fixture
def mock_orchestrator():
    """Orchestrateur mocké : generate retourne un résultat fixe."""
    orb = MagicMock()
    mock_result = MagicMock()
    mock_result.nodes = [{"id": "gen-123", "speaker": "PNJ", "line": "Nouvelle ligne"}]
    mock_result.suggested_connections = [
        {"from": "parent-1", "to": "gen-123", "via_choice_index": 0, "connection_type": "choice"}
    ]
    orb.generate = AsyncMock(return_value=mock_result)
    return orb


@pytest.fixture
def mock_config_service():
    """Config mockée pour _validate_dialogue_exists (dialogue_id=current skip)."""
    cfg = MagicMock()
    return cfg


@pytest.fixture
def client(mock_orchestrator, mock_config_service):
    """Client de test avec dépendances mockées."""
    app.dependency_overrides[get_graph_node_orchestrator] = lambda: mock_orchestrator
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestRegenerateNode:
    """Tests pour POST /api/v1/unity-dialogues/graph/nodes/{node_id}/regenerate."""

    def test_regenerate_node_success(self, client: TestClient):
        """Régénération réussie : retourne le nœud avec l'id demandé (remplacement in-place)."""
        with patch("api.routers.graph_node_history._validate_dialogue_exists"), \
             patch("factories.llm_factory.LLMClientFactory") as mock_factory:
            mock_factory.create_client.return_value = MagicMock()
            resp = client.post(
                "/api/v1/unity-dialogues/graph/nodes/node-pending-1/regenerate",
                json={
                    "dialogue_id": "current",
                    "new_instructions": "Tone plus sombre",
                    "preserve_connections": True,
                    "parent_node_id": "parent-1",
                    "parent_node_content": {"id": "parent-1", "speaker": "PNJ", "line": "Ligne parent"},
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "node" in data
        assert data["node"]["id"] == "node-pending-1"
        assert data["node"].get("line") == "Nouvelle ligne"
        assert "suggested_connections" in data
        assert len(data["suggested_connections"]) == 1
        assert data["suggested_connections"][0].get("to") == "node-pending-1"

    def test_regenerate_preserves_stable_id(self, client: TestClient):
        """Réponse préserve stableID (et autres champs) du nœud généré ; seul id est forcé à node_id."""
        with patch("api.routers.graph_node_history._validate_dialogue_exists"), patch(
            "factories.llm_factory.LLMClientFactory"
        ) as mock_factory:
            mock_factory.create_client.return_value = MagicMock()
            orb = AsyncMock()
            orb.generate = AsyncMock(
                return_value=MagicMock(
                    nodes=[
                        {
                            "id": "gen-123",
                            "stableID": "stable-abc",
                            "speaker": "PNJ",
                            "line": "Nouvelle ligne",
                        }
                    ],
                    suggested_connections=[
                        {"from": "parent-1", "to": "gen-123", "via_choice_index": 0, "connection_type": "choice"}
                    ],
                )
            )
            app.dependency_overrides[get_graph_node_orchestrator] = lambda: orb
            try:
                resp = client.post(
                    "/api/v1/unity-dialogues/graph/nodes/node-pending-1/regenerate",
                    json={
                        "dialogue_id": "current",
                        "new_instructions": "Tone plus sombre",
                        "preserve_connections": True,
                        "parent_node_id": "parent-1",
                        "parent_node_content": {"id": "parent-1", "speaker": "PNJ", "line": "Ligne parent"},
                    },
                )
            finally:
                app.dependency_overrides.pop(get_graph_node_orchestrator, None)
        assert resp.status_code == 200
        data = resp.json()
        assert data["node"]["id"] == "node-pending-1"
        assert data["node"].get("stableID") == "stable-abc"

    def test_regenerate_node_missing_body_fields(self, client: TestClient):
        """Requête sans parent_node_id ou new_instructions → 422."""
        with patch("api.routers.graph_node_history._validate_dialogue_exists"):
            resp = client.post(
                "/api/v1/unity-dialogues/graph/nodes/node-1/regenerate",
                json={"dialogue_id": "current"},
            )
        assert resp.status_code == 422

    def test_regenerate_node_dialogue_not_found(self, client: TestClient):
        """dialogue_id inexistant → 404."""
        with patch("api.routers.graph_node_history._validate_dialogue_exists") as validate:
            from api.exceptions import NotFoundException
            validate.side_effect = NotFoundException(
                resource_type="Dialogue",
                resource_id="missing.json",
                request_id=None,
            )
            resp = client.post(
                "/api/v1/unity-dialogues/graph/nodes/node-1/regenerate",
                json={
                    "dialogue_id": "missing",
                    "new_instructions": "Instructions",
                    "parent_node_id": "parent-1",
                    "parent_node_content": {},
                },
            )
        assert resp.status_code == 404

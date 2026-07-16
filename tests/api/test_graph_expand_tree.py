"""Tests pour POST /api/v1/unity-dialogues/graph/expand-tree."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_config_service,
    get_dialogue_tree_expansion_service,
    get_unity_dialogue_orchestrator,
)
from api.main import app
from api.schemas.graph import ExpandTreeResponse
from services.configuration_service import ConfigurationService
from services.dialogue_tree_expansion_service import TreeExpansionResult
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator


@pytest.fixture
def mock_config_service() -> MagicMock:
    """Mock ConfigurationService avec chemin Unity."""
    mock_service = MagicMock(spec=ConfigurationService)
    mock_service.get_llm_config.return_value = {}
    mock_service.get_available_llm_models.return_value = []
    mock_service.get_llm_fallback_chain.return_value = []
    mock_service.get_unity_dialogues_path.return_value = "data/test_dialogues"
    return mock_service


@pytest.fixture
def sample_body() -> dict:
    """Corps de requête minimal valide."""
    return {
        "user_instructions": "Une rencontre courte entre le PJ et le PNJ.",
        "context_selections": {
            "characters_full": ["Uresaïr"],
            "characters_excerpt": [],
            "locations_full": ["Merid"],
            "locations_excerpt": [],
            "items_full": [],
            "items_excerpt": [],
            "species_full": [],
            "species_excerpt": [],
            "communities_full": [],
            "communities_excerpt": [],
            "dialogues_examples": [],
        },
        "max_depth": 1,
        "max_choices": 2,
        "title": "Test expand",
        "persist": False,
    }


@pytest.fixture
def client(mock_config_service: MagicMock) -> TestClient:
    """Client de test avec config mockée."""
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_expand_tree_dry_run(client: TestClient, sample_body: dict) -> None:
    """Dry-run retourne une estimation sans appel LLM."""
    sample_body["dry_run"] = True
    sample_body["max_depth"] = 4
    sample_body["max_choices"] = 3

    response = client.post("/api/v1/unity-dialogues/graph/expand-tree", json=sample_body)

    assert response.status_code == 200
    data = response.json()
    assert data["node_count"] == 0
    assert data["llm_calls_estimated"] == 121
    assert data["levels_expanded"] == 0
    assert data["cost_usd"] is not None


def test_expand_tree_dry_run_ignores_existing_persist_target(
    client: TestClient,
    sample_body: dict,
    mock_config_service: MagicMock,
    tmp_path: Path,
) -> None:
    """Une estimation dry-run ne consulte ni ne verrouille le fichier cible."""
    dialogue_dir = tmp_path / "dialogues"
    dialogue_dir.mkdir()
    (dialogue_dir / "existing.json").write_text("{}", encoding="utf-8")
    mock_config_service.get_unity_dialogues_path.return_value = dialogue_dir
    sample_body.update(
        {
            "dry_run": True,
            "persist": True,
            "document_id": "existing",
        }
    )

    response = client.post(
        "/api/v1/unity-dialogues/graph/expand-tree",
        json=sample_body,
    )

    assert response.status_code == 200
    assert response.json()["document_id"] == "existing"


def test_expand_tree_requires_character(client: TestClient, sample_body: dict) -> None:
    """Sans personnage, la requête est rejetée."""
    sample_body["context_selections"]["characters_full"] = []
    sample_body["context_selections"]["locations_full"] = ["Merid"]
    response = client.post("/api/v1/unity-dialogues/graph/expand-tree", json=sample_body)
    assert response.status_code == 422


def test_expand_tree_requires_location(client: TestClient, sample_body: dict) -> None:
    """Sans lieu, la requête est rejetée."""
    sample_body["context_selections"]["locations_full"] = []
    response = client.post("/api/v1/unity-dialogues/graph/expand-tree", json=sample_body)
    assert response.status_code == 422


def test_expand_tree_rejects_non_mini_model(client: TestClient, sample_body: dict) -> None:
    """Seul gpt-5-mini est autorisé pour l'expansion BFS."""
    sample_body["llm_model_identifier"] = "gpt-5.2"
    response = client.post("/api/v1/unity-dialogues/graph/expand-tree", json=sample_body)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_expand_tree_depth_1_with_mock_service(
    mock_config_service: MagicMock,
    sample_body: dict,
) -> None:
    """Génération depth=1 via service mocké."""
    mock_expansion = MagicMock()
    mock_expansion.expand = AsyncMock(
        return_value=TreeExpansionResult(
            document={
                "schemaVersion": "1.2.0",
                "nodes": [
                    {
                        "id": "START",
                        "line": "Hi",
                        "choices": [
                            {
                                "text": "A",
                                "targetNode": "node-mockchild01",
                                "choiceId": "START-choice-0",
                            }
                        ],
                    },
                    {"id": "node-mockchild01", "line": "Bye"},
                ],
            },
            node_count=2,
            llm_calls=3,
            levels_expanded=1,
            failed_parents=[],
            failed_parent_details=[],
            expansion_status="complete",
            title="Test expand",
        )
    )
    mock_unity = MagicMock(spec=UnityDialogueOrchestrator)

    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    app.dependency_overrides[get_dialogue_tree_expansion_service] = lambda: mock_expansion
    app.dependency_overrides[get_unity_dialogue_orchestrator] = lambda: mock_unity

    with patch("api.routers.graph_expansion.create_llm_client_for_router") as mock_llm_factory:
        mock_llm_factory.return_value = MagicMock()
        client = TestClient(app)
        response = client.post("/api/v1/unity-dialogues/graph/expand-tree", json=sample_body)

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = ExpandTreeResponse.model_validate(response.json())
    assert data.node_count == 2
    assert data.levels_expanded == 1
    assert data.expansion_status == "complete"
    mock_expansion.expand.assert_awaited_once()


def test_expand_tree_invalid_document_returns_422(
    mock_config_service: MagicMock,
    sample_body: dict,
) -> None:
    """Document invalide après expansion → 422 avec erreurs schéma."""
    mock_expansion = MagicMock()
    mock_expansion.expand = AsyncMock(
        return_value=TreeExpansionResult(
            document={
                "schemaVersion": "1.2.0",
                "nodes": [
                    {
                        "id": "START",
                        "line": "Hi",
                        "choices": [
                            {
                                "text": "A",
                                "targetNode": "MISSING_NODE",
                                "choiceId": "START-choice-0",
                            }
                        ],
                    },
                ],
            },
            node_count=1,
            llm_calls=1,
            levels_expanded=0,
            title="Invalid",
        )
    )
    mock_unity = MagicMock(spec=UnityDialogueOrchestrator)

    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    app.dependency_overrides[get_dialogue_tree_expansion_service] = lambda: mock_expansion
    app.dependency_overrides[get_unity_dialogue_orchestrator] = lambda: mock_unity

    with patch("api.routers.graph_expansion.create_llm_client_for_router") as mock_llm_factory:
        mock_llm_factory.return_value = MagicMock()
        client = TestClient(app)
        response = client.post("/api/v1/unity-dialogues/graph/expand-tree", json=sample_body)

    app.dependency_overrides.clear()

    assert response.status_code == 422

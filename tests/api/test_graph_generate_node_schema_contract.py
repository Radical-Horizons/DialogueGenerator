"""Contrat API : generate-node (LLM mocké) → validate-schema → PUT /documents.

``enrich_with_ids`` et l'orchestrateur sont réels ; seul ``generate_dialogue_node`` est mocké.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service, get_graph_node_orchestrator
from api.main import app
from services.configuration_service import ConfigurationService
from services.graph_conversion_service import GraphConversionService
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.unity_dialogue_generation_service import UnityDialogueGenerationService
from services.unity_export_validation_service import validate_unity_export_document
from tests.fixtures.unity_post_generation import (
    llm_generation_response,
)


@pytest.fixture
def mock_config_service(tmp_path: Path) -> MagicMock:
    """ConfigurationService mocké avec répertoire Unity temporaire."""
    mock_service = MagicMock(spec=ConfigurationService)
    mock_service.get_llm_config.return_value = {}
    mock_service.get_available_llm_models.return_value = []
    mock_service.get_unity_dialogues_path.return_value = str(tmp_path)
    return mock_service


@pytest.fixture
def generation_service_with_mocked_llm() -> UnityDialogueGenerationService:
    """Service réel ; seul l'appel LLM structuré est mocké."""
    service = UnityDialogueGenerationService()
    service.generate_dialogue_node = AsyncMock(return_value=llm_generation_response())
    return service


@pytest.fixture
def real_orchestrator(
    generation_service_with_mocked_llm: UnityDialogueGenerationService,
) -> GraphNodeOrchestrator:
    """Orchestrateur réel branché sur le service ci-dessus."""
    return GraphNodeOrchestrator(generation_service=generation_service_with_mocked_llm)


@pytest.fixture
def contract_client(
    mock_config_service: MagicMock,
    real_orchestrator: GraphNodeOrchestrator,
) -> TestClient:
    """Client API avec orchestrateur réel (enrich_with_ids non mocké)."""
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    app.dependency_overrides[get_graph_node_orchestrator] = lambda: real_orchestrator
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.mark.integration
class TestGraphGenerateNodeSchemaContract:
    """Chaîne complète post-génération sans mock sur enrich_with_ids."""

    @pytest.mark.asyncio
    async def test_generate_node_enrich_validate_schema_and_put(
        self,
        contract_client: TestClient,
        generation_service_with_mocked_llm: UnityDialogueGenerationService,
        tmp_path: Path,
    ) -> None:
        """generate-node → graphe post-génération → validate-schema → PUT persiste un blob valide."""
        with patch("factories.llm_factory.LLMClientFactory") as mock_factory:
            mock_factory.create_client.return_value = MagicMock()

            parent = {
                "id": "START",
                "speaker": "PNJ",
                "line": "Contexte parent",
            }
            gen_response = contract_client.post(
                "/api/v1/unity-dialogues/graph/generate-node",
                json={
                    "parent_node_id": "START",
                    "parent_node_content": parent,
                    "user_instructions": "Génère la rencontre",
                    "context_selections": {},
                    "choices_mode": "capped",
                },
            )
            assert gen_response.status_code == 200, gen_response.text
            gen_data = gen_response.json()
            node = gen_data["node"]
            assert node is not None

            generation_service_with_mocked_llm.generate_dialogue_node.assert_awaited_once()

            assert node["id"].startswith("node-")
            assert len(node["id"]) == 37
            choice = node["choices"][0]
            assert choice["choiceId"] == f"choice_{node['id']}_0"
            assert choice["targetNode"] == "END"
            assert choice["test"] == "Volonté+Adaptabilité:12"
            assert node["consequences"]["flag"] == "FLAG_RENCONTRE_VALKAZER_INIT"

            nodes = [
                {
                    "id": node["id"],
                    "type": "dialogueNode",
                    "position": {"x": 0, "y": 0},
                    "data": node,
                }
            ]
            edges: list[dict[str, object]] = []
            validate_response = contract_client.post(
                "/api/v1/unity-dialogues/graph/validate-schema",
                json={"nodes": nodes, "edges": edges},
            )
            assert validate_response.status_code == 200, validate_response.text
            validate_data = validate_response.json()
            assert validate_data["is_valid"] is True, validate_data.get("errors")

            document = GraphConversionService.graph_to_unity_document(nodes, edges)
            put_response = contract_client.put(
                "/api/v1/documents/schema-contract-gen",
                json={"document": document, "revision": 1},
            )
            assert put_response.status_code == 200, put_response.text

            persisted = json.loads(
                (tmp_path / "schema-contract-gen.json").read_text(encoding="utf-8")
            )
            result = validate_unity_export_document(persisted)
            assert result.is_valid is True, result.errors
            persisted_choice = persisted["nodes"][0]["choices"][0]
            assert persisted_choice["choiceId"] == f"choice_{node['id']}_0"
            assert persisted_choice["targetNode"] == "END"
            assert persisted["nodes"][0]["consequences"]["flag"] == "FLAG_RENCONTRE_VALKAZER_INIT"

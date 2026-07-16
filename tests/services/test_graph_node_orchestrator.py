"""Tests unitaires pour GraphNodeOrchestrator.

Vérifie le dispatch correct vers les différents modes de génération
et la construction des connexions/résultats.
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

from services.graph_node_orchestrator import (
    GraphNodeOrchestrator,
    GenerationResult,
    _resolve_instructions,
    _build_test_connections,
    _build_enriched_instructions,
    DEFAULT_INSTRUCTIONS,
)


class TestHelperFunctions:
    """Tests pour les fonctions utilitaires."""

    def test_resolve_instructions_with_value(self):
        assert _resolve_instructions("  Do something  ") == "Do something"

    def test_resolve_instructions_empty(self):
        assert _resolve_instructions("") == DEFAULT_INSTRUCTIONS

    def test_resolve_instructions_none(self):
        assert _resolve_instructions(None) == DEFAULT_INSTRUCTIONS

    def test_build_test_connections(self):
        connection_data = {
            "testCriticalFailureNode": "NODE_CF",
            "testFailureNode": "NODE_F",
            "testSuccessNode": "NODE_S",
            "testCriticalSuccessNode": "NODE_CS",
        }
        result = _build_test_connections("test-node-X", connection_data)
        assert len(result) == 4
        assert result[0]["from"] == "test-node-X"
        assert result[0]["to"] == "NODE_CF"
        assert result[0]["connection_type"] == "test-critical-failure"
        assert result[3]["connection_type"] == "test-critical-success"

    def test_build_test_connections_partial(self):
        connection_data = {"testSuccessNode": "NODE_S"}
        result = _build_test_connections("test-node-X", connection_data)
        assert len(result) == 1
        assert result[0]["to"] == "NODE_S"

    def test_build_enriched_instructions_with_choice(self):
        result = _build_enriched_instructions("PNJ", "Hello", "Continue", choice_text="Bye")
        assert "PNJ: Hello" in result
        assert "Bye" in result
        assert "Continue" in result

    def test_build_enriched_instructions_with_path(self):
        nodes = [
            {
                "id": "START",
                "speaker": "PNJ",
                "line": "Start line",
                "choices": [{"text": "Go", "targetNode": "P"}],
            },
            {
                "id": "P",
                "speaker": "PNJ",
                "line": "Parent line",
                "choices": [],
            },
        ]
        result = _build_enriched_instructions(
            "PNJ",
            "Parent line",
            "Continue",
            choice_text="Go",
            dialogue_nodes=nodes,
            parent_node_id="P",
            player_choice_label="PJ",
        )
        assert "Historique du dialogue" in result
        assert "Start line" in result
        assert "PJ: Go" in result

    def test_build_enriched_instructions_without_choice(self):
        result = _build_enriched_instructions("PNJ", "Hello", "Continue")
        assert "PNJ: Hello" in result
        assert "Continue" in result
        assert "joueur" not in result


class TestGraphNodeOrchestrator:
    """Tests pour l'orchestrateur."""

    @pytest.fixture
    def mock_generation_service(self):
        svc = MagicMock()
        svc.generate_dialogue_node = AsyncMock()
        svc.enrich_with_ids = MagicMock()
        svc.generate_nodes_for_choice_with_test = AsyncMock()
        return svc

    @pytest.fixture
    def orchestrator(self, mock_generation_service):
        return GraphNodeOrchestrator(generation_service=mock_generation_service)

    @pytest.fixture
    def mock_llm_client(self):
        return MagicMock()

    # --- Normal generation (nextNode) ---

    @pytest.mark.asyncio
    async def test_generate_normal_nextnode(self, orchestrator, mock_generation_service, mock_llm_client):
        mock_node = {"id": "NODE_P_CHILD", "speaker": "PNJ", "line": "Hi"}
        mock_generation_service.generate_dialogue_node.return_value = {"nodes": [mock_node]}
        mock_generation_service.enrich_with_ids.return_value = [mock_node]

        result = await orchestrator.generate(
            llm_client=mock_llm_client,
            parent_node_id="NODE_P",
            parent_node_content={"speaker": "PNJ", "line": "Hey"},
            user_instructions="Continue",
        )

        assert isinstance(result, GenerationResult)
        assert len(result.nodes) == 1
        assert result.nodes[0]["id"] == "NODE_P_CHILD"
        assert result.suggested_connections[0]["connection_type"] == "nextNode"

    # --- Choice-specific generation ---

    @pytest.mark.asyncio
    async def test_generate_for_specific_choice(self, orchestrator, mock_generation_service, mock_llm_client):
        mock_node = {"id": "NODE_P_CHOICE_1", "speaker": "PNJ", "line": "Ok"}
        mock_generation_service.generate_dialogue_node.return_value = {"nodes": [mock_node]}
        mock_generation_service.enrich_with_ids.return_value = [mock_node]

        result = await orchestrator.generate(
            llm_client=mock_llm_client,
            parent_node_id="NODE_P",
            parent_node_content={
                "speaker": "PNJ",
                "line": "Question?",
                "choices": [
                    {"text": "A", "targetNode": None},
                    {"text": "B", "targetNode": None},
                ],
            },
            user_instructions="Continue",
            target_choice_index=1,
        )

        assert result.nodes[0]["id"] == "NODE_P_CHOICE_1"
        assert result.suggested_connections[0]["via_choice_index"] == 1
        assert result.suggested_connections[0]["connection_type"] == "choice"
        start_id = mock_generation_service.enrich_with_ids.call_args.kwargs["start_id"]
        assert start_id.startswith("node-")
        assert len(start_id) == 37

    # --- Invalid choice index ---

    @pytest.mark.asyncio
    async def test_generate_invalid_choice_index_raises(self, orchestrator, mock_llm_client):
        with pytest.raises(ValueError, match="Index de choix invalide"):
            await orchestrator.generate(
                llm_client=mock_llm_client,
                parent_node_id="NODE_P",
                parent_node_content={
                    "speaker": "PNJ",
                    "line": "Q",
                    "choices": [{"text": "A"}],
                },
                user_instructions="Go",
                target_choice_index=99,
            )

    # --- No choices but target_choice_index provided ---

    @pytest.mark.asyncio
    async def test_generate_no_choices_with_index_raises(self, orchestrator, mock_llm_client):
        with pytest.raises(ValueError, match="Aucun choix disponible"):
            await orchestrator.generate(
                llm_client=mock_llm_client,
                parent_node_id="NODE_P",
                parent_node_content={"speaker": "PNJ", "line": "Q"},
                user_instructions="Go",
                target_choice_index=0,
            )

    # --- Batch generation ---

    @pytest.mark.asyncio
    async def test_generate_batch(self, orchestrator, mock_generation_service, mock_llm_client):
        with patch("services.graph_node_orchestrator.GraphGenerationService") as mock_ggs_class:
            mock_ggs = MagicMock()
            mock_ggs_class.return_value = mock_ggs
            mock_ggs.generate_nodes_for_all_choices = AsyncMock(
                return_value={
                    "nodes": [
                        {"id": "NODE_P_CHOICE_0"},
                        {"id": "NODE_P_CHOICE_1"},
                    ],
                    "connections": [
                        {"from": "NODE_P", "to": "NODE_P_CHOICE_0", "via_choice_index": 0, "connection_type": "choice"},
                        {"from": "NODE_P", "to": "NODE_P_CHOICE_1", "via_choice_index": 1, "connection_type": "choice"},
                    ],
                    "connected_choices_count": 0,
                    "generated_choices_count": 2,
                    "failed_choices_count": 0,
                    "total_choices_count": 2,
                }
            )

            result = await orchestrator.generate(
                llm_client=mock_llm_client,
                parent_node_id="NODE_P",
                parent_node_content={
                    "speaker": "PNJ",
                    "line": "Q",
                    "choices": [
                        {"text": "A", "targetNode": None},
                        {"text": "B", "targetNode": None},
                    ],
                },
                user_instructions="Go",
                generate_all_choices=True,
            )

            assert result.batch_count == 2
            assert result.generated_choices_count == 2
            assert len(result.nodes) == 2

    # --- Batch with no choices raises ---

    @pytest.mark.asyncio
    async def test_generate_batch_no_choices_raises(self, orchestrator, mock_llm_client):
        with pytest.raises(ValueError, match="Aucun choix disponible"):
            await orchestrator.generate(
                llm_client=mock_llm_client,
                parent_node_id="NODE_P",
                parent_node_content={"speaker": "PNJ", "line": "Q"},
                user_instructions="Go",
                generate_all_choices=True,
            )

    # --- Choice with test → 4 nodes ---

    @pytest.mark.asyncio
    async def test_generate_choice_with_test(self, orchestrator, mock_generation_service, mock_llm_client):
        mock_generation_service.generate_nodes_for_choice_with_test.return_value = {
            "nodes": [
                {"id": "NODE_CF"},
                {"id": "NODE_F"},
                {"id": "NODE_S"},
                {"id": "NODE_CS"},
            ],
            "connections": [
                {
                    "testCriticalFailureNode": "NODE_CF",
                    "testFailureNode": "NODE_F",
                    "testSuccessNode": "NODE_S",
                    "testCriticalSuccessNode": "NODE_CS",
                }
            ],
        }

        result = await orchestrator.generate(
            llm_client=mock_llm_client,
            parent_node_id="NODE_P",
            parent_node_content={
                "speaker": "PNJ",
                "line": "Q",
                "choices": [
                    {"text": "A", "test": "Raison+Rhétorique:8"},
                ],
            },
            user_instructions="Go",
            target_choice_index=0,
        )

        assert len(result.nodes) == 4
        assert len(result.suggested_connections) == 4
        assert result.suggested_connections[0]["connection_type"] == "test-critical-failure"

    @pytest.mark.asyncio
    async def test_generate_choice_with_empty_test_uses_single_node(
        self, orchestrator, mock_generation_service, mock_llm_client
    ):
        """Choix avec test vide ou blanc → génération 1 nœud (pas 4), évite 422 après suppression du TestNode."""
        mock_node = {"id": "NODE_P_CHOICE_0", "speaker": "PNJ", "line": "Ok"}
        mock_generation_service.generate_dialogue_node.return_value = {"nodes": [mock_node]}
        mock_generation_service.enrich_with_ids.return_value = [mock_node]

        result = await orchestrator.generate(
            llm_client=mock_llm_client,
            parent_node_id="NODE_P",
            parent_node_content={
                "speaker": "PNJ",
                "line": "Q",
                "choices": [{"text": "A", "test": ""}],
            },
            user_instructions="Go",
            target_choice_index=0,
        )

        assert len(result.nodes) == 1
        mock_generation_service.generate_nodes_for_choice_with_test.assert_not_called()
        mock_generation_service.generate_dialogue_node.assert_called_once()

    # --- Test node generation ---

    @pytest.mark.asyncio
    async def test_generate_from_test_node(self, orchestrator, mock_generation_service, mock_llm_client):
        mock_generation_service.generate_nodes_for_choice_with_test.return_value = {
            "nodes": [
                {"id": "NODE_CF"},
                {"id": "NODE_F"},
                {"id": "NODE_S"},
                {"id": "NODE_CS"},
            ],
            "connections": [
                {
                    "testCriticalFailureNode": "NODE_CF",
                    "testFailureNode": "NODE_F",
                    "testSuccessNode": "NODE_S",
                    "testCriticalSuccessNode": "NODE_CS",
                }
            ],
        }

        result = await orchestrator.generate(
            llm_client=mock_llm_client,
            parent_node_id="test-node-NODE_START-choice-0",
            parent_node_content={
                "type": "testNode",
                "test": "Raison+Rhétorique:8",
                "parent_speaker": "PNJ",
                "parent_line": "Hello",
            },
            user_instructions="Go",
        )

        assert len(result.nodes) == 4
        assert result.suggested_connections[0]["from"] == "test-node-NODE_START-choice-0"

    # --- Default instructions ---

    @pytest.mark.asyncio
    async def test_empty_instructions_use_default(self, orchestrator, mock_generation_service, mock_llm_client):
        mock_node = {"id": "NODE_P_CHILD", "speaker": "PNJ", "line": "Hi"}
        mock_generation_service.generate_dialogue_node.return_value = {"nodes": [mock_node]}
        mock_generation_service.enrich_with_ids.return_value = [mock_node]

        await orchestrator.generate(
            llm_client=mock_llm_client,
            parent_node_id="NODE_P",
            parent_node_content={"speaker": "PNJ", "line": "Hey"},
            user_instructions="",
        )

        call_args = mock_generation_service.generate_dialogue_node.call_args
        prompt = call_args.kwargs.get("prompt", call_args[1].get("prompt", ""))
        assert DEFAULT_INSTRUCTIONS in prompt

    # --- _build_normal_connections ---

    def test_build_normal_connections_choice(self):
        conns = GraphNodeOrchestrator._build_normal_connections(
            parent_node_id="P",
            generated_node_id="G",
            parent_choices=[{"text": "A", "targetNode": None}],
            target_choice_index=0,
        )
        assert conns[0]["via_choice_index"] == 0
        assert conns[0]["connection_type"] == "choice"

    def test_build_normal_connections_first_unconnected(self):
        conns = GraphNodeOrchestrator._build_normal_connections(
            parent_node_id="P",
            generated_node_id="G",
            parent_choices=[
                {"text": "A", "targetNode": "X"},
                {"text": "B", "targetNode": None},
            ],
            target_choice_index=None,
        )
        assert conns[0]["via_choice_index"] == 1

    def test_build_normal_connections_nextnode(self):
        conns = GraphNodeOrchestrator._build_normal_connections(
            parent_node_id="P",
            generated_node_id="G",
            parent_choices=[],
            target_choice_index=None,
        )
        assert conns[0]["connection_type"] == "nextNode"

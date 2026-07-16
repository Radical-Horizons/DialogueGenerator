"""Tests unitaires pour DialogueTreeExpansionService."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.schemas.dialogue import ContextSelection, GenerateUnityDialogueResponse
from services.dialogue_tree_expansion_service import (
    DialogueTreeExpansionService,
    TreeExpansionError,
    _apply_connections,
    estimate_tree_llm_calls,
)
from services.graph_node_orchestrator import GenerationResult


class TestEstimateTreeLlmCalls:
    """Tests pour l'estimation du nombre d'appels LLM."""

    def test_depth_4_choices_3(self) -> None:
        assert estimate_tree_llm_calls(4, 3) == 121

    def test_depth_2_choices_2(self) -> None:
        assert estimate_tree_llm_calls(2, 2) == 7


class TestApplyConnections:
    """Tests pour l'application des connexions parent→enfant."""

    def test_sets_target_node_on_choice(self) -> None:
        parent = {
            "id": "START",
            "choices": [
                {"text": "A", "targetNode": "END"},
                {"text": "B", "targetNode": "END"},
            ],
        }
        child = {"id": "NODE_1", "line": "Réponse"}
        registry = {"START": parent}
        connections = [
            {
                "from": "START",
                "to": "NODE_1",
                "via_choice_index": 0,
                "connection_type": "choice",
            }
        ]
        new_ids = _apply_connections(registry, "START", connections, [child])
        assert new_ids == ["NODE_1"]
        assert parent["choices"][0]["targetNode"] == "NODE_1"


@pytest.mark.asyncio
async def test_expand_depth_2_choices_2() -> None:
    """BFS depth=2, choices=2 → 7 nœuds avec connexions et feuilles sans choix."""
    unity_orchestrator = MagicMock()
    start_json = json.dumps(
        [
            {
                "id": "START",
                "speaker": "PNJ",
                "line": "Bonjour",
                "choices": [
                    {"text": "Choix A", "targetNode": "END"},
                    {"text": "Choix B", "targetNode": "END"},
                ],
            }
        ]
    )
    unity_orchestrator.generate = AsyncMock(
        return_value=GenerateUnityDialogueResponse(
            json_content=start_json,
            title="Test",
            raw_prompt="prompt",
            prompt_hash="hash",
            estimated_tokens=100,
        )
    )

    graph_orchestrator = MagicMock()
    call_count = 0

    async def fake_generate(**kwargs: object) -> GenerationResult:
        nonlocal call_count
        call_count += 1
        parent_id = kwargs["parent_node_id"]
        max_choices = kwargs.get("max_choices")
        if max_choices == 0:
            leaf_a = {"id": f"LEAF_{parent_id}_A", "line": "Fin A"}
            leaf_b = {"id": f"LEAF_{parent_id}_B", "line": "Fin B"}
            return GenerationResult(
                nodes=[leaf_a, leaf_b],
                suggested_connections=[
                    {
                        "from": parent_id,
                        "to": leaf_a["id"],
                        "via_choice_index": 0,
                        "connection_type": "choice",
                    },
                    {
                        "from": parent_id,
                        "to": leaf_b["id"],
                        "via_choice_index": 1,
                        "connection_type": "choice",
                    },
                ],
                parent_node_id=str(parent_id),
                generated_choices_count=2,
            )
        node_a = {
            "id": f"NODE_{parent_id}_A",
            "line": "A",
            "choices": [
                {"text": "x", "targetNode": "END"},
                {"text": "y", "targetNode": "END"},
            ],
        }
        node_b = {
            "id": f"NODE_{parent_id}_B",
            "line": "B",
            "choices": [
                {"text": "z", "targetNode": "END"},
                {"text": "w", "targetNode": "END"},
            ],
        }
        return GenerationResult(
            nodes=[node_a, node_b],
            suggested_connections=[
                {"from": parent_id, "to": node_a["id"], "via_choice_index": 0, "connection_type": "choice"},
                {"from": parent_id, "to": node_b["id"], "via_choice_index": 1, "connection_type": "choice"},
            ],
            parent_node_id=str(parent_id),
            generated_choices_count=2,
        )

    graph_orchestrator.generate = fake_generate

    service = DialogueTreeExpansionService(graph_orchestrator=graph_orchestrator)
    context = ContextSelection(characters_full=["Uresaïr"])
    result = await service.expand(
        unity_orchestrator=unity_orchestrator,
        llm_client=MagicMock(),
        user_instructions="Scène de test",
        context_selections=context,
        max_depth=2,
        max_choices=2,
        llm_model_identifier="gpt-5.6-luna",
    )

    assert result.node_count == 7
    assert result.levels_expanded == 2
    assert result.llm_calls >= 5
    assert result.document["schemaVersion"] == "1.2.0"
    assert result.expansion_status == "complete"
    start = next(n for n in result.document["nodes"] if n["id"] == "START")
    assert start["choices"][0]["targetNode"] != "END"
    for node in result.document["nodes"]:
        for choice in node.get("choices") or []:
            assert choice.get("choiceId"), f"choiceId manquant sur {node.get('id')}"


@pytest.mark.asyncio
async def test_expand_fail_fast_on_parent_error() -> None:
    """Sans allow_partial, un échec parent lève TreeExpansionError."""
    unity_orchestrator = MagicMock()
    start_json = json.dumps(
        [
            {
                "id": "START",
                "line": "Bonjour",
                "choices": [{"text": "Choix A", "targetNode": "END"}],
            }
        ]
    )
    unity_orchestrator.generate = AsyncMock(
        return_value=GenerateUnityDialogueResponse(
            json_content=start_json,
            title="Test",
            raw_prompt="prompt",
            prompt_hash="hash",
            estimated_tokens=100,
        )
    )
    unity_orchestrator.dialogue_service.context_builder.get_characters_names.return_value = [
        "Uresaïr"
    ]

    graph_orchestrator = MagicMock()

    async def failing_generate(**kwargs: object) -> GenerationResult:
        raise ValueError("validation simulée")

    graph_orchestrator.generate = failing_generate

    service = DialogueTreeExpansionService(graph_orchestrator=graph_orchestrator)
    context = ContextSelection(characters_full=["Uresaïr"])

    with pytest.raises(TreeExpansionError, match="START"):
        await service.expand(
            unity_orchestrator=unity_orchestrator,
            llm_client=MagicMock(),
            user_instructions="Scène de test",
            context_selections=context,
            max_depth=1,
            max_choices=1,
            llm_model_identifier="gpt-5.6-luna",
            allow_partial=False,
        )

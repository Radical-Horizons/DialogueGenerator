"""Lot de génération : une issue de test déjà écrite n'est jamais régénérée.

Un choix testé ne porte pas de ``targetNode`` réel, ses suites vivent dans les champs
``test*Node`` : un lot qui ne regarde que ``targetNode`` les réécrit et les repaie.
Vrai service de génération, client LLM factice : on compte les appels facturables.
"""
from __future__ import annotations

from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueGenerationResponse,
    UnityDialogueNodeContent,
)
from services.graph_generation_service import GraphGenerationService
from services.unity_dialogue_generation_service import UnityDialogueGenerationService

OUTCOME_FIELDS = (
    "testCriticalFailureNode",
    "testFailureNode",
    "testSuccessNode",
    "testCriticalSuccessNode",
)


@pytest.fixture
def llm_client() -> MagicMock:
    """Client LLM factice."""
    client = MagicMock()
    client.generate_variants = AsyncMock(
        return_value=[
            UnityDialogueGenerationResponse(
                title="Suite",
                node=UnityDialogueNodeContent(speaker="PNJ", line="« Soit. »"),
            )
        ]
    )
    return client


def _parent(*choices: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": "P", "speaker": "PNJ", "line": "Alors ?", "choices": list(choices)}


def _tested(**outcomes: Optional[str]) -> Dict[str, Any]:
    return {"text": "Tenter", "test": "Force:10", **outcomes}


async def _run(parent: Dict[str, Any], llm_client: MagicMock) -> Dict[str, Any]:
    service = GraphGenerationService(UnityDialogueGenerationService())
    return await service.generate_nodes_for_all_choices(
        parent_node=parent,
        instructions="Continue",
        context={},
        llm_client=llm_client,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("target", [None, "END"], ids=["sans-targetNode", "targetNode-END"])
async def test_fully_written_test_choice_is_not_regenerated(
    target: Optional[str], llm_client: MagicMock
) -> None:
    """Les 4 issues écrites : aucun appel, le choix compte comme connecté."""
    choice = _tested(**{name: f"NODE_{name}" for name in OUTCOME_FIELDS})
    if target:
        choice["targetNode"] = target

    result = await _run(_parent(choice), llm_client)

    assert llm_client.generate_variants.await_count == 0
    assert result["nodes"] == []
    assert result["connections"] == []
    assert result["connected_choices_count"] == 1


@pytest.mark.asyncio
async def test_only_empty_test_outcomes_are_generated(llm_client: MagicMock) -> None:
    """2 issues écrites, 2 vides (absente et END) : 2 appels, 2 liens, rien d'écrasé."""
    choice = _tested(
        testCriticalFailureNode="NODE_CF",
        testFailureNode="END",
        testSuccessNode="NODE_S",
    )

    result = await _run(_parent(choice), llm_client)

    assert llm_client.generate_variants.await_count == 2
    assert len(result["nodes"]) == 2
    assert sorted(c["connection_type"] for c in result["connections"]) == [
        "test-critical-success",
        "test-failure",
    ]
    assert {c["to"] for c in result["connections"]} == {n["id"] for n in result["nodes"]}
    assert {c["from"] for c in result["connections"]} == {"test-node-P-choice-0"}


@pytest.mark.asyncio
async def test_batch_pays_one_call_per_open_slot(llm_client: MagicMock) -> None:
    """Test rempli + test vide + choix simple : 5 appels, un par emplacement."""
    filled = _tested(**{name: f"NODE_{name}" for name in OUTCOME_FIELDS})

    result = await _run(_parent(filled, _tested(), {"text": "Partir"}), llm_client)

    assert llm_client.generate_variants.await_count == 5
    assert len(result["nodes"]) == 5
    assert result["connected_choices_count"] == 1
    assert not any(c["from"] == "test-node-P-choice-0" for c in result["connections"])

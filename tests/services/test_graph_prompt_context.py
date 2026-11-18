"""Le prompt de génération du graphe porte le contexte GDD et les catalogues, dans chaque mode.

Défaut corrigé (2026-11-18) : ``generate-node`` calculait le contexte enrichi puis ne le
transmettait à aucun appel LLM. Ces tests vont jusqu'au prompt réellement passé au client
LLM, avec un vrai ``ContextBuilder`` sur un GDD factice et un vrai ``PromptEngine``.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock

import pytest

from core.context.context_builder import ContextBuilder
from core.prompt.prompt_engine import PromptEngine
from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueGenerationResponse,
    UnityDialogueNodeContent,
)
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.graph_prompt_context import GraphPromptContextFactory
from services.prompt_builder import PromptBuilder
from services.skill_catalog_service import SkillCatalogService
from services.skill_check_catalog import CORE_ATTRIBUTE_ENTRIES
from services.trait_catalog_service import TraitCatalogService
from services.unity_dialogue_generation_service import UnityDialogueGenerationService

NPC = "Témoin Gris"
PLAYER = "Voyageuse Test"
NPC_SHEET_MARKER = "Archiviste sourd qui compte les marches"
TEST_VALUE = "Sociabilité+Rhétorique:8"
ATTRIBUTE_IDS = [entry_id for entry_id, _ in CORE_ATTRIBUTE_ENTRIES]

CONTEXT_SELECTIONS: Dict[str, Any] = {
    "characters_full": [NPC],
    "characters_excerpt": [PLAYER],
    "scene_protagonists": {"personnage_a": PLAYER, "personnage_b": NPC},
}

PARENT_WITH_TEST: Dict[str, Any] = {
    "id": "P",
    "speaker": NPC,
    "line": "Que veux-tu savoir ?",
    "choices": [
        {"text": "Convaincre l'archiviste.", "test": TEST_VALUE},
        {"text": "Partir."},
    ],
}


@pytest.fixture
def prompt_context_factory(tmp_path: Path) -> GraphPromptContextFactory:
    """Fabrique branchée sur un GDD factice (deux fiches), vrais catalogues du dépôt."""
    categories = tmp_path / "categories"
    categories.mkdir()
    import_dir = tmp_path / "import"
    import_dir.mkdir()
    characters = [
        {"Nom": NPC, "Introduction": NPC_SHEET_MARKER, "Espèce": "Humain"},
        {"Nom": PLAYER, "Introduction": "Voyageuse sans mémoire."},
    ]
    (categories / "personnages.json").write_text(
        json.dumps({"personnages": characters}, ensure_ascii=False), encoding="utf-8"
    )
    (import_dir / "Vision.json").write_text("{}", encoding="utf-8")
    context_builder = ContextBuilder(gdd_categories_path=categories, gdd_import_path=import_dir)
    context_builder.load_gdd_files()
    prompt_engine = PromptEngine(
        context_builder=context_builder,
        prompt_builder=PromptBuilder(context_builder=context_builder),
    )
    return GraphPromptContextFactory(
        context_builder, prompt_engine, SkillCatalogService(), TraitCatalogService()
    )


@pytest.fixture
def llm_client() -> MagicMock:
    """Client LLM qui enregistre les prompts et répond par un nœud terminal."""
    client = MagicMock()
    client.generate_variants = AsyncMock(
        return_value=[
            UnityDialogueGenerationResponse(
                title="Suite",
                node=UnityDialogueNodeContent(speaker=NPC, line="« Soit. »"),
            )
        ]
    )
    return client


def _sent_prompts(llm_client: MagicMock) -> List[str]:
    """Prompts effectivement passés au client LLM."""
    return [call.kwargs["prompt"] for call in llm_client.generate_variants.call_args_list]


MODES: Dict[str, Dict[str, Any]] = {
    "normal": {
        "parent_node_id": "P",
        "parent_node_content": {"speaker": NPC, "line": "Que veux-tu savoir ?"},
    },
    "choice": {
        "parent_node_id": "P",
        "parent_node_content": PARENT_WITH_TEST,
        "target_choice_index": 1,
    },
    "choice-with-test": {
        "parent_node_id": "P",
        "parent_node_content": PARENT_WITH_TEST,
        "target_choice_index": 0,
    },
    "test-node": {
        "parent_node_id": "test-node-P-choice-0",
        "parent_node_content": {"type": "testNode", "test": TEST_VALUE, "line": ""},
        "dialogue_nodes": [PARENT_WITH_TEST],
    },
    "batch": {
        "parent_node_id": "P",
        "parent_node_content": PARENT_WITH_TEST,
        "generate_all_choices": True,
    },
}


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", list(MODES))
async def test_each_mode_sends_npc_sheet_and_eight_attributes(
    mode: str,
    prompt_context_factory: GraphPromptContextFactory,
    llm_client: MagicMock,
) -> None:
    """Chaque appel LLM de chaque mode contient la fiche du PNJ et les 8 caractéristiques."""
    orchestrator = GraphNodeOrchestrator(
        generation_service=UnityDialogueGenerationService(),
        prompt_context_factory=prompt_context_factory,
    )

    await orchestrator.generate(
        llm_client=llm_client,
        user_instructions="Continue la scène.",
        context_selections=CONTEXT_SELECTIONS,
        player_character_id=PLAYER,
        npc_speaker_id=NPC,
        **MODES[mode],
    )

    prompts = _sent_prompts(llm_client)
    assert prompts, f"aucun appel LLM en mode {mode}"
    for prompt in prompts:
        assert NPC_SHEET_MARKER in prompt
        assert "<available_attributes>" in prompt
        for attribute_id in ATTRIBUTE_IDS:
            assert attribute_id in prompt, f"{attribute_id} absent du prompt ({mode})"
        assert "<available_skills>" in prompt


@pytest.mark.asyncio
async def test_without_factory_prompt_is_history_only(llm_client: MagicMock) -> None:
    """Sans fabrique (tests unitaires historiques), le prompt reste l'historique seul."""
    orchestrator = GraphNodeOrchestrator(generation_service=UnityDialogueGenerationService())

    await orchestrator.generate(
        llm_client=llm_client,
        user_instructions="Continue la scène.",
        context_selections=CONTEXT_SELECTIONS,
        **MODES["normal"],
    )

    prompt = _sent_prompts(llm_client)[0]
    assert "<available_attributes>" not in prompt
    assert "Instructions pour la suite" in prompt


@pytest.mark.asyncio
async def test_npc_falls_back_to_scene_protagonist(
    prompt_context_factory: GraphPromptContextFactory,
    llm_client: MagicMock,
) -> None:
    """Sans ``npc_speaker_id`` (lot, régénération), le PNJ vient du protagoniste B."""
    orchestrator = GraphNodeOrchestrator(
        generation_service=UnityDialogueGenerationService(),
        prompt_context_factory=prompt_context_factory,
    )

    await orchestrator.generate(
        llm_client=llm_client,
        user_instructions="Continue la scène.",
        context_selections=CONTEXT_SELECTIONS,
        player_character_id=PLAYER,
        **MODES["normal"],
    )

    prompt = _sent_prompts(llm_client)[0]
    assert f"Speaker (répliques `line`) : {NPC}" in prompt


@pytest.mark.asyncio
async def test_test_node_prompt_carries_history_and_tested_choice(llm_client: MagicMock) -> None:
    """Depuis un TestNode : historique jusqu'au nœud du choix, et texte du choix testé."""
    grandparent = {
        "id": "G",
        "speaker": NPC,
        "line": "Entrez, l'escalier change chaque nuit.",
        "choices": [{"text": "Qui êtes-vous ?", "targetNode": "P"}],
    }
    orchestrator = GraphNodeOrchestrator(generation_service=UnityDialogueGenerationService())

    await orchestrator.generate(
        llm_client=llm_client,
        parent_node_id="test-node-P-choice-0",
        parent_node_content={"type": "testNode", "test": TEST_VALUE, "line": ""},
        user_instructions="Continue la scène.",
        dialogue_nodes=[grandparent, PARENT_WITH_TEST],
        player_character_id=PLAYER,
    )

    prompts = _sent_prompts(llm_client)
    assert len(prompts) == 4
    for prompt in prompts:
        assert "Entrez, l'escalier change chaque nuit." in prompt
        assert f"{PLAYER}: Qui êtes-vous ?" in prompt
        assert "Réponse du joueur (choix testé):\nConvaincre l'archiviste." in prompt


@pytest.mark.asyncio
async def test_off_catalog_tests_are_reported_as_warnings() -> None:
    """Un test au catalogue passe ; une caractéristique ou compétence inconnue avertit."""
    client = MagicMock()
    client.generate_variants = AsyncMock(
        return_value=[
            UnityDialogueGenerationResponse.model_validate(
                {
                    "title": "Suite",
                    "node": {
                        "speaker": NPC,
                        "line": "« Prouvez-le. »",
                        "choices": [
                            {"text": "Argumenter.", "test": TEST_VALUE},
                            {"text": "Enquêter.", "test": "Raison+Investigation:10"},
                        ],
                    },
                }
            )
        ]
    )
    orchestrator = GraphNodeOrchestrator(generation_service=UnityDialogueGenerationService())

    result = await orchestrator.generate(
        llm_client=client,
        user_instructions="Continue la scène.",
        **MODES["normal"],
    )

    assert len(result.warnings) == 2
    assert "« Raison »" in result.warnings[0]
    assert "« Investigation »" in result.warnings[1]
    assert all("Sociabilité" not in warning for warning in result.warnings)

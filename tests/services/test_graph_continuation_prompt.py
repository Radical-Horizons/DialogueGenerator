"""Prolonger un dialogue existant depuis le graphe : ce que le prompt doit porter.

Régressions du 2026-11-19 (dialogue Voknir importé, prolongé depuis le graphe) :
- un beat « pivot » imposait un retournement à chaque nœud au-delà de la profondeur 3 ;
- le modèle ne voyait que sa branche et contredisait les branches sœurs ;
- le graphe envoyait le gabarit générique de ``llm_config.json`` comme system prompt.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.dialogue_dramatic_progression import compose_generation_instructions
from services.dialogue_path_context import (
    DIALOGUE_REFERENCE_HEADER,
    ancestor_path_node_ids,
    format_dialogue_reference,
)
from services.graph_node_orchestrator import GraphNodeOrchestrator

VOKNIR = "Voknir Esh'Maradel"

NODES: List[Dict[str, Any]] = [
    {
        "id": "START",
        "speaker": VOKNIR,
        "line": "*Voknir se grave la peau.*",
        "choices": [
            {"text": "« Salutation, cartographe. »", "targetNode": "node-accueil"},
            {"text": "*[Vous attendez.]*", "targetNode": "node-attente"},
        ],
    },
    {
        "id": "node-accueil",
        "speaker": VOKNIR,
        "line": "« Oh Théomaque ! »",
        "choices": [{"text": "« Votre bureau bouge ? »", "targetNode": "node-leaf"}],
    },
    {"id": "node-leaf", "speaker": VOKNIR, "line": "« C'est l'atelier qui le déplace. »"},
    {
        "id": "node-attente",
        "speaker": VOKNIR,
        "line": "« Je suis incapable de vous guider, les cartes divergent. »",
        "choices": [{"text": "« Alors termine. »", "targetNode": "END"}],
    },
]


class TestInteractiveProgression:
    """Un nœud demandé dans le graphe n'hérite pas d'un beat par profondeur."""

    def test_interactive_deep_node_has_no_forced_twist(self) -> None:
        out = compose_generation_instructions("Suite", depth=7, interactive=True)
        assert "retournement (aveu" not in out
        assert "Progression : fais avancer la scène d'un pas" in out

    def test_planned_tree_keeps_its_beat(self) -> None:
        out = compose_generation_instructions("Suite", depth=4, max_depth=4)
        assert "Beat dramatique (pivot)" in out

    def test_interactive_leaf_still_closes(self) -> None:
        out = compose_generation_instructions("Fin", depth=3, interactive=True, is_leaf=True)
        assert "clôture" in out.lower()

    def test_existing_dialogue_is_the_style_reference(self) -> None:
        out = compose_generation_instructions("Suite", depth=2, interactive=True)
        assert "Le dialogue déjà écrit fait foi" in out
        assert "*[Vous …]*" in out


class TestDialogueReference:
    """Le reste du dialogue (hors chemin courant) est cité pour la cohérence."""

    def test_path_ids_follow_parents_to_start(self) -> None:
        assert ancestor_path_node_ids(NODES, "node-leaf") == {"START", "node-accueil", "node-leaf"}

    def test_reference_lists_sibling_branches_only(self) -> None:
        block = format_dialogue_reference(NODES, {"START", "node-accueil", "node-leaf"}, "Uresaïr")
        assert block.startswith(DIALOGUE_REFERENCE_HEADER)
        assert "incapable de vous guider" in block
        assert "Uresaïr: « Alors termine. »" in block
        assert "C'est l'atelier qui le déplace" not in block

    def test_reference_is_empty_when_everything_is_on_the_path(self) -> None:
        assert format_dialogue_reference(NODES[:3], {"START", "node-accueil", "node-leaf"}) == ""

    def test_reference_respects_its_budget(self) -> None:
        """Au-delà du plafond, les nœuds sont comptés, pas cités."""
        block = format_dialogue_reference(NODES, {"node-leaf"}, max_chars=120)
        assert "se grave la peau" in block
        assert "incapable de vous guider" not in block
        assert "non cités, faute de place" in block


class _FakeFactory:
    """Fabrique de contexte réduite : un rendu transparent et un system prompt maison."""

    def default_system_prompt(self) -> str:
        return "SYSTEM MAISON"

    def build(self, *_args: Any, **_kwargs: Any) -> Any:
        context = MagicMock()
        context.render = lambda body, _max_choices: f"<prompt>{body}</prompt>"
        return context


@pytest.mark.asyncio
async def test_orchestrator_sends_reference_and_house_system_prompt() -> None:
    """Le prompt d'une suite cite les branches sœurs ; le system prompt est celui de « Générer »."""
    service = MagicMock()
    generated = {"id": "NEW", "speaker": VOKNIR, "line": "« … »", "choices": []}
    service.generate_dialogue_node = AsyncMock(return_value={"nodes": [generated]})
    service.enrich_with_ids = MagicMock(return_value=[generated])
    orchestrator = GraphNodeOrchestrator(
        generation_service=service,
        prompt_context_factory=_FakeFactory(),  # type: ignore[arg-type]
    )

    await orchestrator.generate(
        llm_client=MagicMock(),
        parent_node_id="node-leaf",
        parent_node_content={"speaker": VOKNIR, "line": "« C'est l'atelier qui le déplace. »"},
        user_instructions="Suite",
        context_selections={"characters_full": [VOKNIR]},
        dialogue_nodes=NODES,
        player_character_id="Uresaïr",
        npc_speaker_id=VOKNIR,
    )

    kwargs = service.generate_dialogue_node.call_args.kwargs
    prompt: str = kwargs["prompt"]
    system: Optional[str] = kwargs["system_prompt_override"]
    assert system == "SYSTEM MAISON"
    assert prompt.index(DIALOGUE_REFERENCE_HEADER) < prompt.index("Historique du dialogue")
    assert "incapable de vous guider" in prompt
    assert "retournement (aveu" not in prompt

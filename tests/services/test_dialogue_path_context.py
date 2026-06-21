"""Tests pour la reconstruction du chemin ancêtre dans les prompts."""
from __future__ import annotations

from services.dialogue_path_context import (
    build_ancestor_path_steps,
    build_enriched_generation_prompt,
    format_generation_prompt,
)


def _sample_tree_nodes() -> list[dict]:
    return [
        {
            "id": "START",
            "speaker": "Uresair",
            "line": "Bonjour, voyageur.",
            "choices": [
                {"text": "Salut.", "targetNode": "N1"},
                {"text": "Qui es-tu ?", "targetNode": "N2"},
            ],
        },
        {
            "id": "N1",
            "speaker": "Uresair",
            "line": "Content de te voir.",
            "choices": [{"text": "Et Mérid ?", "targetNode": "N3"}],
        },
        {
            "id": "N2",
            "speaker": "Uresair",
            "line": "Je suis Uresaïr.",
            "choices": [],
        },
        {
            "id": "N3",
            "speaker": "Uresair",
            "line": "Mérid est loin.",
            "choices": [],
        },
    ]


class TestBuildAncestorPathSteps:
    """Chemin START → parent."""

    def test_start_only(self) -> None:
        nodes = _sample_tree_nodes()
        steps = build_ancestor_path_steps(nodes, "START")
        assert len(steps) == 1
        assert steps[0].speaker == "Uresair"
        assert steps[0].line == "Bonjour, voyageur."
        assert steps[0].player_choice_after is None

    def test_depth_two_includes_choices(self) -> None:
        nodes = _sample_tree_nodes()
        steps = build_ancestor_path_steps(nodes, "N1")
        assert len(steps) == 2
        assert steps[0].line == "Bonjour, voyageur."
        assert steps[0].player_choice_after == "Salut."
        assert steps[1].line == "Content de te voir."

    def test_depth_three_full_chain(self) -> None:
        nodes = _sample_tree_nodes()
        steps = build_ancestor_path_steps(nodes, "N3")
        assert len(steps) == 3
        assert steps[0].player_choice_after == "Salut."
        assert steps[1].player_choice_after == "Et Mérid ?"
        assert steps[2].line == "Mérid est loin."


class TestFormatGenerationPrompt:
    """Formatage du prompt avec historique."""

    def test_includes_history_header_and_choice(self) -> None:
        nodes = _sample_tree_nodes()
        steps = build_ancestor_path_steps(nodes, "N1")
        prompt = format_generation_prompt(steps, "Continue", "Salut.")
        assert "Historique du dialogue" in prompt
        assert "Bonjour, voyageur." in prompt
        assert "PJ: Salut." in prompt
        assert "choix à développer" in prompt
        assert "Continue" in prompt

    def test_build_enriched_uses_full_path_when_nodes_provided(self) -> None:
        nodes = _sample_tree_nodes()
        prompt = build_enriched_generation_prompt(
            nodes=nodes,
            parent_node_id="N3",
            parent_speaker="Uresair",
            parent_line="Mérid est loin.",
            user_instructions="Suite",
            choice_text="Et Mérid ?",
        )
        assert "Historique du dialogue" in prompt
        assert "Bonjour, voyageur." in prompt
        assert "Et Mérid ?" in prompt

    def test_fallback_without_nodes(self) -> None:
        prompt = build_enriched_generation_prompt(
            nodes=None,
            parent_node_id="N1",
            parent_speaker="PNJ",
            parent_line="Hello",
            user_instructions="Suite",
            choice_text="Hi",
        )
        assert "Contexte précédent:" in prompt
        assert "Historique du dialogue" not in prompt

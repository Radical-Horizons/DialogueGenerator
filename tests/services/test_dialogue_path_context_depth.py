"""Tests infer_child_generation_depth."""
from __future__ import annotations

from services.dialogue_path_context import DialoguePathStep, infer_child_generation_depth


class TestInferChildGenerationDepth:
    """Profondeur inférée depuis le chemin ancêtre."""

    def test_empty_path_defaults_to_one(self) -> None:
        assert infer_child_generation_depth(None) == 1
        assert infer_child_generation_depth([]) == 1

    def test_start_only_is_one(self) -> None:
        steps = [DialoguePathStep(speaker="PNJ", line="Bonjour")]
        assert infer_child_generation_depth(steps) == 1

    def test_one_choice_in_path_is_two(self) -> None:
        steps = [
            DialoguePathStep(speaker="PNJ", line="Bonjour", player_choice_after="Salut"),
            DialoguePathStep(speaker="PNJ", line="Suite"),
        ]
        assert infer_child_generation_depth(steps) == 2

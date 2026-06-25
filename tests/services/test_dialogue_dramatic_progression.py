"""Tests pour la progression dramatique et le format dialogue/didascalie."""
from __future__ import annotations

from services.dialogue_dramatic_progression import (
    DIALOGUE_ORALITY_PROMPT_LINES,
    DEFAULT_NODE_SCENE_INSTRUCTIONS,
    beat_instruction_for,
    compose_generation_instructions,
)


class TestBeatInstructionFor:
    """Phases de beat selon profondeur."""

    def test_start_is_accroche(self) -> None:
        text = beat_instruction_for(depth=0, max_depth=4, is_start=True)
        assert "accroche" in text.lower()

    def test_first_meeting_start_uses_dedicated_beat(self) -> None:
        text = beat_instruction_for(
            depth=0,
            max_depth=4,
            is_start=True,
            scene_type="first_meeting",
        )
        assert "première rencontre" in text.lower()
        assert "ne pas inventer" in text.lower()

    def test_leaf_is_cloture(self) -> None:
        text = beat_instruction_for(depth=4, max_depth=4, is_leaf=True)
        assert "clôture" in text.lower()

    def test_complication_allows_didascalie(self) -> None:
        text = beat_instruction_for(depth=1, max_depth=4)
        assert "didascalie" in text.lower() or "dialogue" in text.lower()


class TestComposeGenerationInstructions:
    """Assemblage consignes + beat + contraintes."""

    def test_includes_format_constraints(self) -> None:
        out = compose_generation_instructions("Scène test", depth=1, max_depth=4)
        assert "italique" in out
        assert "guillemets" in out

    def test_preserves_user_scene(self) -> None:
        out = compose_generation_instructions(
            "Uresaïr confronte Voknir sur la carte.",
            depth=2,
            max_depth=4,
        )
        assert "Uresaïr confronte Voknir" in out
        assert "Beat dramatique" in out

    def test_empty_base_uses_default_scene_instruction(self) -> None:
        out = compose_generation_instructions("", depth=0, is_start=True)
        assert "guillemets" in out

    def test_allows_choice_tests_with_parsimony(self) -> None:
        """Régression : le prompt ne doit pas interdire totalement `choices.test`."""
        out = compose_generation_instructions("Scène test", depth=1, max_depth=4)
        assert "`choices.test` autorisé" in out
        assert "éviter d'en mettre partout" in out
        assert "Ne pas ajouter d'attribut test" not in out

    def test_orality_prompt_lines_for_xml(self) -> None:
        joined = "\n".join(DIALOGUE_ORALITY_PROMPT_LINES)
        assert "italique" in joined
        assert "guillemets" in joined

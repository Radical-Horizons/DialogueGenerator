"""Tests des skill checks FR94 (Story 9.6 Task 2)."""

import pytest

from services.game_systems_skill_checks import (
    SkillCheckDefinition,
    SkillCheckPreviewState,
    evaluate_skill_check,
)


@pytest.mark.parametrize(
    "attribute,skill,expected_issue,expected_target",
    [
        (9, 3, "succès_critique", "CRIT_SUCCESS"),
        (4, 3, "succès", "SUCCESS"),
        (3, 3, "échec", "FAILURE"),
        (0, 1, "échec_critique", "CRIT_FAILURE"),
    ],
)
def test_skill_check_maps_score_to_issue_and_branch(
    attribute: int,
    skill: int,
    expected_issue: str,
    expected_target: str,
) -> None:
    """Calcule les quatre issues autour du DD et retourne la branche correspondante."""
    check = SkillCheckDefinition(
        attribute_id="sociabilite",
        skill_id="tromperie",
        dc=7,
        branches={
            "succès_critique": "CRIT_SUCCESS",
            "succès": "SUCCESS",
            "échec": "FAILURE",
            "échec_critique": "CRIT_FAILURE",
        },
    )
    state = SkillCheckPreviewState(
        attributes={"sociabilite": attribute},
        skills={"tromperie": skill},
    )

    result = evaluate_skill_check(check, state)

    assert result.visible is True
    assert result.score == attribute + skill
    assert result.issue == expected_issue
    assert result.target_node == expected_target

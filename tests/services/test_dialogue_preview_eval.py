"""Tests évaluation visibilité preview (Story 9.4)."""

import pytest

from api.schemas.visibility_conditions import VisibilityConditionsBlock
from services.dialogue_preview_eval import evaluate_visibility_conditions_block


def test_flag_bool_unsatisfied_when_missing() -> None:
    block = VisibilityConditionsBlock.model_validate(
        {
            "combinator": "AND",
            "items": [{"kind": "flag_bool", "flagId": "F", "equals": True}],
        }
    )
    assert evaluate_visibility_conditions_block(block, {}, {}) is False


def test_flag_bool_satisfied() -> None:
    block = VisibilityConditionsBlock.model_validate(
        {
            "combinator": "AND",
            "items": [{"kind": "flag_bool", "flagId": "F", "equals": True}],
        }
    )
    assert evaluate_visibility_conditions_block(block, {"F": True}, {}) is True


@pytest.mark.parametrize(
    "combinator,f0,f1,expected",
    [
        ("AND", True, True, True),
        ("AND", True, False, False),
        ("OR", False, True, True),
    ],
)
def test_and_or(combinator: str, f0: bool, f1: bool, expected: bool) -> None:
    block = VisibilityConditionsBlock.model_validate(
        {
            "combinator": combinator,
            "items": [
                {"kind": "flag_bool", "flagId": "F0", "equals": True},
                {"kind": "flag_bool", "flagId": "F1", "equals": True},
            ],
        }
    )
    assert evaluate_visibility_conditions_block(block, {"F0": f0, "F1": f1}, {}) is expected

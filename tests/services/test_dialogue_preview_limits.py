"""Tests limites preview / validation inline (durcissement PR #43)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from api.schemas.dialogue_preview import DialoguePreviewRequest
from api.schemas.documents import ValidateFlagReferencesRequest
from api.schemas.game_systems import PreviewGameSystemsState
from services.dialogue_preview_eval import parse_visibility_block
from services.dialogue_preview_limits import (
    MAX_PREVIEW_FLAG_STATES,
    MAX_VALIDATE_FLAG_REFERENCES_INLINE_NODES,
)


def test_dialogue_preview_request_rejects_oversized_flag_states() -> None:
    with pytest.raises(ValidationError):
        DialoguePreviewRequest.model_validate(
            {"flag_states": {f"F{i}": False for i in range(MAX_PREVIEW_FLAG_STATES + 1)}}
        )


def test_validate_flag_references_request_rejects_oversized_inline_document() -> None:
    with pytest.raises(ValidationError):
        ValidateFlagReferencesRequest.model_validate(
            {
                "document": {
                    "nodes": [{"id": f"N{i}", "line": "x"} for i in range(
                        MAX_VALIDATE_FLAG_REFERENCES_INLINE_NODES + 1
                    )],
                }
            }
        )


def test_preview_game_systems_state_rejects_oversized_attributes() -> None:
    with pytest.raises(ValidationError):
        PreviewGameSystemsState.model_validate(
            {"attributes": {f"A{i}": 1.0 for i in range(65)}}
        )


def test_parse_visibility_block_returns_warning_for_invalid_block() -> None:
    result = parse_visibility_block(
        {"combinator": "AND", "items": [{"kind": "flag_bool", "flagId": "F"}]},
        path="nodes[N1].visibilityConditions",
    )
    assert result.block is None
    assert result.warning is not None
    assert "nodes[N1].visibilityConditions" in result.warning

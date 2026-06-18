"""Tests du calcul breakdown tokens contexte (FR20)."""
from unittest.mock import MagicMock

import pytest

from api.schemas.dialogue import ContextSelection
from constants import Defaults
from services.context_token_budget import compute_context_selection_token_metrics


@pytest.fixture
def mock_builder() -> MagicMock:
    b = MagicMock()
    b.build_context_json.return_value = {"mock": True}
    b.serialize_context_to_text.return_value = "context-text"
    b._count_tokens.return_value = 42
    return b


def test_compute_selection_tokens_full(mock_builder: MagicMock) -> None:
    """Sélection avec personnage → selection_tokens et au moins une ligne breakdown."""
    sel = ContextSelection(
        characters_full=["Alice"],
        characters_excerpt=[],
        locations_full=[],
        locations_excerpt=[],
        items_full=[],
        items_excerpt=[],
        species_full=[],
        species_excerpt=[],
        communities_full=[],
        communities_excerpt=[],
        dialogues_examples=[],
    )
    metrics = compute_context_selection_token_metrics(
        mock_builder,
        full_selection=sel,
        user_instructions=" ",
        field_configs=None,
        organization_mode="narrative",
        measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
    )
    assert metrics.selection_tokens == 42
    assert len(metrics.breakdown) == 1
    assert metrics.breakdown[0].entity_type == "characters"
    assert metrics.breakdown[0].mode == "full"
    assert "somme" in metrics.breakdown_note.lower() or "en-têtes" in metrics.breakdown_note.lower()


def test_compute_selection_empty(mock_builder: MagicMock) -> None:
    """Sélection vide → breakdown vide."""
    sel = ContextSelection()
    metrics = compute_context_selection_token_metrics(
        mock_builder,
        full_selection=sel,
        user_instructions=" ",
        field_configs=None,
        organization_mode="narrative",
        measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
    )
    assert metrics.selection_tokens == 42
    assert metrics.breakdown == []


def test_compute_selection_tokens_can_skip_breakdown(mock_builder: MagicMock) -> None:
    """Mesure rapide → un seul build, sans lignes de breakdown."""
    sel = ContextSelection(characters_full=["Alice"], locations_full=["Forest"])

    metrics = compute_context_selection_token_metrics(
        mock_builder,
        full_selection=sel,
        user_instructions=" ",
        field_configs=None,
        organization_mode="narrative",
        measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        include_breakdown=False,
    )

    assert metrics.selection_tokens == 42
    assert metrics.breakdown == []
    assert mock_builder.build_context_json.call_count == 1

"""Tests du calcul breakdown tokens contexte (FR20)."""
from unittest.mock import MagicMock

import pytest

from api.schemas.dialogue import ContextSelection
from constants import Defaults
from models.prompt_structure import PromptMetadata, PromptStructure
from services.context_token_budget import (
    clear_context_metrics_cache,
    compute_context_selection_token_metrics,
)


@pytest.fixture(autouse=True)
def _clear_metrics_cache() -> None:
    """Isole chaque test du cache LRU module-level (mémoïsation par révision GDD)."""
    clear_context_metrics_cache()
    yield
    clear_context_metrics_cache()


@pytest.fixture
def mock_builder() -> MagicMock:
    b = MagicMock()
    b.gdd_revision = 1
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
    assert metrics.context_tokens == 42
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
    assert metrics.context_tokens == 42
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
    assert metrics.context_tokens == 42
    assert metrics.breakdown == []
    assert mock_builder.build_context_json.call_count == 1


def test_metrics_cache_hit_avoids_rebuild(mock_builder: MagicMock) -> None:
    """Deux appels identiques → un seul build (2e résolu par le cache)."""
    sel = ContextSelection(characters_full=["Alice"])
    kwargs = dict(
        full_selection=sel,
        user_instructions=" ",
        field_configs=None,
        organization_mode="narrative",
        measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
    )
    first = compute_context_selection_token_metrics(mock_builder, **kwargs)
    second = compute_context_selection_token_metrics(mock_builder, **kwargs)
    assert first is second
    assert mock_builder.build_context_json.call_count == 1


def test_metrics_cache_invalidated_on_revision_change(mock_builder: MagicMock) -> None:
    """Un changement de révision GDD force un nouveau build (cache invalidé)."""
    sel = ContextSelection(characters_full=["Alice"])
    kwargs = dict(
        full_selection=sel,
        user_instructions=" ",
        field_configs=None,
        organization_mode="narrative",
        measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
    )
    compute_context_selection_token_metrics(mock_builder, **kwargs)
    mock_builder.gdd_revision = 2
    compute_context_selection_token_metrics(mock_builder, **kwargs)
    assert mock_builder.build_context_json.call_count == 2


def test_metrics_reuses_prebuilt_structure(mock_builder: MagicMock) -> None:
    """prebuilt_structure fourni → aucun build_context_json (chemin /dialogues)."""
    sel = ContextSelection(characters_full=["Alice"])
    prebuilt = PromptStructure(
        sections=[],
        metadata=PromptMetadata(
            totalTokens=50,
            generatedAt="2026-01-01T00:00:00",
            organizationMode="narrative",
        ),
    )
    metrics = compute_context_selection_token_metrics(
        mock_builder,
        full_selection=sel,
        user_instructions=" ",
        field_configs=None,
        organization_mode="narrative",
        measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        prebuilt_structure=prebuilt,
    )
    assert metrics.selection_tokens == 50
    assert metrics.serialized_text == "context-text"
    assert mock_builder.build_context_json.call_count == 0


def test_prebuilt_with_total_tokens_skips_second_reconcile(mock_builder: MagicMock) -> None:
    """Structure déjà réconciliée → pas de second reconcile."""
    from unittest.mock import patch

    sel = ContextSelection(characters_full=["Alice"])
    prebuilt = PromptStructure(
        sections=[],
        metadata=PromptMetadata(
            totalTokens=99,
            generatedAt="2026-01-01T00:00:00",
            organizationMode="narrative",
        ),
    )
    with patch(
        "services.context_token_budget.reconcile_prompt_structure_token_counts"
    ) as mock_reconcile:
        metrics = compute_context_selection_token_metrics(
            mock_builder,
            full_selection=sel,
            user_instructions=" ",
            field_configs=None,
            organization_mode="narrative",
            measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
            prebuilt_structure=prebuilt,
        )
    mock_reconcile.assert_not_called()
    assert metrics.selection_tokens == 99

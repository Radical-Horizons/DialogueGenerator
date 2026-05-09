"""Tests Effort FR94 (Story 9.6 Task 3)."""

from services.game_systems_effort import (
    EffortPreviewState,
    evaluate_effort_cost,
)


def test_default_effort_pool_allows_cost_two() -> None:
    """Le pool preview par défaut vaut 10 PE et autorise un choix coûtant 2 PE."""
    result = evaluate_effort_cost(2, EffortPreviewState())

    assert result.available_pool == 10
    assert result.cost == 2
    assert result.accessible is True
    assert result.disabled_reason is None


def test_effort_cost_above_pool_is_disabled_with_reason() -> None:
    """Un coût supérieur au pool simulé grise le choix avec explication."""
    result = evaluate_effort_cost(12, EffortPreviewState(available_pool=10))

    assert result.accessible is False
    assert result.disabled_reason == "Effort insuffisant : 10 PE disponibles, coût 12 PE."


def test_effort_access_updates_when_preview_pool_changes() -> None:
    """Modifier le pool simulé met à jour l'accessibilité immédiatement."""
    assert evaluate_effort_cost(2, EffortPreviewState(available_pool=3)).accessible is True
    assert evaluate_effort_cost(2, EffortPreviewState(available_pool=1)).accessible is False

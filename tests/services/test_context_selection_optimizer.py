"""Tests du moteur d'optimisation de sélection contexte (FR21)."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from api.schemas.dialogue import ContextOptimizationRules, ContextSelection
from services.context_selection_optimizer import (
    compute_pre_generation_fidelity_proxy_percent,
    optimize_context_selection,
)
from services.context_token_budget import ContextSelectionTokenMetrics


def _empty_selection() -> ContextSelection:
    return ContextSelection(
        characters_full=[],
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


def test_compute_proxy_roundtrip() -> None:
    assert compute_pre_generation_fidelity_proxy_percent(1000, 500) == 50
    assert compute_pre_generation_fidelity_proxy_percent(0, 0) == 100
    assert compute_pre_generation_fidelity_proxy_percent(10, 10) == 100


def test_optimize_no_op_when_under_budget() -> None:
    builder = MagicMock()
    sel = _empty_selection()
    sel.characters_full = ["A"]

    def fake_metrics(_b, *, full_selection, **kwargs):
        return ContextSelectionTokenMetrics(
            selection_tokens=100,
            context_tokens=100,
            breakdown=[],
            breakdown_note="test",
        )

    import services.context_selection_optimizer as mod

    monkey = pytest.MonkeyPatch()
    monkey.setattr(mod, "compute_context_selection_token_metrics", fake_metrics)
    try:
        rules = ContextOptimizationRules()
        out = optimize_context_selection(
            builder,
            initial_selection=sel,
            user_instructions="x",
            field_configs=None,
            organization_mode="narrative",
            budget_tokens=500,
            rules=rules,
        )
    finally:
        monkey.undo()

    assert out.no_op is True
    assert out.budget_respected is True
    assert out.selection_tokens_before == 100
    assert out.selection_tokens_after == 100
    assert out.tokens_saved == 0
    assert out.changes == []
    assert out.pre_generation_context_fidelity_proxy_percent == 100


def test_optimize_moves_full_to_excerpt_until_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    builder = MagicMock()
    sel = _empty_selection()
    sel.characters_full = ["A", "B"]
    sel.characters_excerpt = []

    def token_fn(s: ContextSelection) -> int:
        d = s.model_dump()
        return sum(len(d[f"{t}_full"]) * 1000 + len(d[f"{t}_excerpt"]) * 100 for t in (
            "characters", "locations", "items", "species", "communities"
        ))

    def fake_metrics(_b, *, full_selection, **kwargs):
        return ContextSelectionTokenMetrics(
            selection_tokens=token_fn(full_selection),
            context_tokens=token_fn(full_selection),
            breakdown=[],
            breakdown_note="test",
        )

    import services.context_selection_optimizer as mod

    monkeypatch.setattr(mod, "compute_context_selection_token_metrics", fake_metrics)
    rules = ContextOptimizationRules(strategy="conservative")
    out = optimize_context_selection(
        builder,
        initial_selection=sel,
        user_instructions="scene",
        field_configs=None,
        organization_mode="narrative",
        budget_tokens=1500,
        rules=rules,
    )

    assert out.no_op is False
    assert out.budget_respected is True
    assert out.selection_tokens_before == 2000
    assert out.selection_tokens_after <= 1500
    assert len(out.changes) >= 1
    assert out.changes[0].from_mode == "full"
    assert out.changes[0].to_mode == "excerpt"


def test_pinned_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    builder = MagicMock()
    sel = _empty_selection()
    sel.characters_full = ["A", "B"]

    def token_fn(s: ContextSelection) -> int:
        d = s.model_dump()
        return len(d["characters_full"]) * 1000 + len(d["characters_excerpt"]) * 100

    def fake_metrics(_b, *, full_selection, **kwargs):
        return ContextSelectionTokenMetrics(
            selection_tokens=token_fn(full_selection),
            context_tokens=token_fn(full_selection),
            breakdown=[],
            breakdown_note="test",
        )

    import services.context_selection_optimizer as mod

    monkeypatch.setattr(mod, "compute_context_selection_token_metrics", fake_metrics)
    rules = ContextOptimizationRules(
        pinned_entity_keys=["characters:A"],
        strategy="conservative",
    )
    out = optimize_context_selection(
        builder,
        initial_selection=sel,
        user_instructions="scene",
        field_configs=None,
        organization_mode="narrative",
        budget_tokens=500,
        rules=rules,
    )

    assert all(c.entity_name != "A" for c in out.changes)


def test_proxy_warning_below_threshold(monkeypatch: pytest.MonkeyPatch) -> None:
    builder = MagicMock()
    sel = _empty_selection()
    sel.characters_full = ["A", "B", "C"]

    def token_fn(s: ContextSelection) -> int:
        return len(s.characters_full) * 1000 + len(s.characters_excerpt) * 100

    def fake_metrics(_b, *, full_selection, **kwargs):
        return ContextSelectionTokenMetrics(
            selection_tokens=token_fn(full_selection),
            context_tokens=token_fn(full_selection),
            breakdown=[],
            breakdown_note="test",
        )

    import services.context_selection_optimizer as mod

    monkeypatch.setattr(mod, "compute_context_selection_token_metrics", fake_metrics)
    rules = ContextOptimizationRules(pre_generation_proxy_warning_threshold_percent=95)
    out = optimize_context_selection(
        builder,
        initial_selection=sel,
        user_instructions="scene",
        field_configs=None,
        organization_mode="narrative",
        budget_tokens=500,
        rules=rules,
    )

    assert any("Proxy pré-génération" in w for w in out.warnings)


def test_budget_respected_false_when_impossible(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tout est full et épinglé : impossible de descendre sous le budget."""
    builder = MagicMock()
    sel = _empty_selection()
    sel.characters_full = ["A", "B"]

    def token_fn(s: ContextSelection) -> int:
        return len(s.characters_full) * 1000 + len(s.characters_excerpt) * 100

    def fake_metrics(_b, *, full_selection, **kwargs):
        return ContextSelectionTokenMetrics(
            selection_tokens=token_fn(full_selection),
            context_tokens=token_fn(full_selection),
            breakdown=[],
            breakdown_note="test",
        )

    import services.context_selection_optimizer as mod

    monkeypatch.setattr(mod, "compute_context_selection_token_metrics", fake_metrics)
    rules = ContextOptimizationRules(
        pinned_entity_keys=["characters:A", "characters:B"],
        strategy="conservative",
    )
    out = optimize_context_selection(
        builder,
        initial_selection=sel,
        user_instructions="scene",
        field_configs=None,
        organization_mode="narrative",
        budget_tokens=500,
        rules=rules,
    )

    assert out.budget_respected is False
    assert out.selection_tokens_after > 500
    assert any("budget tokens" in w.lower() for w in out.warnings)

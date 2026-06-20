"""Tests intégration excerpt Uresaïr (GDD réel)."""
from __future__ import annotations

import pytest

from api.schemas.dialogue import ContextSelection
from core.context.context_builder import ContextBuilder
from services.context_token_budget import compute_context_selection_token_metrics
from constants import Defaults


@pytest.fixture(scope="module")
def context_builder() -> ContextBuilder:
    builder = ContextBuilder()
    builder.load_gdd_files()
    if not builder.characters:
        pytest.skip("GDD indisponible")
    return builder


def test_uresair_excerpt_produces_non_zero_tokens(context_builder: ContextBuilder) -> None:
    """Uresaïr en excerpt doit contribuer au contexte (régression 0 token)."""
    uresa = next(
        (n for n in context_builder.get_characters_names() if "uresa" in n.lower()),
        None,
    )
    if not uresa:
        pytest.skip("Uresaïr absente du GDD")

    selection = ContextSelection(characters_excerpt=[uresa])
    metrics = compute_context_selection_token_metrics(
        context_builder,
        full_selection=selection,
        user_instructions=" ",
        field_configs=None,
        organization_mode="narrative",
        measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
    )
    assert metrics.selection_tokens > 0

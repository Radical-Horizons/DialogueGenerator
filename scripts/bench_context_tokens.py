"""Benchmark rapide estimate tokens contexte."""
from __future__ import annotations

import time

from api.schemas.dialogue import ContextSelection
from constants import Defaults
from core.context.context_builder import ContextBuilder
from services.context_token_budget import compute_context_selection_token_metrics


def main() -> None:
    """Exécute 3 mesures consécutives."""
    builder = ContextBuilder()
    builder.load_gdd_files()
    names = builder.get_characters_names()
    char_a = next(n for n in names if "Uresa" in n)
    char_b = next(n for n in names if "Voknir" in n)
    locations = builder.get_locations_names()[:2] if hasattr(builder, "get_locations_names") else []
    selection = ContextSelection(characters_full=[char_a, char_b], locations_full=locations)

    for index in range(3):
        start = time.perf_counter()
        metrics = compute_context_selection_token_metrics(
            builder,
            full_selection=selection,
            user_instructions="test",
            field_configs=None,
            organization_mode="narrative",
            measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        )
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        print(f"run {index + 1}: {elapsed_ms:.0f} ms tokens={metrics.selection_tokens}")


if __name__ == "__main__":
    main()

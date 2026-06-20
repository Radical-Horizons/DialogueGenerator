"""Benchmark build_context_json avec cache précompilation (sans HTTP)."""
from __future__ import annotations

import json
import time

from core.context.context_builder import ContextBuilder
from services import gdd_context_precompile as precompile_mod


def main() -> None:
    builder = ContextBuilder()
    builder.load_gdd_files()
    names = builder.get_species_names()[:3]
    if not names:
        print(json.dumps({"error": "no species"}))
        return

    selection = {"species": names}
    times: list[float] = []
    for _ in range(3):
        start = time.perf_counter()
        builder.build_context_json(
            selected_elements=selection,
            scene_instruction=" ",
            organization_mode="narrative",
        )
        times.append((time.perf_counter() - start) * 1000)

    manifest = precompile_mod.precompile_root() / "manifest.json"
    print(
        json.dumps(
            {
                "species_count": len(names),
                "cache_manifest": manifest.is_file(),
                "build_ms": [round(t, 1) for t in times],
                "avg_ms": round(sum(times) / len(times), 1),
            }
        )
    )


if __name__ == "__main__":
    main()

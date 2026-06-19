"""Compare precomputed lookup vs estimate-tokens (4 fiches utilisateur)."""
from __future__ import annotations

import json
import time

from fastapi.testclient import TestClient

from api.container import ServiceContainer
from api.dependencies import get_context_builder
from api.main import app


def main() -> None:
    container = ServiceContainer()
    cb = container.get_context_builder()
    app.state.container = container
    app.dependency_overrides[get_context_builder] = lambda: cb
    client = TestClient(app)

    chars = cb.get_characters_names()
    locs = cb.get_locations_names()
    names = {
        "characters_full": [
            next(c for c in chars if "Valkazer" in c),
            next(c for c in chars if "Uresa" in c),
            next(c for c in chars if "Akthar" in c),
        ],
        "locations_full": [next(loc for loc in locs if "ossements" in loc.lower() or "Plis" in loc)],
    }

    pre = {
        "entities": [
            {"entity_type": "characters", "name": n, "mode": "full"}
            for n in names["characters_full"]
        ]
        + [{"entity_type": "locations", "name": names["locations_full"][0], "mode": "full"}],
        "organization_mode": "narrative",
    }
    est = {
        "user_instructions": " ",
        "context_selections": {
            **names,
            "characters_excerpt": [],
            "locations_excerpt": [],
            "items_full": [],
            "items_excerpt": [],
            "species_full": [],
            "species_excerpt": [],
            "communities_full": [],
            "communities_excerpt": [],
            "dialogues_examples": [],
        },
        "organization_mode": "narrative",
        "max_context_tokens": 200_000,
        "include_narrative_guides": True,
    }

    for _ in range(2):
        client.post("/api/v1/context/precomputed-entity-tokens", json=pre)
        client.post("/api/v1/context/estimate-tokens", json=est)

    t0 = time.perf_counter()
    rp = client.post("/api/v1/context/precomputed-entity-tokens", json=pre)
    pre_ms = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    re = client.post("/api/v1/context/estimate-tokens", json=est)
    est_ms = (time.perf_counter() - t0) * 1000

    print(json.dumps(names, ensure_ascii=False))
    print(f"precomputed: {pre_ms:.0f} ms  {len(rp.content)/1024:.0f} KB  sum={rp.json()['selection_tokens_sum']}")
    print(f"estimate:    {est_ms:.0f} ms  {len(re.content)/1024:.0f} KB  sel={re.json()['selection_tokens']}")


if __name__ == "__main__":
    main()

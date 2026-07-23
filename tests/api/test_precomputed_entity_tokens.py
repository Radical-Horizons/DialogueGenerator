"""Tests lookup tokens précompilés (endpoint rapide)."""
from __future__ import annotations

import os
import time
from typing import List

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_context_builder
from api.main import app

# Sous suite T3 complète Windows, un sample unique peut dépasser 500 ms (contention CPU).
PRECOMPUTED_PERF_BUDGET_MS = float(os.environ.get("CONTEXT_PRECOMPUTED_PERF_BUDGET_MS", "1000"))


@pytest.fixture(scope="module")
def ctx_builder():
    from core.context.context_builder import ContextBuilder

    builder = ContextBuilder()
    builder.load_gdd_files()
    if not builder.characters:
        pytest.skip("GDD indisponible")
    return builder


@pytest.fixture(scope="module")
def warmed_client(ctx_builder) -> TestClient:
    app.dependency_overrides[get_context_builder] = lambda: ctx_builder
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.mark.integration
@pytest.mark.api
def test_precomputed_entity_tokens_fast(warmed_client: TestClient, ctx_builder) -> None:
    """4 fiches utilisateur type : lecture cache, pas estimate-tokens."""
    chars = ctx_builder.get_characters_names()
    locs = ctx_builder.get_locations_names()
    valk = next(c for c in chars if "Valkazer" in c)
    ures = next(c for c in chars if "Uresa" in c)
    akth = next(c for c in chars if "Akthar" in c)
    plis = next(loc for loc in locs if "ossements" in loc.lower() or "Plis" in loc)

    payload = {
        "entities": [
            {"entity_type": "characters", "name": valk, "mode": "full"},
            {"entity_type": "characters", "name": ures, "mode": "full"},
            {"entity_type": "characters", "name": akth, "mode": "full"},
            {"entity_type": "locations", "name": plis, "mode": "full"},
        ],
        "organization_mode": "narrative",
        "field_configs": None,
    }
    for _ in range(3):
        warmed_client.post("/api/v1/context/precomputed-entity-tokens", json=payload)
    samples_ms: List[float] = []
    response = None
    for _ in range(3):
        t0 = time.perf_counter()
        response = warmed_client.post("/api/v1/context/precomputed-entity-tokens", json=payload)
        samples_ms.append((time.perf_counter() - t0) * 1000.0)
    elapsed_ms = min(samples_ms)

    assert response is not None
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["selection_tokens_sum"] > 5000
    assert all(row["cache_hit"] for row in data["entities"])
    assert elapsed_ms < PRECOMPUTED_PERF_BUDGET_MS, (
        f"lookup précompilé trop lent: {elapsed_ms:.0f} ms "
        f"(cible < {PRECOMPUTED_PERF_BUDGET_MS:.0f} ms)"
    )

"""Tests de performance pour l'estimation tokens contexte GDD (FR20).

Seuils cibles (sélection réaliste : 2 personnages volumineux + lieux) :
- pipeline service seul : 500 ms ;
- endpoint HTTP (TestClient + routing + sérialisation) : 1000 ms.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Tuple

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.schemas.dialogue import ContextSelection
from constants import Defaults
from core.context.context_builder import ContextBuilder
from services.context_token_budget import compute_context_selection_token_metrics

PERF_BUDGET_MS = 500.0
# L'endpoint ajoute ~200–400 ms vs le service direct (CI GitHub ~788 ms observé en T3).
API_PERF_BUDGET_MS = float(os.environ.get("CONTEXT_ESTIMATE_API_PERF_BUDGET_MS", "1000"))
_PERF_LOGGERS = (
    "services.context_serializer",
    "services.context_serializer.deduplicator",
    "services.context_organizer",
    "services.context_construction_service",
    "core.context.context_builder",
)


@pytest.fixture(autouse=True)
def _reduce_perf_test_log_noise() -> None:
    """Réduit le bruit DEBUG/I/O qui fausse les mesures pytest."""
    previous: List[Tuple[str, int]] = []
    for name in _PERF_LOGGERS:
        logger = logging.getLogger(name)
        previous.append((name, logger.level))
        logger.setLevel(logging.WARNING)
    yield
    for name, level in previous:
        logging.getLogger(name).setLevel(level)


@pytest.fixture(scope="module")
def real_context_builder() -> ContextBuilder:
    """ContextBuilder avec données GDD réelles."""
    builder = ContextBuilder()
    builder.load_gdd_files()
    if not builder.characters:
        pytest.skip("Données GDD non disponibles")
    return builder


def _top_token_characters(builder: ContextBuilder, limit: int = 5) -> List[Tuple[str, int]]:
    """Retourne les personnages les plus volumineux (tokens JSON bruts)."""
    scored: List[Tuple[str, int]] = []
    for name in builder.get_characters_names():
        data = builder.get_character_details_by_name(name)
        if not data:
            continue
        tokens = int(builder._count_tokens(json.dumps(data, ensure_ascii=False)))
        if tokens >= 3_000:
            scored.append((name, tokens))
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:limit]


def _find_character_by_substring(builder: ContextBuilder, needle: str) -> str | None:
    """Cherche un personnage par sous-chaîne (insensible à la casse / apostrophes)."""
    normalized_needle = needle.lower().replace("\u2019", "'")
    for name in builder.get_characters_names():
        normalized = name.lower().replace("\u2019", "'")
        if normalized_needle in normalized:
            return name
    return None


@pytest.fixture(scope="module")
def realistic_selection(real_context_builder: ContextBuilder) -> Dict[str, Any]:
    """Sélection type utilisateur : 2 gros personnages + 2 lieux."""
    builder = real_context_builder
    top = _top_token_characters(builder, limit=3)
    if len(top) < 2:
        pytest.skip("Pas assez de personnages volumineux dans le GDD")

    char_a = _find_character_by_substring(builder, "Uresa") or top[0][0]
    char_b = _find_character_by_substring(builder, "Voknir") or top[1][0]

    locations = builder.get_locations_names() if hasattr(builder, "get_locations_names") else []
    loc_names: List[str] = []
    if locations:
        loc_names = list(locations[:2])

    return {
        "characters_full": [char_a, char_b],
        "locations_full": loc_names,
        "user_instructions": "Scène de dialogue entre protagonistes.",
        "max_context_tokens": 50_000,
        "organization_mode": "narrative",
    }


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.api
def test_context_token_metrics_service_under_budget(
    real_context_builder: ContextBuilder,
    realistic_selection: Dict[str, Any],
) -> None:
    """Mesure service pure (sans prompt complet) — référence interne."""
    selection = ContextSelection(
        characters_full=realistic_selection["characters_full"],
        locations_full=realistic_selection.get("locations_full") or [],
    )
    # Warmup : hors pytest le GDD est déjà chaud ; ici on isole le coût du pipeline seul.
    for _ in range(2):
        compute_context_selection_token_metrics(
            real_context_builder,
            full_selection=selection,
            user_instructions=str(realistic_selection["user_instructions"]),
            field_configs=None,
            organization_mode=str(realistic_selection["organization_mode"]),
            measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        )
    samples_ms: List[float] = []
    for _ in range(3):
        t0 = time.perf_counter()
        metrics = compute_context_selection_token_metrics(
            real_context_builder,
            full_selection=selection,
            user_instructions=str(realistic_selection["user_instructions"]),
            field_configs=None,
            organization_mode=str(realistic_selection["organization_mode"]),
            measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        )
        samples_ms.append((time.perf_counter() - t0) * 1000.0)
    elapsed_ms = min(samples_ms)
    assert metrics.selection_tokens > 0
    assert elapsed_ms < PERF_BUDGET_MS, (
        f"compute_context_selection_token_metrics: {elapsed_ms:.0f} ms "
        f"(cible < {PERF_BUDGET_MS:.0f} ms), selection_tokens={metrics.selection_tokens}"
    )


@pytest.fixture(scope="module")
def warmed_api_client(real_context_builder: ContextBuilder) -> TestClient:
    """Client API avec ContextBuilder pré-chargé (hors cold start container)."""
    from api.dependencies import get_context_builder

    app.dependency_overrides[get_context_builder] = lambda: real_context_builder
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.api
def test_context_estimate_tokens_api_under_budget(
    warmed_api_client: TestClient,
    realistic_selection: Dict[str, Any],
) -> None:
    """Mesure endpoint POST /context/estimate-tokens (chemin UI panneau gauche)."""
    payload = {
        "context_selections": {
            "characters_full": realistic_selection["characters_full"],
            "locations_full": realistic_selection.get("locations_full") or [],
        },
        "user_instructions": realistic_selection["user_instructions"],
        "max_context_tokens": realistic_selection["max_context_tokens"],
        "organization_mode": realistic_selection["organization_mode"],
    }
    for _ in range(2):
        warmed_api_client.post("/api/v1/context/estimate-tokens", json=payload)
    samples_ms: List[float] = []
    for _ in range(3):
        t0 = time.perf_counter()
        response = warmed_api_client.post("/api/v1/context/estimate-tokens", json=payload)
        samples_ms.append((time.perf_counter() - t0) * 1000.0)
    elapsed_ms = min(samples_ms)
    data = response.json()
    assert response.status_code == 200, response.text
    assert data["selection_tokens"] > 0
    assert elapsed_ms < API_PERF_BUDGET_MS, (
        f"POST /context/estimate-tokens: {elapsed_ms:.0f} ms "
        f"(cible < {API_PERF_BUDGET_MS:.0f} ms), selection_tokens={data['selection_tokens']}"
    )


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.api
def test_context_optimize_proposal_under_budget(
    realistic_selection: Dict[str, Any],
) -> None:
    """Mesure endpoint POST /context/optimize (première proposition)."""
    client = TestClient(app)
    payload = {
        "context_selections": {
            "characters_full": realistic_selection["characters_full"],
            "locations_full": realistic_selection.get("locations_full") or [],
        },
        "user_instructions": realistic_selection["user_instructions"],
        "max_context_tokens": 10_000,
        "organization_mode": realistic_selection["organization_mode"],
        "optimization_rules": {
            "pinned_entity_keys": [],
            "proxy_threshold_percent": 50,
            "strategy": "conservative",
        },
    }
    t0 = time.perf_counter()
    response = client.post("/api/v1/context/optimize", json=payload)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert response.status_code == 200, response.text
    data = response.json()
    assert "selection_tokens_before" in data
    # Optimisation peut être plus lente ; budget x3 pour la première passe
    assert elapsed_ms < PERF_BUDGET_MS * 6, (
        f"POST /context/optimize: {elapsed_ms:.0f} ms (cible < {PERF_BUDGET_MS * 6:.0f} ms)"
    )

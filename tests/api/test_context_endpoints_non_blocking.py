"""Tests de non-blocage de la boucle asyncio pour les endpoints contexte GDD.

Vérifie que ``ContextBuilder.build_context_json()`` / les helpers synchrones
équivalents, potentiellement coûteux, sont bien déportés via ``asyncio.to_thread()``
dans les endpoints concernés : une requête légère concurrente (``GET /health``) ne
doit jamais attendre derrière un appel lourd en cours d'exécution dans un thread.

Design (v3, voir spec) : synchronisation déterministe par ``threading.Event``
plutôt qu'un ``asyncio.sleep`` fixe côté test — élimine la flakiness liée au
timing. Client HTTP ``httpx.AsyncClient(transport=ASGITransport(app=app))`` pour
pouvoir tirer deux requêtes réellement concurrentes sur la même boucle asyncio
(``TestClient`` synchrone ne le permet pas).

Voir _bmad-output/implementation-artifacts/spec-fix-event-loop-blocking-context-endpoints.md
"""
from __future__ import annotations

import asyncio
import threading
import time
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest

from api.dependencies import (
    get_context_builder,
    get_prompt_engine,
    get_skill_catalog_service,
    get_trait_catalog_service,
)
from api.main import app
from core.context.context_builder import ContextBuilder
from models.prompt_structure import PromptMetadata, PromptStructure

# Durée simulée du travail bloquant (secondes). Assez longue pour distinguer sans
# ambiguïté un event loop bloqué (health attendrait ~_SLEEP_SECONDS) d'un event loop
# libre (health répond quasi immédiatement), sans ralentir excessivement la suite.
_SLEEP_SECONDS = 1.0


def _fake_prompt_structure() -> PromptStructure:
    """Structure minimale valide pour satisfaire le typage aval des handlers."""
    return PromptStructure(
        sections=[],
        metadata=PromptMetadata(
            totalTokens=100,
            generatedAt="2026-01-01T00:00:00",
            organizationMode="narrative",
        ),
    )


def _make_blocking_context_builder(started_event: threading.Event) -> MagicMock:
    """``ContextBuilder`` mocké dont ``build_context_json`` bloque ``_SLEEP_SECONDS``.

    Le mock signale ``started_event`` dès l'entrée dans l'appel (avant le sleep) :
    le test attend ce signal plutôt qu'un délai fixe pour savoir que le thread
    lourd a bien démarré, avant de tirer la requête légère concurrente.

    Args:
        started_event: Événement mis à ``set()`` dès le début de l'appel bloquant.

    Returns:
        Mock respectant l'API publique de ``ContextBuilder`` utilisée par les routers.
    """
    builder = MagicMock(spec=ContextBuilder)
    # -1 : hors chemin de cache de compute_context_selection_token_metrics (évite
    # tout état partagé entre exécutions de test via le cache process-level).
    builder.gdd_revision = -1

    def _blocking_build_context_json(*_args: Any, **_kwargs: Any) -> PromptStructure:
        started_event.set()
        time.sleep(_SLEEP_SECONDS)
        return _fake_prompt_structure()

    builder.build_context_json = MagicMock(side_effect=_blocking_build_context_json)
    builder.serialize_context_to_text = MagicMock(return_value="fake context text")
    builder._count_tokens = MagicMock(return_value=42)
    builder.count_tokens = MagicMock(return_value=42)
    return builder


def _fake_build_lightweight_prompt_structure(
    *_args: Any, **kwargs: Any
) -> tuple[int, PromptStructure]:
    """Remplace ``_build_lightweight_prompt_structure`` (bypass du vrai PromptEngine).

    Le point sous test est le déport de ``build_context_json``, pas la construction
    complète du prompt affichable (qui dépend de services réels non pertinents ici).

    Returns:
        Tuple ``(prompt_overhead_tokens, structured_prompt)`` minimal mais valide.
    """
    structured_context = kwargs["structured_context"]
    return 0, structured_context


def _override_light_dependencies() -> None:
    """Neutralise les dépendances FastAPI non pertinentes pour ces tests.

    Évite qu'une résolution de dépendance encore branchée sur le vrai
    ``ServiceContainer`` (ex. ``PromptEngine`` construit avec un ``ContextBuilder``
    interne distinct du mock) déclenche un vrai chargement GDD en coulisses.
    """
    app.dependency_overrides[get_prompt_engine] = lambda: MagicMock()
    app.dependency_overrides[get_skill_catalog_service] = lambda: MagicMock()
    app.dependency_overrides[get_trait_catalog_service] = lambda: MagicMock()


def _clear_dependency_overrides() -> None:
    """Retire les overrides posés par ces tests (nettoyage garanti en ``finally``)."""
    for dep in (
        get_context_builder,
        get_prompt_engine,
        get_skill_catalog_service,
        get_trait_catalog_service,
    ):
        app.dependency_overrides.pop(dep, None)


async def test_estimate_tokens_does_not_block_health(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """POST /context/estimate-tokens (déporté via to_thread) ne doit pas bloquer /health.

    Scénario I/O matrix de la spec : requête légère concurrente à un calcul lourd
    déporté → ``/health`` répond sans attendre le calcul lourd.
    """
    started_event = threading.Event()
    blocking_builder = _make_blocking_context_builder(started_event)
    app.dependency_overrides[get_context_builder] = lambda: blocking_builder
    _override_light_dependencies()
    monkeypatch.setattr(
        "api.routers.context_build._build_lightweight_prompt_structure",
        _fake_build_lightweight_prompt_structure,
    )

    payload = {
        "context_selections": {},
        "user_instructions": "Test de non-blocage.",
        "max_context_tokens": 10000,
        "organization_mode": "narrative",
    }

    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            heavy_task = asyncio.create_task(
                client.post("/api/v1/context/estimate-tokens", json=payload)
            )
            # Attend que le thread lourd ait réellement démarré, sans dépendre d'un
            # sleep fixe côté test (source classique de flakiness).
            started = await asyncio.to_thread(started_event.wait, 5.0)
            assert started, "le mock build_context_json n'a jamais démarré"

            t0 = time.perf_counter()
            health_response = await client.get("/health")
            health_elapsed = time.perf_counter() - t0

            heavy_response = await heavy_task
    finally:
        _clear_dependency_overrides()

    assert health_response.status_code == 200
    assert health_elapsed < _SLEEP_SECONDS / 2, (
        f"/health a mis {health_elapsed:.3f}s alors que build_context_json dormait "
        f"{_SLEEP_SECONDS}s dans un thread déporté : la boucle asyncio semble bloquée."
    )
    assert heavy_response.status_code == 200, heavy_response.text
    body = heavy_response.json()
    assert body["context_tokens"] == 100
    assert body["selection_tokens"] == 100


async def test_gdd_content_fingerprint_does_not_block_health(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """POST /context/gdd-content-fingerprint (déporté) ne doit pas bloquer /health.

    Second site nouvellement déporté (context_staleness.py::post_gdd_content_fingerprint),
    pour ne pas ne couvrir qu'un seul routeur — voir Tasks & Acceptance de la spec.
    """
    started_event = threading.Event()
    app.dependency_overrides[get_context_builder] = lambda: MagicMock(
        spec=ContextBuilder
    )

    def _blocking_fingerprint(*_args: Any, **_kwargs: Any) -> str:
        started_event.set()
        time.sleep(_SLEEP_SECONDS)
        return "deadbeef" * 8

    monkeypatch.setattr(
        "services.gdd_context_fingerprint.compute_gdd_content_fingerprint",
        _blocking_fingerprint,
    )

    payload = {"context_selections": {}, "organization_mode": "narrative"}

    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            heavy_task = asyncio.create_task(
                client.post("/api/v1/context/gdd-content-fingerprint", json=payload)
            )
            started = await asyncio.to_thread(started_event.wait, 5.0)
            assert started, "le mock compute_gdd_content_fingerprint n'a jamais démarré"

            t0 = time.perf_counter()
            health_response = await client.get("/health")
            health_elapsed = time.perf_counter() - t0

            heavy_response = await heavy_task
    finally:
        app.dependency_overrides.pop(get_context_builder, None)

    assert health_response.status_code == 200
    assert health_elapsed < _SLEEP_SECONDS / 2, (
        f"/health a mis {health_elapsed:.3f}s alors que compute_gdd_content_fingerprint "
        f"dormait {_SLEEP_SECONDS}s dans un thread déporté : la boucle asyncio semble bloquée."
    )
    assert heavy_response.status_code == 200, heavy_response.text
    assert heavy_response.json()["fingerprint"] == "deadbeef" * 8

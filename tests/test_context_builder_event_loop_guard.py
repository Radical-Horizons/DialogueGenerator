"""Tests du garde-fou runtime `_warn_if_running_on_event_loop` (core/context/context_builder.py).

Garde-fou contre une régression silencieuse (plan v3 §2) : si `load_gdd_files()`/
`build_context_json()` sont appelées de façon synchrone alors qu'une boucle
asyncio tourne sur le thread appelant, un log ERROR visible doit être émis —
sauf sous pytest (faux positifs sur les ~32 fichiers de test qui appellent ces
méthodes en synchrone direct, y compris depuis des ``async def test_*``).

4 cas couverts :
1. Log ERROR si hors-pytest + boucle asyncio active sur le thread appelant.
2. Silence si `_is_test_environment()` (pytest réel, non mocké dans ce cas).
3. Silence si aucune boucle asyncio n'est active sur le thread.
4. Throttling : deux appels rapprochés pour la même opération ne loggent qu'une fois.

Voir _bmad-output/implementation-artifacts/spec-fix-event-loop-blocking-context-endpoints.md
"""
from __future__ import annotations

import logging
from typing import Iterator

import pytest

from core.context import context_builder as context_builder_module


@pytest.fixture(autouse=True)
def _reset_warning_throttle_state() -> Iterator[None]:
    """Isole chaque test de l'état de throttling module-level (dict partagé entre appels)."""
    context_builder_module._last_event_loop_warning_time.clear()
    yield
    context_builder_module._last_event_loop_warning_time.clear()


async def test_warns_when_running_on_event_loop_outside_pytest(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Cas 1 : hors-pytest + boucle active -> log ERROR avec la stack (visible)."""
    monkeypatch.setattr(context_builder_module, "_is_test_environment", lambda: False)
    caplog.set_level(logging.ERROR, logger="core.context.context_builder")

    # Test async : une vraie boucle asyncio tourne sur ce thread pendant l'appel.
    context_builder_module._warn_if_running_on_event_loop("test_operation_active_loop")

    assert len(caplog.records) == 1
    record = caplog.records[0]
    assert record.levelno == logging.ERROR
    assert "test_operation_active_loop" in record.getMessage()
    assert record.stack_info is not None


async def test_silent_under_pytest_even_with_active_loop(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Cas 2 : sous pytest réel (`_is_test_environment()` non mocké), toujours silencieux.

    Reproduit exactement le contexte des ~32 fichiers de test existants : appel
    synchrone direct depuis un ``async def test_*`` (boucle active + pytest réel).
    """
    caplog.set_level(logging.ERROR, logger="core.context.context_builder")

    context_builder_module._warn_if_running_on_event_loop("test_operation_pytest_silent")

    assert caplog.records == []


def test_silent_when_no_event_loop_running(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Cas 3 : aucune boucle asyncio active sur le thread -> silencieux (RuntimeError catché).

    Test synchrone (pas ``async def``) : ``asyncio.get_running_loop()`` lève
    ``RuntimeError`` sur ce thread, comme pour un appel synchrone légitime
    (thread principal hors serveur ASGI, ou thread worker déporté via
    ``asyncio.to_thread``).
    """
    monkeypatch.setattr(context_builder_module, "_is_test_environment", lambda: False)
    caplog.set_level(logging.ERROR, logger="core.context.context_builder")

    context_builder_module._warn_if_running_on_event_loop("test_operation_no_loop")

    assert caplog.records == []


async def test_throttles_rapid_successive_warnings(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Cas 4 : deux appels rapprochés pour la même opération -> un seul log émis."""
    monkeypatch.setattr(context_builder_module, "_is_test_environment", lambda: False)
    caplog.set_level(logging.ERROR, logger="core.context.context_builder")

    context_builder_module._warn_if_running_on_event_loop("test_operation_throttled")
    context_builder_module._warn_if_running_on_event_loop("test_operation_throttled")

    assert len(caplog.records) == 1


async def test_throttle_is_keyed_per_operation(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Le throttling est indépendant par nom d'opération (clé = site d'appel)."""
    monkeypatch.setattr(context_builder_module, "_is_test_environment", lambda: False)
    caplog.set_level(logging.ERROR, logger="core.context.context_builder")

    context_builder_module._warn_if_running_on_event_loop("test_operation_alpha")
    context_builder_module._warn_if_running_on_event_loop("test_operation_beta")

    assert len(caplog.records) == 2

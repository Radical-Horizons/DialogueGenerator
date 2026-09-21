"""Un 429 doit être réessayé, pas transformé en mesure manquante.

Sur un relais comme OpenRouter, un 429 est la règle pour les modèles
populaires, pas l'exception. Constaté le 2026-09-21 : `mistral-small-2603` en a
pris un dès sa première génération.

Le classement en aval est juste dans les deux cas — un 429 donne un
`config_error`, hors du taux de validité. Ce qui manque sans reprise, c'est la
**mesure** : un candidat qui prend trois 429 sur cinq cas n'est mesuré que sur
deux, et on a payé un run pour ne pas le mesurer.
"""

from __future__ import annotations

from typing import Any, List

import pytest


class _FlakyCompletions:
    """Endpoint qui refuse les premiers appels, puis répond."""

    def __init__(self, failures: int) -> None:
        self.calls = 0
        self._failures = failures

    async def create(self, **kwargs: Any) -> Any:
        self.calls += 1
        if self.calls <= self._failures:
            raise RuntimeError("Error code: 429 - rate limit exceeded")
        return "réponse"


def _client(failures: int) -> Any:
    """Client OpenRouter dont seul le point d'appel est réel."""
    from core.llm.openrouter_client import OpenRouterClient

    client = OpenRouterClient.__new__(OpenRouterClient)
    from api.utils.retry import retry_with_backoff

    client._retry_with_backoff = retry_with_backoff  # noqa: SLF001
    completions = _FlakyCompletions(failures)
    client.client = type("_C", (), {"chat": type("_Chat", (), {"completions": completions})})()
    return client, completions


@pytest.mark.asyncio
async def test_a_rate_limit_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    """Deux refus puis une réponse : la mesure est sauvée."""
    monkeypatch.setenv("LLM_RETRY_BASE_DELAY", "0.01")
    client, completions = _client(failures=2)

    assert await client._create_with_retry(model="x") == "réponse"
    assert completions.calls == 3


@pytest.mark.asyncio
async def test_retries_are_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un relais durablement saturé ne doit pas bloquer le run entier."""
    monkeypatch.setenv("LLM_RETRY_BASE_DELAY", "0.01")
    monkeypatch.setenv("LLM_RETRY_MAX_ATTEMPTS", "3")
    client, completions = _client(failures=99)

    with pytest.raises(RuntimeError):
        await client._create_with_retry(model="x")
    assert completions.calls == 3


@pytest.mark.asyncio
async def test_without_the_helper_the_call_still_goes_through() -> None:
    """L'absence du helper ne doit pas empêcher d'appeler le modèle."""
    client, completions = _client(failures=0)
    client._retry_with_backoff = None  # noqa: SLF001

    assert await client._create_with_retry(model="x") == "réponse"
    assert completions.calls == 1

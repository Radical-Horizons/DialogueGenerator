"""Politique de retry avec backoff pour appels Notion (FR18)."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional, TypeVar

import httpx

logger = logging.getLogger(__name__)

T = TypeVar("T")


def is_transient_notion_http_error(exc: BaseException) -> bool:
    """True si l'exception vaut un retry (timeouts, réseau, HTTP transitoires Notion)."""
    if isinstance(exc, httpx.TimeoutException):
        return True
    if isinstance(exc, httpx.ConnectError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 500, 502, 503, 504)
    return False


@dataclass
class SyncBackoffPolicy:
    """Backoff exponentiel borné, horloge injectable pour les tests."""

    initial_seconds: float = 1.0
    multiplier: float = 2.0
    max_seconds: float = 300.0
    _clock: Callable[[], float] = time.monotonic

    def delay_after_attempt(self, attempt_index: int) -> float:
        """Délai avant la tentative attempt_index (0-based)."""
        delay = self.initial_seconds * (self.multiplier ** max(0, attempt_index))
        return min(delay, self.max_seconds)

    async def sleep_before_retry(self, attempt_index: int) -> None:
        """Attend avant une nouvelle tentative."""
        delay = self.delay_after_attempt(attempt_index)
        logger.info("Sync Notion: attente backoff %.2fs (tentative %s)", delay, attempt_index + 1)
        await asyncio.sleep(delay)


async def run_with_retries(
    op: Callable[[], Awaitable[T]],
    *,
    policy: SyncBackoffPolicy,
    max_attempts: int = 5,
    is_transient: Callable[[BaseException], bool],
) -> T:
    """Exécute une coroutine avec retries sur erreurs transitoires.

    Args:
        op: Factory retournant la coroutine à exécuter.
        policy: Politique de délai.
        max_attempts: Nombre maximal de tentatives.
        is_transient: Prédicat : True si l'erreur mérite un retry.

    Raises:
        La dernière exception si toutes les tentatives échouent.
    """
    last_exc: Optional[BaseException] = None
    for attempt in range(max_attempts):
        try:
            return await op()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt >= max_attempts - 1 or not is_transient(exc):
                raise
            await policy.sleep_before_retry(attempt)
    assert last_exc is not None
    raise last_exc

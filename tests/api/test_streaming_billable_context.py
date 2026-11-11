"""Fermeture d'un flux SSE depuis un autre contexte : pas d'exception sur l'utilisateur facturé."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import pytest

import api.routers.streaming as streaming_module
from api.middleware.billable_user_context import get_billable_user_id


@pytest.mark.asyncio
async def test_closing_stream_from_another_context_does_not_raise(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le client qui part (F5, onglet fermé) finalise le flux dans un autre contexte.

    Vu en prod le 2026-11-11 : « Task exception was never retrieved … ValueError <Token
    var=<ContextVar name='billable_user_id' …> was created in a different Context ».
    """
    seen_user: list[str] = []

    async def fake_stream(
        job_id: str, orchestrator: Any, last_event_id: Any = None
    ) -> AsyncIterator[str]:
        """Émet un événement en relevant l'utilisateur facturé, puis attend."""
        seen_user.append(get_billable_user_id())
        yield "data: premier\n\n"
        await asyncio.sleep(3600)
        yield "data: jamais\n\n"

    monkeypatch.setattr(streaming_module, "stream_generation", fake_stream)
    stream = streaming_module.stream_generation_with_billable_user(
        "job-1", orchestrator=None, billable_user_id="marc"
    )

    first = await asyncio.create_task(stream.__anext__())
    await asyncio.create_task(stream.aclose())

    assert first == "data: premier\n\n"
    assert seen_user == ["marc"]

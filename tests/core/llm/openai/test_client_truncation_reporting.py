"""Une génération coupée doit se dénoncer elle-même, et dire ce qu'elle a coûté.

Deux défauts jumeaux, tous deux constatés sur le banc du 2026-08-08 :

- la raison d'arrêt n'était lue nulle part, donc une réponse tronquée par le
  plafond de complétion passait pour une réponse ratée du modèle ;
- le client remettait coût et tokens à zéro dès que le parsing échouait, d'où
  cinq échecs affichés « 0 token, 0 $ » sur des appels bel et bien facturés.

Les deux se corrigent au même endroit : le bloc de tracking du client.
"""

from __future__ import annotations

import os
from types import SimpleNamespace
from typing import Any, Optional
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import BaseModel, Field

from core.llm.openai.client import OpenAIClient

TRUNCATED_PROMPT_TOKENS = 9000
TRUNCATED_COMPLETION_TOKENS = 6000


class _Fragment(BaseModel):
    """Modèle de sortie structurée minimal."""

    title: str = Field(description="Titre")


class _PricingService:
    """Tarification fictive, proportionnelle aux tokens."""

    def calculate_cost(
        self, model_name: str, prompt_tokens: int, completion_tokens: int
    ) -> float:
        return (prompt_tokens + completion_tokens) / 1_000_000


class _UsageService:
    """Service de tracking qui accepte tout."""

    def __init__(self) -> None:
        self.pricing_service = _PricingService()
        self.calls: list[dict[str, Any]] = []

    def track_usage(self, **kwargs: Any) -> None:
        self.calls.append(kwargs)


def _truncated_response() -> SimpleNamespace:
    """Réponse Responses API coupée par le plafond de complétion.

    ``output`` est vide : c'est justement ce qui fait échouer le parsing et ce
    qui, sans raison d'arrêt, se lit à tort comme « le modèle n'a rien su dire ».
    """
    return SimpleNamespace(
        status="incomplete",
        incomplete_details=SimpleNamespace(reason="max_output_tokens"),
        output=[],
        reasoning=None,
        choices=None,
        usage=SimpleNamespace(
            input_tokens=TRUNCATED_PROMPT_TOKENS,
            output_tokens=TRUNCATED_COMPLETION_TOKENS,
        ),
    )


@pytest.fixture
def client() -> OpenAIClient:
    """Client OpenAI câblé sur un service d'usage fictif."""
    with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
        return OpenAIClient(
            api_key="test-key",
            config={"default_model": "gpt-5.6-terra", "max_tokens": 2000},
            usage_service=_UsageService(),
        )


async def _generate_truncated(client: OpenAIClient) -> Optional[str]:
    """Joue une génération que l'API a coupée."""
    with patch.object(
        client.client.responses, "create", new_callable=AsyncMock
    ) as create:
        create.return_value = _truncated_response()
        results = await client.generate_variants(
            "Écris le fragment", k=1, response_model=_Fragment
        )
    return results[0] if results else None


@pytest.mark.asyncio
async def test_truncation_is_reported_not_inferred(client: OpenAIClient) -> None:
    """Sans cette valeur, la troncature ne se déduit que des symptômes."""
    await _generate_truncated(client)

    assert client.last_finish_reason == "length"


@pytest.mark.asyncio
async def test_failed_parsing_still_reports_what_was_spent(client: OpenAIClient) -> None:
    """Le modèle a lu le prompt et écrit 6000 tokens : c'est facturé."""
    await _generate_truncated(client)

    assert client.last_usage_prompt_tokens == TRUNCATED_PROMPT_TOKENS
    assert client.last_usage_completion_tokens == TRUNCATED_COMPLETION_TOKENS
    assert client.last_call_cost == pytest.approx(0.015)


@pytest.mark.asyncio
async def test_no_response_at_all_reports_nothing_spent(client: OpenAIClient) -> None:
    """Un appel qui n'aboutit pas ne doit rien facturer non plus."""
    with patch.object(
        client.client.responses, "create", new_callable=AsyncMock
    ) as create:
        create.side_effect = RuntimeError("API injoignable")
        await client.generate_variants("Écris le fragment", k=1)

    assert client.last_call_cost == 0.0
    assert client.last_usage_prompt_tokens == 0
    # Pas de réponse, donc pas de raison d'arrêt : « on ne sait pas ».
    assert client.last_finish_reason is None

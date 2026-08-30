"""Vérifie que FallbackLLMClient propage last_* depuis le client effectif."""
from typing import Any, List, Optional, Type, Union
from unittest.mock import MagicMock

import pytest
from pydantic import BaseModel

from core.llm.fallback_client import FallbackLLMClient
from core.llm.llm_client import ILLMClient


class _StubPrimary(ILLMClient):
    """Client principal qui échoue toujours."""

    def __init__(self) -> None:
        super().__init__()
        self.last_call_cost = 0.0
        self.last_usage_prompt_tokens = 0
        self.last_usage_completion_tokens = 0

    async def generate_variants(
        self,
        prompt: str,
        k: int = 1,
        response_model: Optional[Type[BaseModel]] = None,
        previous_dialogue_context: Optional[List[dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
    ) -> List[Union[str, BaseModel]]:
        raise RuntimeError("primary down")

    def get_max_tokens(self) -> int:
        return 8000


class _StubFallback(ILLMClient):
    """Client de secours avec métadonnées usage."""

    def __init__(self) -> None:
        super().__init__()
        self.last_call_cost = 0.042
        self.last_usage_prompt_tokens = 100
        self.last_usage_completion_tokens = 200
        self.last_finish_reason = "length"

    async def generate_variants(
        self,
        prompt: str,
        k: int = 1,
        response_model: Optional[Type[BaseModel]] = None,
        previous_dialogue_context: Optional[List[dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
    ) -> List[Union[str, BaseModel]]:
        return ["ok"]

    def get_max_tokens(self) -> int:
        return 8000


@pytest.mark.asyncio
async def test_fallback_mirrors_last_usage_after_success() -> None:
    """Après succès sur le second provider, last_* du wrapper = ceux du sous-client."""
    created: list[tuple[str, dict[str, Any]]] = []

    def create_fn(model_id: str, **kwargs: Any) -> ILLMClient:
        created.append((model_id, kwargs))
        if model_id == "a":
            return _StubPrimary()
        return _StubFallback()

    fb = FallbackLLMClient(
        model_ids=["a", "b"],
        create_client_fn=create_fn,
        create_client_kwargs={},
        usage_service=MagicMock(),
        request_id="t1",
    )

    out = await fb.generate_variants("p", k=1)
    assert out == ["ok"]
    assert fb.last_call_cost == pytest.approx(0.042)
    assert fb.last_usage_prompt_tokens == 100
    assert fb.last_usage_completion_tokens == 200
    # L'orchestrateur ne voit que le wrapper : une raison d'arrêt qui reste au
    # niveau du sous-client rendrait toute troncature invisible dès qu'un repli
    # entre en jeu.
    assert fb.last_finish_reason == "length"

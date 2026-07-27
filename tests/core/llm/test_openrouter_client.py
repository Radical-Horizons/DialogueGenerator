"""Tests unitaires légers pour OpenRouterClient."""

from __future__ import annotations

import pytest

from core.llm.openrouter_client import OpenRouterClient


def test_openrouter_client_requires_api_key() -> None:
    """Sans clé, l'init lève une ValueError explicite."""
    with pytest.raises(ValueError, match="OPENROUTER_API_KEY"):
        OpenRouterClient(api_key="", config={"default_model": "aion-labs/aion-2.0"})


def test_openrouter_client_get_max_tokens_from_config() -> None:
    """get_max_tokens lit la config, pas un hardcode Aion."""
    client = OpenRouterClient(
        api_key="test-key",
        config={"default_model": "aion-labs/aion-2.0", "max_tokens": 16000},
    )
    assert client.get_max_tokens() == 16000

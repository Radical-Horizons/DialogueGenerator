"""Tests pour TokenEstimationService (estimation tokens prompt + completion)."""
import pytest
from services.token_estimation_service import TokenEstimationService


@pytest.fixture
def service():
    """Instance du service sans mock (utilise tiktoken ou fallback)."""
    return TokenEstimationService()


def test_estimate_tokens_returns_tuple(service):
    """estimate_tokens retourne (prompt_tokens, completion_tokens)."""
    result = service.estimate_tokens("Hello world", "gpt-4o")
    assert isinstance(result, tuple)
    assert len(result) == 2
    prompt_tokens, completion_tokens = result
    assert isinstance(prompt_tokens, int)
    assert isinstance(completion_tokens, int)
    assert prompt_tokens >= 0
    assert completion_tokens >= 0


def test_estimate_tokens_prompt_length_affects_prompt_tokens(service):
    """Un prompt plus long donne plus de prompt_tokens."""
    short_result = service.estimate_tokens("Hi", "gpt-4o")
    long_text = "x" * 400  # ~100 tokens avec approx 4 chars/token
    long_result = service.estimate_tokens(long_text, "gpt-4o")
    assert long_result[0] >= short_result[0]
    assert long_result[0] >= 1


def test_estimate_tokens_completion_estimated_positive(service):
    """completion_tokens estimé est positif (estimation par nœud)."""
    result = service.estimate_tokens("Instructions", "gpt-4o")
    assert result[1] >= 1


def test_estimate_tokens_empty_prompt(service):
    """Prompt vide : prompt_tokens 0 ou 1, completion toujours estimé."""
    result = service.estimate_tokens("", "gpt-4o")
    assert result[0] in (0, 1)
    assert result[1] >= 1


def test_estimate_tokens_model_id_accepted(service):
    """model_id est accepté (utilisé pour encodage ou ignoré selon impl)."""
    result = service.estimate_tokens("Test", "gpt-4o")
    assert result[0] >= 0
    result2 = service.estimate_tokens("Test", "mistral-small")
    assert result2[0] >= 0

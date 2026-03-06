"""Tests pour FallbackLLMClient (Story 1.16)."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from api.exceptions import AllLLMProvidersUnavailableError
from core.llm.fallback_client import FallbackLLMClient
from core.llm.llm_client import ILLMClient


@pytest.fixture
def mock_primary_client():
    """Client principal mocké."""
    c = MagicMock(spec=ILLMClient)
    c.generate_variants = AsyncMock(return_value=["result-primary"])
    c.get_max_tokens = MagicMock(return_value=32000)
    return c


@pytest.fixture
def mock_fallback_client():
    """Client fallback mocké."""
    c = MagicMock(spec=ILLMClient)
    c.generate_variants = AsyncMock(return_value=["result-fallback"])
    c.get_max_tokens = MagicMock(return_value=32000)
    return c


@pytest.fixture
def create_client_fn(mock_primary_client, mock_fallback_client):
    """Factory qui retourne primary pour gpt-5.2, fallback pour mistral."""
    def _create(model_id: str, **kwargs: object) -> ILLMClient:
        if model_id == "gpt-5.2":
            return mock_primary_client
        if model_id == "labs-mistral-small-creative":
            return mock_fallback_client
        return MagicMock(spec=ILLMClient)
    return _create


@pytest.mark.asyncio
async def test_primary_success_no_fallback_call(create_client_fn, mock_primary_client, mock_fallback_client):
    """Client principal réussit → pas d'appel au fallback."""
    client = FallbackLLMClient(
        model_ids=["gpt-5.2", "labs-mistral-small-creative"],
        create_client_fn=create_client_fn,
        create_client_kwargs={"config": {}, "available_models": []},
        usage_service=MagicMock(),
    )
    result = await client.generate_variants("prompt", k=1)
    assert result == ["result-primary"]
    mock_primary_client.generate_variants.assert_called_once()
    mock_fallback_client.generate_variants.assert_not_called()


@pytest.mark.asyncio
async def test_primary_fails_fallback_succeeds(create_client_fn, mock_primary_client, mock_fallback_client):
    """Client principal échoue 3 fois → fallback utilisé."""
    mock_primary_client.generate_variants = AsyncMock(side_effect=Exception("Timeout"))
    client = FallbackLLMClient(
        model_ids=["gpt-5.2", "labs-mistral-small-creative"],
        create_client_fn=create_client_fn,
        create_client_kwargs={"config": {}, "available_models": []},
        usage_service=MagicMock(),
    )
    result = await client.generate_variants("prompt", k=1)
    assert result == ["result-fallback"]
    mock_fallback_client.generate_variants.assert_called_once()


@pytest.mark.asyncio
async def test_all_clients_fail_raises_all_unavailable(create_client_fn, mock_primary_client, mock_fallback_client):
    """Tous les clients échouent → AllLLMProvidersUnavailableError."""
    mock_primary_client.generate_variants = AsyncMock(side_effect=Exception("500"))
    mock_fallback_client.generate_variants = AsyncMock(side_effect=Exception("503"))
    client = FallbackLLMClient(
        model_ids=["gpt-5.2", "labs-mistral-small-creative"],
        create_client_fn=create_client_fn,
        create_client_kwargs={"config": {}, "available_models": []},
        usage_service=MagicMock(),
    )
    with pytest.raises(AllLLMProvidersUnavailableError) as exc_info:
        await client.generate_variants("prompt", k=1)
    assert "Tous les providers LLM sont indisponibles" in str(exc_info.value.detail)


def test_fallback_client_requires_at_least_two_models():
    """FallbackLLMClient requiert au moins 2 model_ids."""
    with pytest.raises(ValueError, match="au moins 2 model_ids"):
        FallbackLLMClient(
            model_ids=["gpt-5.2"],
            create_client_fn=MagicMock(),
            create_client_kwargs={},
            usage_service=MagicMock(),
        )


def test_get_max_tokens_returns_primary_max_tokens(create_client_fn, mock_primary_client):
    """get_max_tokens retourne celui du premier client."""
    mock_primary_client.get_max_tokens.return_value = 16000
    client = FallbackLLMClient(
        model_ids=["gpt-5.2", "labs-mistral-small-creative"],
        create_client_fn=create_client_fn,
        create_client_kwargs={"config": {}, "available_models": []},
        usage_service=MagicMock(),
    )
    assert client.get_max_tokens() == 16000


@pytest.mark.asyncio
async def test_fallback_success_calls_track_usage_with_fallback_from_reason():
    """Quand le fallback réussit, track_usage est appelé avec fallback_from et fallback_reason (Story 1.16)."""
    mock_usage = MagicMock()
    primary_client = MagicMock(spec=ILLMClient)
    primary_client.generate_variants = AsyncMock(side_effect=Exception("Timeout"))
    primary_client.get_max_tokens = MagicMock(return_value=32000)

    async def fallback_gen_var(*args: object, **kwargs: object) -> list:
        # Simule le client fallback qui appelle usage_service.track_usage (comme MistralClient)
        usage_svc = captured_usage_service
        if usage_svc:
            usage_svc.track_usage(
                request_id="req1",
                model_name="labs-mistral-small-creative",
                prompt_tokens=10,
                completion_tokens=5,
                total_tokens=15,
                duration_ms=100,
                success=True,
                endpoint="generate/unity-dialogue",
            )
        return ["result-fallback"]

    captured_usage_service = None

    def create_fn(model_id: str, **kwargs: object) -> ILLMClient:
        nonlocal captured_usage_service
        if model_id == "gpt-5.2":
            return primary_client
        if model_id == "labs-mistral-small-creative":
            captured_usage_service = kwargs.get("usage_service")
            fallback_client = MagicMock(spec=ILLMClient)
            fallback_client.generate_variants = fallback_gen_var
            fallback_client.get_max_tokens = MagicMock(return_value=32000)
            return fallback_client
        return MagicMock(spec=ILLMClient)

    client = FallbackLLMClient(
        model_ids=["gpt-5.2", "labs-mistral-small-creative"],
        create_client_fn=create_fn,
        create_client_kwargs={"config": {}, "available_models": []},
        usage_service=mock_usage,
        request_id="req1",
    )
    result = await client.generate_variants("prompt", k=1)
    assert result == ["result-fallback"]
    assert mock_usage.track_usage.called
    call_kwargs = mock_usage.track_usage.call_args[1]
    assert call_kwargs.get("fallback_from") == "gpt-5.2"
    assert call_kwargs.get("fallback_reason") is not None
    assert "Timeout" in str(call_kwargs.get("fallback_reason", ""))

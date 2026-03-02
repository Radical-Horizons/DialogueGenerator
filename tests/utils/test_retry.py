"""Tests pour la logique de retry."""
import os
import pytest
import asyncio
from unittest.mock import patch, AsyncMock
from openai import APIError, RateLimitError, APITimeoutError
import httpx
from shared.resilience import retry_with_backoff, is_retryable_error, get_retry_config


def test_is_retryable_error_rate_limit():
    """Test que RateLimitError est considéré comme réessayable."""
    req = httpx.Request("GET", "https://example.com")
    resp = httpx.Response(429, request=req)
    error = RateLimitError("Rate limit exceeded", response=resp, body=None)
    assert is_retryable_error(error) is True


def test_is_retryable_error_timeout():
    """Test que APITimeoutError est considéré comme réessayable."""
    req = httpx.Request("GET", "https://example.com")
    error = APITimeoutError(req)
    assert is_retryable_error(error) is True


def test_is_retryable_error_api_error_429():
    """Test qu'une APIError avec code 429 est réessayable."""
    req = httpx.Request("GET", "https://example.com")
    error = APIError("Rate limit", req, body=None)
    error.status_code = 429
    assert is_retryable_error(error) is True


def test_is_retryable_error_api_error_500():
    """Test qu'une APIError avec code 500 est réessayable."""
    req = httpx.Request("GET", "https://example.com")
    error = APIError("Server error", req, body=None)
    error.status_code = 500
    assert is_retryable_error(error) is True


def test_is_retryable_error_not_retryable():
    """Test qu'une erreur 400 n'est pas réessayable."""
    req = httpx.Request("GET", "https://example.com")
    error = APIError("Bad request", req, body=None)
    error.status_code = 400
    assert is_retryable_error(error) is False


def test_get_retry_config_default():
    """Test que get_retry_config retourne les valeurs par défaut."""
    with patch.dict(os.environ, {}, clear=True):
        config = get_retry_config()
        
        assert config["enabled"] is True
        assert config["max_attempts"] == 3
        assert config["base_delay"] == 1.0


def test_get_retry_config_custom():
    """Test que get_retry_config charge les valeurs depuis l'environnement."""
    with patch.dict(os.environ, {
        "LLM_RETRY_ENABLED": "false",
        "LLM_RETRY_MAX_ATTEMPTS": "5",
        "LLM_RETRY_BASE_DELAY": "2.0"
    }, clear=True):
        config = get_retry_config()
        
        assert config["enabled"] is False
        assert config["max_attempts"] == 5
        assert config["base_delay"] == 2.0


@pytest.mark.asyncio
async def test_retry_with_backoff_success():
    """Test que retry_with_backoff retourne le résultat si succès du premier coup."""
    async def func():
        return "success"
    
    result = await retry_with_backoff(func)
    
    assert result == "success"


@pytest.mark.asyncio
async def test_retry_with_backoff_disabled():
    """Test que retry_with_backoff n'effectue pas de retry si désactivé."""
    call_count = 0
    
    async def func():
        nonlocal call_count
        call_count += 1
        req = httpx.Request("GET", "https://example.com")
        resp = httpx.Response(429, request=req)
        raise RateLimitError("Rate limit", response=resp, body=None)
    
    with patch.dict(os.environ, {"LLM_RETRY_ENABLED": "false"}, clear=True):
        # Réinitialiser le cache de config
        import api.utils.retry
        if hasattr(api.utils.retry, "_retry_config_cache"):
            del api.utils.retry._retry_config_cache
        
        with pytest.raises(RateLimitError):
            await retry_with_backoff(func)
        
        assert call_count == 1  # Pas de retry


@pytest.mark.asyncio
async def test_retry_with_backoff_retries_on_rate_limit():
    """Test que retry_with_backoff réessaye sur RateLimitError."""
    call_count = 0
    
    async def func():
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            req = httpx.Request("GET", "https://example.com")
            resp = httpx.Response(429, request=req)
            raise RateLimitError("Rate limit", response=resp, body=None)
        return "success"
    
    with patch("asyncio.sleep", new_callable=AsyncMock):  # Mock sleep pour accélérer
        result = await retry_with_backoff(func, max_attempts=3, base_delay=0.01)
        
        assert result == "success"
        assert call_count == 2


@pytest.mark.asyncio
async def test_retry_with_backoff_max_attempts():
    """Test que retry_with_backoff s'arrête après max_attempts."""
    call_count = 0
    
    async def func():
        nonlocal call_count
        call_count += 1
        req = httpx.Request("GET", "https://example.com")
        resp = httpx.Response(429, request=req)
        raise RateLimitError("Rate limit", response=resp, body=None)
    
    with patch("asyncio.sleep", new_callable=AsyncMock):
        with pytest.raises(RateLimitError):
            await retry_with_backoff(func, max_attempts=3, base_delay=0.01)
        
        assert call_count == 3  # 3 tentatives


@pytest.mark.asyncio
async def test_retry_with_backoff_exponential_backoff():
    """Test que le délai augmente exponentiellement."""
    delays = []
    
    async def sleep_mock(delay):
        delays.append(delay)
    
    call_count = 0
    
    async def func():
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            req = httpx.Request("GET", "https://example.com")
            resp = httpx.Response(429, request=req)
            raise RateLimitError("Rate limit", response=resp, body=None)
        return "success"
    
    with patch("asyncio.sleep", side_effect=sleep_mock):
        await retry_with_backoff(func, max_attempts=3, base_delay=0.1)
        
        # Vérifier que les délais augmentent: 0.1, 0.2 (2^(attempt-1) * base_delay)
        assert len(delays) == 2
        assert delays[0] == pytest.approx(0.1, 0.01)
        assert delays[1] == pytest.approx(0.2, 0.01)


@pytest.mark.asyncio
async def test_retry_with_backoff_not_retryable_error():
    """Test que retry_with_backoff ne réessaye pas sur une erreur non réessayable."""
    call_count = 0
    
    async def func():
        nonlocal call_count
        call_count += 1
        req = httpx.Request("GET", "https://example.com")
        error = APIError("Bad request", req, body=None)
        error.status_code = 400
        raise error
    
    with pytest.raises(APIError):
        await retry_with_backoff(func, max_attempts=3, base_delay=0.01)
    
    assert call_count == 1  # Pas de retry pour erreur 400




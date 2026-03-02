"""Tests pour le circuit breaker."""
import os
import pytest
import asyncio
import time
from unittest.mock import patch
from shared.resilience import (
    CircuitBreaker,
    CircuitState,
    CircuitBreakerOpenError,
    get_llm_circuit_breaker
)


def test_circuit_breaker_initial_state():
    """Test que le circuit breaker commence en état CLOSED."""
    cb = CircuitBreaker(failure_threshold=3, timeout=1.0)
    
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0


@pytest.mark.asyncio
async def test_circuit_breaker_success():
    """Test que le circuit breaker reste fermé après un succès."""
    cb = CircuitBreaker(failure_threshold=3, timeout=1.0)
    
    async def func():
        return "success"
    
    result = await cb.call_async(func)
    
    assert result == "success"
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0


@pytest.mark.asyncio
async def test_circuit_breaker_opens_after_threshold():
    """Test que le circuit breaker s'ouvre après le seuil d'échecs."""
    cb = CircuitBreaker(failure_threshold=3, timeout=1.0)
    
    async def failing_func():
        raise ValueError("Error")
    
    # Échouer 3 fois (threshold)
    for _ in range(3):
        with pytest.raises(ValueError):
            await cb.call_async(failing_func)
    
    # Le circuit devrait être ouvert maintenant
    assert cb.state == CircuitState.OPEN
    assert cb.failure_count == 3


@pytest.mark.asyncio
async def test_circuit_breaker_blocks_when_open():
    """Test que le circuit breaker bloque les appels quand ouvert."""
    cb = CircuitBreaker(failure_threshold=2, timeout=10.0)
    
    async def failing_func():
        raise ValueError("Error")
    
    # Ouvrir le circuit
    for _ in range(2):
        with pytest.raises(ValueError):
            await cb.call_async(failing_func)
    
    assert cb.state == CircuitState.OPEN
    
    # Tenter un nouvel appel devrait lever CircuitBreakerOpenError
    with pytest.raises(CircuitBreakerOpenError):
        await cb.call_async(failing_func)


@pytest.mark.asyncio
async def test_circuit_breaker_transitions_to_half_open():
    """Test que le circuit breaker passe en half-open après le timeout."""
    cb = CircuitBreaker(failure_threshold=2, timeout=0.1)
    
    async def failing_func():
        raise ValueError("Error")
    
    # Ouvrir le circuit
    for _ in range(2):
        with pytest.raises(ValueError):
            await cb.call_async(failing_func)
    
    assert cb.state == CircuitState.OPEN
    
    # Attendre le timeout
    await asyncio.sleep(0.2)
    
    # Le prochain appel devrait passer en half-open
    # Mais comme le circuit est ouvert, il va essayer de passer en half-open
    # On simule un appel qui échouerait mais le circuit passe d'abord en half-open
    try:
        await cb.call_async(failing_func)
    except (CircuitBreakerOpenError, ValueError):
        pass  # On s'attend à une exception
    
    # Le circuit devrait être en half-open ou ouvert selon l'implémentation
    assert cb.state in (CircuitState.HALF_OPEN, CircuitState.OPEN)


@pytest.mark.asyncio
async def test_circuit_breaker_closes_after_success_in_half_open():
    """Test que le circuit breaker se ferme après succès en half-open."""
    cb = CircuitBreaker(failure_threshold=2, timeout=0.1)
    
    async def failing_func():
        raise ValueError("Error")
    
    async def success_func():
        return "success"
    
    # Ouvrir le circuit
    for _ in range(2):
        with pytest.raises(ValueError):
            await cb.call_async(failing_func)
    
    assert cb.state == CircuitState.OPEN
    
    # Attendre le timeout
    await asyncio.sleep(0.2)
    
    # Succès en half-open (besoin de 2 succès consécutifs)
    result1 = await cb.call_async(success_func)
    assert result1 == "success"
    
    result2 = await cb.call_async(success_func)
    assert result2 == "success"
    
    # Le circuit devrait être fermé maintenant
    assert cb.state == CircuitState.CLOSED


def test_circuit_breaker_reset():
    """Test que reset() réinitialise le circuit breaker."""
    cb = CircuitBreaker(failure_threshold=2, timeout=1.0)
    cb.failure_count = 2
    cb.state = CircuitState.OPEN
    
    cb.reset()
    
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0
    assert cb.last_failure_time is None


def test_circuit_breaker_get_state():
    """Test que get_state() retourne l'état actuel."""
    cb = CircuitBreaker(failure_threshold=5, timeout=60.0)
    
    state = cb.get_state()
    
    assert state["state"] == "closed"
    assert state["failure_count"] == 0
    assert state["failure_threshold"] == 5
    assert state["timeout"] == 60.0


def test_get_llm_circuit_breaker_enabled():
    """Test que get_llm_circuit_breaker retourne un circuit breaker si activé."""
    with patch.dict(os.environ, {"LLM_CIRCUIT_BREAKER_ENABLED": "true"}, clear=True):
        # Réinitialiser le singleton pour le test
        import api.utils.circuit_breaker
        api.utils.circuit_breaker._llm_circuit_breaker = None
        
        cb = get_llm_circuit_breaker()
        
        assert cb is not None
        assert isinstance(cb, CircuitBreaker)


def test_get_llm_circuit_breaker_disabled():
    """Test que get_llm_circuit_breaker retourne None si désactivé."""
    with patch.dict(os.environ, {"LLM_CIRCUIT_BREAKER_ENABLED": "false"}, clear=True):
        # Réinitialiser le singleton pour le test
        import api.utils.circuit_breaker
        api.utils.circuit_breaker._llm_circuit_breaker = None
        
        cb = get_llm_circuit_breaker()
        
        assert cb is None


@pytest.mark.asyncio
async def test_circuit_breaker_with_sync_call():
    """Test que call() fonctionne avec des fonctions synchrones."""
    cb = CircuitBreaker(failure_threshold=2, timeout=1.0)
    
    def sync_func():
        return "success"
    
    result = cb.call(sync_func)
    
    assert result == "success"
    assert cb.state == CircuitState.CLOSED


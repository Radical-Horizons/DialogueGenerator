"""Circuit breaker pour les appels LLM.

DEPRECATED: Ce module est déprécié. Utilisez shared.resilience.circuit_breaker à la place.
Ce fichier est maintenu pour rétro-compatibilité.
"""
import warnings
from shared.resilience.circuit_breaker import (
    CircuitBreaker,
    CircuitState,
    CircuitBreakerOpenError,
    get_llm_circuit_breaker,
)

warnings.warn(
    "api.utils.circuit_breaker est déprécié. Utilisez shared.resilience.circuit_breaker à la place.",
    DeprecationWarning,
    stacklevel=2
)

__all__ = [
    "CircuitBreaker",
    "CircuitState",
    "CircuitBreakerOpenError",
    "get_llm_circuit_breaker",
]







"""Logique de retry avec exponential backoff pour les appels LLM.

DEPRECATED: Ce module est déprécié. Utilisez shared.resilience.retry à la place.
Ce fichier est maintenu pour rétro-compatibilité.
"""
import warnings
from shared.resilience.retry import (
    retry_with_backoff,
    with_retry,
    is_retryable_error,
    get_retry_config,
)

warnings.warn(
    "api.utils.retry est déprécié. Utilisez shared.resilience.retry à la place.",
    DeprecationWarning,
    stacklevel=2
)

__all__ = [
    "retry_with_backoff",
    "with_retry",
    "is_retryable_error",
    "get_retry_config",
]







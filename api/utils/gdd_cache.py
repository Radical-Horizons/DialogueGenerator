"""Cache intelligent pour les données GDD avec invalidation basée sur mtime.

DEPRECATED: Ce module est déprécié. Utilisez shared.caches.gdd_cache à la place.
Ce fichier est maintenu pour rétro-compatibilité.
"""
import warnings
from shared.caches.gdd_cache import (
    GDDCache,
    GDDCacheEntry,
    get_gdd_cache,
)

warnings.warn(
    "api.utils.gdd_cache est déprécié. Utilisez shared.caches.gdd_cache à la place.",
    DeprecationWarning,
    stacklevel=2
)

__all__ = [
    "GDDCache",
    "GDDCacheEntry",
    "get_gdd_cache",
]




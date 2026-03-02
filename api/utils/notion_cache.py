"""Cache pour les données Notion avec stockage fichier JSON local.

DEPRECATED: Ce module est déprécié. Utilisez shared.caches.notion_cache à la place.
Ce fichier est maintenu pour rétro-compatibilité.
"""
import warnings
from shared.caches.notion_cache import (
    NotionCache,
    get_notion_cache,
)

warnings.warn(
    "api.utils.notion_cache est déprécié. Utilisez shared.caches.notion_cache à la place.",
    DeprecationWarning,
    stacklevel=2
)

__all__ = [
    "NotionCache",
    "get_notion_cache",
]


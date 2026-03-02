"""Cache implementations for external data sources.

Provides:
- GDDCache: Cache for GDD files with mtime-based invalidation
- NotionCache: Cache for Notion data with file-based persistence
"""

from shared.caches.gdd_cache import GDDCache, GDDCacheEntry, get_gdd_cache
from shared.caches.notion_cache import NotionCache, get_notion_cache

__all__ = [
    "GDDCache",
    "GDDCacheEntry",
    "get_gdd_cache",
    "NotionCache",
    "get_notion_cache",
]

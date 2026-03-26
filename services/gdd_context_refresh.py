"""Point d'entrée unique pour invalider les caches runtime liés au GDD (Story 3.9)."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def clear_gdd_runtime_caches() -> None:
    """Vide le cache fichier GDD de l'API si le module est chargé.

    Utilisé après sync Notion réussie ; ne lève pas si l'import échoue.
    """
    try:
        from api.utils.gdd_cache import get_gdd_cache

        get_gdd_cache().clear()
    except (ImportError, AttributeError, OSError) as exc:
        logger.debug("clear_gdd_runtime_caches: ignoré (%s)", exc)


def reload_context_builder_if_loaded(container: Any) -> None:
    """Recharge les fichiers GDD sur le ContextBuilder du container si présent.

    Args:
        container: Instance ``ServiceContainer`` (API) ou objet avec
            ``_context_builder`` et ``get_context_builder``.
    """
    try:
        cb = container.get_context_builder()
        cb.load_gdd_files()
    except (AttributeError, OSError, RuntimeError) as exc:
        logger.debug("reload_context_builder_if_loaded: ignoré (%s)", exc)

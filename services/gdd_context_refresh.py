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
    try:
        from services.gdd_context_precompile import clear_precompile_context_builder

        clear_precompile_context_builder()
    except ImportError as exc:
        logger.debug("clear_precompile_context_builder: ignoré (%s)", exc)


def reload_context_builder_if_loaded(container: Any) -> None:
    """Recharge les fichiers GDD sur le ContextBuilder **déjà initialisé** du container.

    N'appelle pas ``get_context_builder()`` si l'instance n'existe pas encore : évite un
    double chargement au démarrage lorsque la sync Notion précède toute requête contexte.

    Args:
        container: Instance ``ServiceContainer`` (API) avec attribut ``_context_builder``.
    """
    try:
        existing = getattr(container, "_context_builder", None)
        if existing is None:
            return
        existing.load_gdd_files()
    except (AttributeError, OSError, RuntimeError) as exc:
        logger.debug("reload_context_builder_if_loaded: ignoré (%s)", exc)

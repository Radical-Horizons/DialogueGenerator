"""Configuration des métriques Prometheus pour l'API."""
import os
import logging
from typing import Optional
from prometheus_fastapi_instrumentator import Instrumentator

logger = logging.getLogger(__name__)


def setup_prometheus_metrics(app) -> Optional[Instrumentator]:
    """Configure les métriques Prometheus pour l'application FastAPI.
    
    Args:
        app: L'application FastAPI.
        
    Returns:
        Instance d'Instrumentator si activé, None sinon.
    """
    _prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
    _default_metrics = "false" if _prod else "true"
    enabled = os.getenv("PROMETHEUS_ENABLED", _default_metrics).lower() in ("true", "1", "yes")
    
    if not enabled:
        logger.info("Métriques Prometheus désactivées")
        return None
    
    try:
        instrumentator = Instrumentator()
        instrumentator.instrument(app).expose(app, endpoint="/metrics")
        
        logger.info("Métriques Prometheus activées (endpoint: /metrics)")
        return instrumentator
    
    except Exception as e:
        logger.warning(f"Impossible d'initialiser Prometheus: {e}. Continuation sans métriques.")
        return None







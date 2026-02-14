"""Configuration Sentry pour le tracking d'erreurs."""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_sentry_initialized = False

# Import optionnel au niveau module pour permettre le patching en tests
# (ex: patch("api.utils.sentry_config.sentry_sdk")).
try:
    import sentry_sdk  # type: ignore
    from sentry_sdk.integrations.fastapi import FastApiIntegration  # type: ignore
    from sentry_sdk.integrations.asyncio import AsyncioIntegration  # type: ignore
except ImportError:  # pragma: no cover
    sentry_sdk = None  # type: ignore
    FastApiIntegration = None  # type: ignore
    AsyncioIntegration = None  # type: ignore


def init_sentry() -> bool:
    """Initialise Sentry si configuré.
    
    Returns:
        True si Sentry a été initialisé, False sinon.
    """
    global _sentry_initialized
    
    if _sentry_initialized:
        return True
    
    sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
    
    if not sentry_dsn:
        # Ne pas logger si Sentry n'est pas configuré (c'est normal en développement)
        # logger.debug("Sentry DSN non configuré. Sentry désactivé.")
        return False
    
    try:
        # Vérifier explicitement la disponibilité au runtime.
        # Utile en tests où `__import__` est patché pour simuler l'absence de sentry-sdk.
        try:
            __import__("sentry_sdk")
        except ImportError:
            raise

        if sentry_sdk is None or FastApiIntegration is None or AsyncioIntegration is None:
            raise ImportError("sentry-sdk non disponible")
        
        environment = os.getenv("SENTRY_ENVIRONMENT", os.getenv("ENVIRONMENT", "development"))
        traces_sample_rate = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1"))
        
        # Ne pas envoyer d'exceptions en développement sauf si explicitement activé
        if environment == "development" and not os.getenv("SENTRY_ENABLE_IN_DEV", "").lower() in ("true", "1", "yes"):
            logger.info("Sentry désactivé en développement (utilisez SENTRY_ENABLE_IN_DEV=true pour activer)")
            return False
        
        sentry_sdk.init(
            dsn=sentry_dsn,
            environment=environment,
            traces_sample_rate=traces_sample_rate,
            integrations=[
                FastApiIntegration(),
                AsyncioIntegration()
            ],
            # Filtrer les informations sensibles
            before_send=lambda event, _hint: filter_sensitive_data(event)
        )
        
        _sentry_initialized = True
        logger.info(f"Sentry initialisé pour l'environnement: {environment}")
        return True
    
    except ImportError:
        logger.warning("sentry-sdk non installé. Sentry désactivé.")
        return False
    except Exception as e:
        logger.error(f"Erreur lors de l'initialisation de Sentry: {e}")
        return False


def filter_sensitive_data(event: dict) -> Optional[dict]:
    """Filtre les données sensibles de l'événement Sentry.
    
    Args:
        event: L'événement Sentry.
        
    Returns:
        L'événement filtré ou None pour ignorer l'événement.
    """
    # Filtrer les tokens et clés API
    if "request" in event:
        headers = event.get("request", {}).get("headers", {})
        sensitive_keys = ["authorization", "x-api-key", "api-key", "token"]
        for key in sensitive_keys:
            if key in headers:
                headers[key] = "[Filtered]"
    
    # Filtrer les données utilisateur sensibles (optionnel)
    # On garde user_id mais on peut filtrer d'autres champs si nécessaire
    
    return event


def capture_exception(error: Exception, **kwargs) -> None:
    """Capture une exception dans Sentry.
    
    Args:
        error: L'exception à capturer.
        **kwargs: Contexte supplémentaire (request_id, user_id, etc.).
    """
    if not _sentry_initialized:
        return
    
    try:
        if sentry_sdk is None:
            return
        
        # Ajouter le contexte
        with sentry_sdk.push_scope() as scope:
            for key, value in kwargs.items():
                scope.set_tag(key, value)
            
            sentry_sdk.capture_exception(error)
    
    except Exception as e:
        logger.warning(f"Erreur lors de l'envoi d'exception à Sentry: {e}")




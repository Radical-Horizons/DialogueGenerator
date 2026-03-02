"""Logique de retry avec exponential backoff pour les appels externes.

Ce module peut être utilisé par n'importe quelle couche (core, services, API).
"""
import os
import logging
import asyncio
from typing import Callable, TypeVar, Optional, Any
from functools import wraps

logger = logging.getLogger(__name__)

T = TypeVar('T')


def is_retryable_error(error: Exception) -> bool:
    """Détermine si une erreur est réessayable.
    
    Args:
        error: L'exception à vérifier.
        
    Returns:
        True si l'erreur est réessayable, False sinon.
    """
    try:
        from openai import RateLimitError, APITimeoutError, APIConnectionError, APIError
        
        if isinstance(error, (RateLimitError, APITimeoutError, APIConnectionError)):
            return True
        
        if isinstance(error, APIError):
            status_code = getattr(error, "status_code", None)
            if status_code in (429, 500, 502, 503, 504):
                return True
    except ImportError:
        pass
    
    error_str = str(error).lower()
    if any(keyword in error_str for keyword in ["timeout", "connection", "network", "rate limit"]):
        return True
    
    return False


def get_retry_config() -> dict:
    """Retourne la configuration de retry depuis les variables d'environnement.
    
    Returns:
        Dictionnaire avec la configuration de retry.
    """
    return {
        "enabled": os.getenv("LLM_RETRY_ENABLED", "true").lower() in ("true", "1", "yes"),
        "max_attempts": int(os.getenv("LLM_RETRY_MAX_ATTEMPTS", "3")),
        "base_delay": float(os.getenv("LLM_RETRY_BASE_DELAY", "1.0"))
    }


async def retry_with_backoff(
    func: Callable[..., Any],
    *args: Any,
    max_attempts: Optional[int] = None,
    base_delay: Optional[float] = None,
    **kwargs: Any
) -> Any:
    """Exécute une fonction avec retry et exponential backoff.
    
    Args:
        func: La fonction async à exécuter.
        *args: Arguments positionnels pour la fonction.
        max_attempts: Nombre maximum de tentatives (si None, utilise la config).
        base_delay: Délai de base en secondes (si None, utilise la config).
        **kwargs: Arguments nommés pour la fonction.
        
    Returns:
        Résultat de la fonction.
        
    Raises:
        La dernière exception si toutes les tentatives échouent.
    """
    config = get_retry_config()
    
    if not config["enabled"]:
        return await func(*args, **kwargs)
    
    max_attempts = max_attempts or config["max_attempts"]
    base_delay = base_delay or config["base_delay"]
    
    last_exception = None
    
    for attempt in range(1, max_attempts + 1):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            
            if not is_retryable_error(e):
                logger.debug(f"Erreur non réessayable: {type(e).__name__}. Pas de retry.")
                raise
            
            if attempt >= max_attempts:
                logger.warning(
                    f"Toutes les tentatives ({max_attempts}) ont échoué. "
                    f"Dernière erreur: {type(e).__name__}: {str(e)}"
                )
                raise
            
            delay = base_delay * (2 ** (attempt - 1))
            
            logger.info(
                f"Tentative {attempt}/{max_attempts} échouée: {type(e).__name__}. "
                f"Retry dans {delay:.2f}s..."
            )
            
            await asyncio.sleep(delay)
    
    if last_exception:
        raise last_exception


def with_retry(
    max_attempts: Optional[int] = None,
    base_delay: Optional[float] = None
):
    """Décorateur pour ajouter retry avec exponential backoff à une fonction async.
    
    Args:
        max_attempts: Nombre maximum de tentatives (si None, utilise la config).
        base_delay: Délai de base en secondes (si None, utilise la config).
        
    Returns:
        Décorateur.
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            return await retry_with_backoff(
                func,
                *args,
                max_attempts=max_attempts,
                base_delay=base_delay,
                **kwargs
            )
        return wrapper
    return decorator

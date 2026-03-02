"""Circuit breaker pour les appels externes.

Ce module peut être utilisé par n'importe quelle couche (core, services, API).
"""
import os
import logging
import time
from typing import Callable, TypeVar, Optional, Any
from enum import Enum

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CircuitState(Enum):
    """État du circuit breaker."""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Circuit breaker pour protéger contre les appels répétés en cas d'erreurs.
    
    Le circuit breaker s'ouvre après un certain nombre d'échecs consécutifs,
    bloquant les appels pendant un délai, puis passant en half-open pour tester
    si le service est de nouveau disponible.
    """
    
    def __init__(
        self,
        failure_threshold: int = 5,
        timeout: float = 60.0,
        name: str = "circuit"
    ):
        """Initialise le circuit breaker.
        
        Args:
            failure_threshold: Nombre d'échecs consécutifs avant ouverture.
            timeout: Délai en secondes avant tentative de réouverture (half-open).
            name: Nom du circuit breaker (pour le logging).
        """
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.name = name
        
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.success_count = 0
        
    def call(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """Exécute une fonction avec protection du circuit breaker.
        
        Args:
            func: La fonction à exécuter.
            *args: Arguments positionnels.
            **kwargs: Arguments nommés.
            
        Returns:
            Résultat de la fonction.
            
        Raises:
            CircuitBreakerOpenError: Si le circuit est ouvert.
            L'exception de la fonction si elle échoue.
        """
        if self.state == CircuitState.OPEN:
            if self.last_failure_time and (time.time() - self.last_failure_time) >= self.timeout:
                logger.info(f"Circuit breaker '{self.name}' passe en HALF_OPEN pour test")
                self.state = CircuitState.HALF_OPEN
                self.success_count = 0
            else:
                raise CircuitBreakerOpenError(
                    f"Circuit breaker '{self.name}' est ouvert. "
                    f"Attendre {self.timeout - (time.time() - self.last_failure_time):.1f}s avant retry."
                )
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception:
            self._on_failure()
            raise
    
    async def call_async(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """Exécute une fonction async avec protection du circuit breaker.
        
        Args:
            func: La fonction async à exécuter.
            *args: Arguments positionnels.
            **kwargs: Arguments nommés.
            
        Returns:
            Résultat de la fonction.
            
        Raises:
            CircuitBreakerOpenError: Si le circuit est ouvert.
            L'exception de la fonction si elle échoue.
        """
        if self.state == CircuitState.OPEN:
            if self.last_failure_time and (time.time() - self.last_failure_time) >= self.timeout:
                logger.info(f"Circuit breaker '{self.name}' passe en HALF_OPEN pour test")
                self.state = CircuitState.HALF_OPEN
                self.success_count = 0
            else:
                raise CircuitBreakerOpenError(
                    f"Circuit breaker '{self.name}' est ouvert. "
                    f"Attendre {self.timeout - (time.time() - self.last_failure_time):.1f}s avant retry."
                )
        
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception:
            self._on_failure()
            raise
    
    def _on_success(self) -> None:
        """Gère un succès."""
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= 2:
                logger.info(f"Circuit breaker '{self.name}' se FERME (succès consécutifs)")
                self.state = CircuitState.CLOSED
                self.failure_count = 0
                self.last_failure_time = None
        else:
            self.failure_count = 0
            self.last_failure_time = None
    
    def _on_failure(self) -> None:
        """Gère un échec."""
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.state == CircuitState.HALF_OPEN:
            logger.warning(f"Circuit breaker '{self.name}' se RÉOUVRE (échec en half-open)")
            self.state = CircuitState.OPEN
        elif self.failure_count >= self.failure_threshold:
            logger.warning(
                f"Circuit breaker '{self.name}' s'OUVRE "
                f"({self.failure_count} échecs consécutifs >= {self.failure_threshold})"
            )
            self.state = CircuitState.OPEN
    
    def reset(self) -> None:
        """Réinitialise le circuit breaker."""
        logger.info(f"Circuit breaker '{self.name}' réinitialisé")
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        self.success_count = 0
    
    def get_state(self) -> dict:
        """Retourne l'état actuel du circuit breaker.
        
        Returns:
            Dictionnaire avec l'état du circuit breaker.
        """
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "last_failure_time": self.last_failure_time,
            "failure_threshold": self.failure_threshold,
            "timeout": self.timeout
        }


class CircuitBreakerOpenError(Exception):
    """Exception levée lorsque le circuit breaker est ouvert."""
    pass


_llm_circuit_breaker: Optional[CircuitBreaker] = None


def get_llm_circuit_breaker() -> Optional[CircuitBreaker]:
    """Retourne l'instance globale du circuit breaker LLM.
    
    Returns:
        Instance de CircuitBreaker ou None si désactivé.
    """
    global _llm_circuit_breaker
    
    enabled = os.getenv("LLM_CIRCUIT_BREAKER_ENABLED", "true").lower() in ("true", "1", "yes")
    
    if not enabled:
        return None
    
    if _llm_circuit_breaker is None:
        failure_threshold = int(os.getenv("LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5"))
        timeout = float(os.getenv("LLM_CIRCUIT_BREAKER_TIMEOUT", "60.0"))
        
        _llm_circuit_breaker = CircuitBreaker(
            failure_threshold=failure_threshold,
            timeout=timeout,
            name="llm_circuit"
        )
        
        logger.info(
            f"Circuit breaker LLM initialisé: threshold={failure_threshold}, timeout={timeout}s"
        )
    
    return _llm_circuit_breaker

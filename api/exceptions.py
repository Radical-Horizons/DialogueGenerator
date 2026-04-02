"""Exceptions personnalisées pour l'API REST."""
import logging
from typing import Optional, Dict, Any
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


class APIException(HTTPException):
    """Exception de base pour l'API.
    
    Toutes les exceptions API héritent de cette classe pour une gestion
    centralisée et cohérente des erreurs.
    """
    
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None
    ):
        """Initialise une exception API.
        
        Args:
            status_code: Code de statut HTTP.
            code: Code d'erreur personnalisé (ex: "VALIDATION_ERROR").
            message: Message d'erreur lisible par l'utilisateur.
            details: Détails supplémentaires de l'erreur.
            request_id: ID de la requête pour le traçage.
        """
        self.code = code
        self.details = details or {}
        self.request_id = request_id
        
        super().__init__(status_code=status_code, detail=message)
        logger.error(f"APIException [{code}]: {message} (request_id: {request_id})")
        
        # Envoyer à Sentry si disponible (seulement pour les erreurs 500+)
        if status_code >= 500:
            try:
                from api.utils.sentry_config import capture_exception
                capture_exception(self, request_id=request_id, error_code=code)
            except Exception:
                pass  # Ne pas échouer si Sentry n'est pas disponible


class ValidationException(APIException):
    """Exception levée lors d'erreurs de validation."""
    
    def __init__(
        self,
        message: str = "Erreur de validation",
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        code: str = "VALIDATION_ERROR",
    ):
        """Initialise une exception de validation.
        
        Args:
            message: Message d'erreur.
            details: Détails des erreurs de validation (champs, messages).
            request_id: ID de la requête.
            code: Code d'erreur (ex. "missing_choice_id" pour document v1.1.0 sans choiceId).
        """
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code=code,
            message=message,
            details=details or {},
            request_id=request_id
        )


class AuthenticationException(APIException):
    """Exception levée lors d'erreurs d'authentification."""
    
    def __init__(
        self,
        message: str = "Authentification requise",
        request_id: Optional[str] = None
    ):
        """Initialise une exception d'authentification.
        
        Args:
            message: Message d'erreur.
            request_id: ID de la requête.
        """
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTHENTICATION_ERROR",
            message=message,
            request_id=request_id
        )


class AuthorizationException(APIException):
    """Exception levée lors d'erreurs d'autorisation."""
    
    def __init__(
        self,
        message: str = "Accès non autorisé",
        request_id: Optional[str] = None
    ):
        """Initialise une exception d'autorisation.
        
        Args:
            message: Message d'erreur.
            request_id: ID de la requête.
        """
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            code="AUTHORIZATION_ERROR",
            message=message,
            request_id=request_id
        )


class NotFoundException(APIException):
    """Exception levée lorsqu'une ressource n'est pas trouvée."""
    
    def __init__(
        self,
        resource_type: str = "Ressource",
        resource_id: Optional[str] = None,
        request_id: Optional[str] = None
    ):
        """Initialise une exception de ressource non trouvée.
        
        Args:
            resource_type: Type de ressource (ex: "Dialogue", "Personnage").
            resource_id: ID de la ressource non trouvée.
            request_id: ID de la requête.
        """
        message = f"{resource_type} non trouvé"
        if resource_id:
            message += f" (ID: {resource_id})"
        
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code="NOT_FOUND",
            message=message,
            details={"resource_type": resource_type, "resource_id": resource_id},
            request_id=request_id
        )


class InternalServerException(APIException):
    """Exception levée lors d'erreurs internes du serveur."""
    
    def __init__(
        self,
        message: str = "Erreur interne du serveur",
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None
    ):
        """Initialise une exception d'erreur interne.
        
        Args:
            message: Message d'erreur générique (ne pas exposer de détails en production).
            details: Détails pour le logging (non exposés au client en production).
            request_id: ID de la requête.
        """
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code="INTERNAL_ERROR",
            message=message,
            details=details,
            request_id=request_id
        )


class AllLLMProvidersUnavailableError(APIException):
    """Tous les providers LLM de la chaîne ont échoué (Story 1.16)."""

    def __init__(
        self,
        message: str = "Tous les providers LLM sont indisponibles",
        request_id: Optional[str] = None,
    ):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="ALL_LLM_PROVIDERS_UNAVAILABLE",
            message=message,
            request_id=request_id,
        )


class OpenAIException(APIException):
    """Exception levée lors d'erreurs OpenAI avec codes spécifiques."""
    
    def __init__(
        self,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None
    ):
        """Initialise une exception OpenAI.
        
        Args:
            code: Code d'erreur OpenAI (OPENAI_RATE_LIMIT, OPENAI_TIMEOUT, etc.).
            message: Message d'erreur lisible.
            details: Détails de l'erreur.
            request_id: ID de la requête.
        """
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,  # 502 car c'est une erreur du service externe
            code=code,
            message=message,
            details=details,
            request_id=request_id
        )

"""Domain-level exceptions (API-agnostic).

Ces exceptions sont utilisables par n'importe quelle couche (core, services)
sans dépendre de FastAPI ou d'autres frameworks HTTP.
"""
from typing import Optional, Dict, Any


class DomainException(Exception):
    """Exception de base pour le domaine métier.
    
    Toutes les exceptions métier héritent de cette classe.
    """
    
    def __init__(
        self,
        message: str,
        code: str = "DOMAIN_ERROR",
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None
    ):
        """Initialise une exception de domaine.
        
        Args:
            message: Message d'erreur lisible.
            code: Code d'erreur (ex: "VALIDATION_ERROR").
            details: Détails supplémentaires.
            request_id: ID de la requête pour le traçage.
        """
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}
        self.request_id = request_id
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit l'exception en dictionnaire.
        
        Returns:
            Dictionnaire avec les détails de l'exception.
        """
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
            "request_id": self.request_id
        }


class ValidationError(DomainException):
    """Erreur de validation métier."""
    
    def __init__(
        self,
        message: str = "Erreur de validation",
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None
    ):
        """Initialise une erreur de validation.
        
        Args:
            message: Message d'erreur.
            details: Détails des erreurs de validation.
            request_id: ID de la requête.
        """
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            details=details,
            request_id=request_id
        )


class GenerationError(DomainException):
    """Erreur lors de la génération de contenu."""
    
    def __init__(
        self,
        message: str = "Erreur de génération",
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None
    ):
        """Initialise une erreur de génération.
        
        Args:
            message: Message d'erreur.
            details: Détails de l'erreur.
            request_id: ID de la requête.
        """
        super().__init__(
            message=message,
            code="GENERATION_ERROR",
            details=details,
            request_id=request_id
        )


class ResourceNotFoundError(DomainException):
    """Erreur lorsqu'une ressource n'est pas trouvée."""
    
    def __init__(
        self,
        resource_type: str = "Ressource",
        resource_id: Optional[str] = None,
        request_id: Optional[str] = None
    ):
        """Initialise une erreur de ressource non trouvée.
        
        Args:
            resource_type: Type de ressource (ex: "Personnage").
            resource_id: ID de la ressource.
            request_id: ID de la requête.
        """
        message = f"{resource_type} non trouvé"
        if resource_id:
            message += f" (ID: {resource_id})"
        
        super().__init__(
            message=message,
            code="NOT_FOUND",
            details={"resource_type": resource_type, "resource_id": resource_id},
            request_id=request_id
        )


class ConfigurationError(DomainException):
    """Erreur de configuration."""
    
    def __init__(
        self,
        message: str = "Erreur de configuration",
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None
    ):
        """Initialise une erreur de configuration.
        
        Args:
            message: Message d'erreur.
            details: Détails de l'erreur.
            request_id: ID de la requête.
        """
        super().__init__(
            message=message,
            code="CONFIGURATION_ERROR",
            details=details,
            request_id=request_id
        )


class LLMError(DomainException):
    """Erreur lors d'un appel au LLM."""
    
    def __init__(
        self,
        message: str = "Erreur LLM",
        code: str = "LLM_ERROR",
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None
    ):
        """Initialise une erreur LLM.
        
        Args:
            message: Message d'erreur.
            code: Code d'erreur spécifique (ex: "LLM_RATE_LIMIT").
            details: Détails de l'erreur.
            request_id: ID de la requête.
        """
        super().__init__(
            message=message,
            code=code,
            details=details,
            request_id=request_id
        )

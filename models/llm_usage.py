"""Modèles de données pour le suivi de l'utilisation des LLM."""
from datetime import datetime, UTC
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, field_serializer


class LLMUsageRecord(BaseModel):
    """Enregistrement d'une utilisation LLM.
    
    Représente un appel LLM avec toutes les métriques associées.
    """
    request_id: str = Field(..., description="ID de la requête API")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC), description="Horodatage de l'appel")
    model_name: str = Field(..., description="Modèle utilisé (ex: gpt-4o, gpt-4-turbo)")
    prompt_tokens: int = Field(..., ge=0, description="Nombre de tokens dans le prompt")
    completion_tokens: int = Field(..., ge=0, description="Nombre de tokens dans la réponse")
    total_tokens: int = Field(..., ge=0, description="Nombre total de tokens")
    estimated_cost: float = Field(..., ge=0.0, description="Coût estimé en USD")
    duration_ms: int = Field(..., ge=0, description="Durée de l'appel en millisecondes")
    success: bool = Field(..., description="Indique si l'appel a réussi")
    endpoint: str = Field(..., description="Endpoint appelé (ex: generate/variants, generate/interactions)")
    k_variants: int = Field(default=1, ge=1, description="Nombre de variantes générées")
    error_message: Optional[str] = Field(default=None, description="Message d'erreur si success=False")
    dialogue_id: Optional[str] = Field(default=None, description="ID du dialogue associé (annotation post-hoc)")
    node_id: Optional[str] = Field(default=None, description="ID du nœud généré associé (annotation post-hoc)")
    deleted: bool = Field(default=False, description="Nœud supprimé du graphe (marqué lors du rejet)")
    prompt: Optional[str] = Field(default=None, description="Prompt complet envoyé au LLM (Story 1.15)")
    response: Optional[str] = Field(default=None, description="Réponse brute du LLM (Story 1.15)")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "request_id": "req_123456",
                "timestamp": "2024-01-15T10:30:00Z",
                "model_name": "gpt-4o",
                "prompt_tokens": 1500,
                "completion_tokens": 500,
                "total_tokens": 2000,
                "estimated_cost": 0.0125,
                "duration_ms": 2500,
                "success": True,
                "endpoint": "generate/variants",
                "k_variants": 3,
                "error_message": None
            }
        }
    )
    
    @field_serializer('timestamp')
    def serialize_timestamp(self, value: datetime) -> str:
        """Sérialise datetime en ISO format."""
        return value.isoformat()


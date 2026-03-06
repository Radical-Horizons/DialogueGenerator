"""Schémas Pydantic pour les endpoints de suivi LLM."""
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict, field_serializer


class LLMUsageRecordResponse(BaseModel):
    """Schéma de réponse pour un enregistrement d'utilisation LLM."""
    request_id: str = Field(..., description="ID de la requête API")
    timestamp: datetime = Field(..., description="Horodatage de l'appel")
    model_name: str = Field(..., description="Modèle utilisé")
    prompt_tokens: int = Field(..., ge=0, description="Nombre de tokens dans le prompt")
    completion_tokens: int = Field(..., ge=0, description="Nombre de tokens dans la réponse")
    total_tokens: int = Field(..., ge=0, description="Nombre total de tokens")
    estimated_cost: float = Field(..., ge=0.0, description="Coût estimé en USD")
    duration_ms: int = Field(..., ge=0, description="Durée de l'appel en millisecondes")
    success: bool = Field(..., description="Indique si l'appel a réussi")
    endpoint: str = Field(..., description="Endpoint appelé")
    k_variants: int = Field(..., ge=1, description="Nombre de variantes générées")
    error_message: Optional[str] = Field(default=None, description="Message d'erreur si success=False")
    dialogue_id: Optional[str] = Field(default=None, description="ID du dialogue associé")
    node_id: Optional[str] = Field(default=None, description="ID du nœud généré associé")
    
    model_config = ConfigDict()
    
    @field_serializer('timestamp')
    def serialize_timestamp(self, value: datetime) -> str:
        """Sérialise datetime en ISO format."""
        return value.isoformat() if isinstance(value, datetime) else str(value)


class NodeCostEntry(BaseModel):
    """Détail du coût pour un nœud généré."""

    node_id: Optional[str] = Field(default=None, description="ID du nœud généré")
    timestamp: str = Field(..., description="Horodatage de la génération (ISO)")
    model_name: str = Field(..., description="Modèle utilisé")
    prompt_tokens: int = Field(..., ge=0, description="Tokens prompt")
    completion_tokens: int = Field(..., ge=0, description="Tokens completion")
    cost_eur: float = Field(..., ge=0.0, description="Coût en EUR")
    success: bool = Field(..., description="Génération réussie")
    deleted: bool = Field(default=False, description="Nœud supprimé du graphe")


class DialogueCostResponse(BaseModel):
    """Réponse agrégée des coûts pour un dialogue."""

    dialogue_id: str = Field(..., description="ID du dialogue")
    total_cost_eur: float = Field(..., ge=0.0, description="Coût total en EUR")
    node_count: int = Field(..., ge=0, description="Nombre de nœuds générés")
    avg_cost_per_node_eur: float = Field(..., ge=0.0, description="Coût moyen par nœud en EUR")
    breakdown: List[NodeCostEntry] = Field(..., description="Détail par nœud, trié par timestamp")


class DialogueCostSummaryEntry(BaseModel):
    """Résumé des coûts pour un dialogue (vue multi-dialogues AC#3)."""

    dialogue_id: str = Field(..., description="ID du dialogue")
    total_cost_eur: float = Field(..., ge=0.0, description="Coût total en EUR")
    node_count: int = Field(..., ge=0, description="Nombre de nœuds générés")
    avg_cost_per_node_eur: float = Field(..., ge=0.0, description="Coût moyen par nœud en EUR")


class AllDialoguesCostResponse(BaseModel):
    """Réponse listant tous les dialogues triés par coût décroissant (AC#3)."""

    dialogues: List[DialogueCostSummaryEntry] = Field(
        ..., description="Liste des dialogues triés par coût total décroissant"
    )
    total_dialogues: int = Field(..., ge=0, description="Nombre de dialogues avec coûts trackés")


class LLMUsageHistoryResponse(BaseModel):
    """Réponse paginée avec liste d'enregistrements d'utilisation."""
    records: List[LLMUsageRecordResponse] = Field(..., description="Liste des enregistrements")
    total: int = Field(..., ge=0, description="Nombre total d'enregistrements")
    page: int = Field(..., ge=1, description="Numéro de page actuelle")
    page_size: int = Field(..., ge=1, description="Taille de la page")
    total_pages: int = Field(..., ge=0, description="Nombre total de pages")


class LLMUsageStatisticsResponse(BaseModel):
    """Statistiques agrégées d'utilisation LLM."""
    total_tokens: int = Field(..., ge=0, description="Nombre total de tokens")
    total_prompt_tokens: int = Field(..., ge=0, description="Nombre total de tokens de prompt")
    total_completion_tokens: int = Field(..., ge=0, description="Nombre total de tokens de completion")
    total_cost: float = Field(..., ge=0.0, description="Coût total estimé en USD")
    calls_count: int = Field(..., ge=0, description="Nombre total d'appels")
    success_count: int = Field(..., ge=0, description="Nombre d'appels réussis")
    error_count: int = Field(..., ge=0, description="Nombre d'appels en erreur")
    success_rate: float = Field(..., ge=0.0, le=100.0, description="Taux de succès en pourcentage")
    avg_duration_ms: float = Field(..., ge=0.0, description="Durée moyenne en millisecondes")
    start_date: Optional[date] = Field(default=None, description="Date de début de la période")
    end_date: Optional[date] = Field(default=None, description="Date de fin de la période")
    model_name: Optional[str] = Field(default=None, description="Modèle filtré (si applicable)")
    
    model_config = ConfigDict()
    
    @field_serializer('start_date', 'end_date')
    def serialize_date(self, value: Optional[date]) -> Optional[str]:
        """Sérialise date en ISO format."""
        return value.isoformat() if value else None


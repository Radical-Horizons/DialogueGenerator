"""Schémas Pydantic pour les endpoints de suivi LLM."""
from datetime import datetime, date
from typing import Dict, List, Optional
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
    fallback_from: Optional[str] = Field(default=None, description="Provider initial en échec si fallback utilisé (Story 1.16)")
    fallback_reason: Optional[str] = Field(default=None, description="Raison de l'échec du provider initial (Story 1.16)")


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


class GenerationLogEntry(BaseModel):
    """Une entrée de log de génération pour le panneau Logs (Story 1.15)."""
    request_id: str = Field(..., description="ID de la requête API")
    timestamp: datetime = Field(..., description="Horodatage de la génération")
    node_id: Optional[str] = Field(default=None, description="ID du nœud généré")
    model_name: str = Field(..., description="Modèle / provider utilisé")
    prompt_tokens: int = Field(..., ge=0, description="Tokens prompt")
    completion_tokens: int = Field(..., ge=0, description="Tokens completion")
    total_tokens: int = Field(..., ge=0, description="Total tokens")
    estimated_cost: float = Field(..., ge=0.0, description="Coût estimé USD")
    cost_eur: float = Field(..., ge=0.0, description="Coût en EUR")
    duration_ms: int = Field(..., ge=0, description="Durée en ms")
    success: bool = Field(..., description="Génération réussie")
    error_message: Optional[str] = Field(default=None, description="Message d'erreur si échec")
    prompt: Optional[str] = Field(default=None, description="Prompt complet envoyé au LLM")
    response: Optional[str] = Field(default=None, description="Réponse brute du LLM")
    fallback_from: Optional[str] = Field(default=None, description="Provider initial en échec si fallback utilisé (Story 1.16)")
    fallback_reason: Optional[str] = Field(default=None, description="Raison de l'échec du provider initial (Story 1.16)")

    @field_serializer('timestamp')
    def serialize_timestamp(self, value: datetime) -> str:
        return value.isoformat() if isinstance(value, datetime) else str(value)


class GenerationLogsResponse(BaseModel):
    """Réponse GET /dialogue/{id}/generation-logs (Story 1.15)."""
    entries: List[GenerationLogEntry] = Field(..., description="Logs de génération, plus récent en premier")
    total_count: int = Field(..., ge=0, description="Nombre total d'entrées")
    total_cost_eur: float = Field(..., ge=0.0, description="Coût total de la période en EUR")


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


class ContextRelevanceReportResponse(BaseModel):
    """Rapport de pertinence contexte GDD pour un nœud (Story 3.6)."""

    dialogue_id: str = Field(..., description="ID du dialogue")
    node_id: str = Field(..., description="ID du nœud")
    request_id: Optional[str] = Field(default=None, description="Requête LLM associée si connue")
    score_percent: float = Field(..., ge=0.0, le=100.0, description="Score global 0–100")
    breakdown_by_type: Dict[str, float] = Field(
        default_factory=dict,
        description="Score par type d’entité (0–100)",
    )
    reflected_types: List[str] = Field(
        default_factory=list,
        description="Types avec recouvrement fort",
    )
    weak_types: List[str] = Field(
        default_factory=list,
        description="Types peu ou pas reflétés dans la sortie",
    )
    low_context_warning: bool = Field(..., description="True si score sous le seuil produit")
    low_threshold_percent: float = Field(..., ge=0.0, le=100.0, description="Seuil d’avertissement")
    method: str = Field(..., description="Identifiant de la méthode de calcul")
    computation_ms: int = Field(..., ge=0, description="Durée du calcul côté serveur (ms)")
    computed_at: str = Field(..., description="Horodatage ISO du calcul")
    suggestions_hints: List[str] = Field(
        default_factory=list,
        description="Pistes génériques si score faible",
    )


class ContextRelevanceHistoryEntry(BaseModel):
    """Point d’historique de pertinence pour un dialogue."""

    request_id: str = Field(..., description="ID requête LLM")
    node_id: Optional[str] = Field(default=None, description="Nœud généré")
    timestamp: datetime = Field(..., description="Horodatage de la génération")
    score_percent: float = Field(..., ge=0.0, le=100.0)
    low_context_warning: bool = Field(default=False)
    breakdown_by_type: Dict[str, float] = Field(default_factory=dict)

    @field_serializer("timestamp")
    def serialize_timestamp(self, value: datetime) -> str:
        return value.isoformat() if isinstance(value, datetime) else str(value)


class ContextRelevanceHistoryResponse(BaseModel):
    """Liste chronologique des pertinences calculées pour un dialogue."""

    dialogue_id: str = Field(..., description="ID du dialogue")
    entries: List[ContextRelevanceHistoryEntry] = Field(default_factory=list)
    total_count: int = Field(..., ge=0, description="Nombre d’entrées")


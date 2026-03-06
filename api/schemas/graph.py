"""Schémas Pydantic pour l'API de gestion de graphes."""
from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class LoadGraphRequest(BaseModel):
    """Requête pour charger un dialogue Unity JSON et le convertir en graphe."""
    json_content: str = Field(..., description="Contenu JSON Unity (tableau de nœuds)")


class GraphMetadata(BaseModel):
    """Métadonnées d'un graphe."""
    title: str = Field(..., description="Titre du dialogue")
    node_count: int = Field(..., description="Nombre de nœuds")
    edge_count: int = Field(..., description="Nombre de connexions")
    filename: Optional[str] = Field(None, description="Nom du fichier (si sauvegardé)")


class LoadGraphResponse(BaseModel):
    """Réponse après chargement d'un graphe."""
    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")
    metadata: GraphMetadata = Field(..., description="Métadonnées du graphe")


class SaveGraphRequest(BaseModel):
    """Requête pour sauvegarder un graphe modifié."""
    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")
    metadata: GraphMetadata = Field(..., description="Métadonnées du graphe")
    seq: Optional[int] = Field(None, description="Séquence monotone côté client (ADR-006)")
    document_id: Optional[str] = Field(None, description="ID stable du document (ex. filename)")


class SaveGraphResponse(BaseModel):
    """Réponse après sauvegarde d'un graphe."""
    success: bool = Field(..., description="Succès de l'opération")
    filename: str = Field(..., description="Nom du fichier sauvegardé")
    json_content: str = Field(..., description="Contenu Unity JSON généré")
    ack_seq: Optional[int] = Field(None, description="Séquence reconnue par le serveur (ADR-006)")
    last_seq: Optional[int] = Field(None, description="Dernier seq connu pour ce document (ADR-006)")


class EstimateCostRequest(BaseModel):
    """Requête pour estimer le coût LLM avant génération (même structure que GenerateNodeRequest)."""
    parent_node_id: str = Field(..., description="ID du nœud parent")
    parent_node_content: Dict[str, Any] = Field(..., description="Contenu du nœud parent (pour contexte)")
    user_instructions: str = Field(..., description="Instructions pour guider l'IA")
    context_selections: Dict[str, Any] = Field(..., description="Sélection de contexte GDD")
    max_choices: Optional[int] = Field(None, description="Nombre maximum de choix (0-8)")
    npc_speaker_id: Optional[str] = Field(None, description="ID du PNJ interlocuteur")
    system_prompt_override: Optional[str] = Field(None, description="Surcharge du system prompt")
    narrative_tags: Optional[List[str]] = Field(None, description="Tags narratifs")
    llm_model_identifier: Optional[str] = Field(None, description="Identifiant du modèle LLM")
    target_choice_index: Optional[int] = Field(None, description="Index du choix spécifique (si None, tous les choix sans targetNode)")
    generate_all_choices: bool = Field(False, description="Si True, estimation pour un nœud par choix sans targetNode")


class EstimateCostPerNodeBreakdown(BaseModel):
    """Détail d'estimation par nœud (batch)."""
    choice_index: Optional[int] = Field(None, description="Index du choix (si batch)")
    prompt_tokens: int = Field(..., description="Tokens prompt estimés pour ce nœud")
    completion_tokens: int = Field(..., description="Tokens completion estimés pour ce nœud")
    estimated_cost_eur: float = Field(..., description="Coût estimé pour ce nœud (€)")


class EstimateCostResponse(BaseModel):
    """Réponse d'estimation de coût (sans appel LLM)."""
    estimated_cost_eur: float = Field(..., description="Coût total estimé (€, converti depuis USD)")
    prompt_tokens: int = Field(..., description="Tokens prompt estimés")
    completion_tokens: int = Field(..., description="Tokens completion estimés (total si batch)")
    model_id: str = Field(..., description="Modèle utilisé pour l'estimation")
    provider: str = Field(..., description="Provider LLM (ex: openai, mistral)")
    batch_count: Optional[int] = Field(None, description="Nombre de nœuds en batch (1 si single)")
    per_node_breakdown: Optional[List[EstimateCostPerNodeBreakdown]] = Field(
        None,
        description="Détail par nœud (si batch)"
    )
    alternative_provider: Optional[str] = Field(None, description="Provider alternatif pour comparaison (AC #3)")
    alternative_model_id: Optional[str] = Field(None, description="Modèle alternatif utilisé pour la comparaison")
    alternative_cost_eur: Optional[float] = Field(None, description="Coût estimé avec le provider alternatif (€)")
    cost_difference_pct: Optional[float] = Field(
        None,
        description="Différence de coût vs provider actuel en % (négatif = alternatif moins cher)"
    )


class GenerateNodeRequest(BaseModel):
    """Requête pour générer un nœud en contexte."""
    parent_node_id: str = Field(..., description="ID du nœud parent")
    parent_node_content: Dict[str, Any] = Field(..., description="Contenu du nœud parent (pour contexte)")
    user_instructions: str = Field(..., description="Instructions pour guider l'IA")
    context_selections: Dict[str, Any] = Field(..., description="Sélection de contexte GDD")
    max_choices: Optional[int] = Field(None, description="Nombre maximum de choix (0-8)")
    npc_speaker_id: Optional[str] = Field(None, description="ID du PNJ interlocuteur")
    system_prompt_override: Optional[str] = Field(None, description="Surcharge du system prompt")
    narrative_tags: Optional[List[str]] = Field(None, description="Tags narratifs")
    llm_model_identifier: Optional[str] = Field(None, description="Identifiant du modèle LLM")
    target_choice_index: Optional[int] = Field(None, description="Index du choix spécifique à connecter (si None, génère pour tous les choix sans targetNode)")
    generate_all_choices: bool = Field(False, description="Si True, génère un nœud pour chaque choix sans targetNode")
    dialogue_id: Optional[str] = Field(None, description="ID du dialogue (pour annotation post-hoc des coûts)")


class SuggestedConnection(BaseModel):
    """Connexion suggérée entre nœuds."""
    from_node: str = Field(..., description="ID du nœud source", alias="from")
    to_node: str = Field(..., description="ID du nœud cible", alias="to")
    via_choice_index: Optional[int] = Field(None, description="Index du choix (si applicable)")
    connection_type: str = Field("choice", description="Type de connexion (choice, nextNode, success, failure)")


class GenerateNodeResponse(BaseModel):
    """Réponse après génération d'un nœud."""
    node: Optional[Dict[str, Any]] = Field(None, description="Nœud généré (avec ID) - pour backward compatibility")
    nodes: Optional[List[Dict[str, Any]]] = Field(None, description="Liste de nœuds générés (pour génération batch)")
    suggested_connections: List[SuggestedConnection] = Field(..., description="Connexions suggérées")
    parent_node_id: str = Field(..., description="ID du nœud parent")
    batch_count: Optional[int] = Field(None, description="Nombre total de nœuds générés en batch (si applicable)")
    generated_choices_count: Optional[int] = Field(
        None,
        description="Nombre de nouveaux nœuds générés pour les choix (batch)"
    )
    connected_choices_count: Optional[int] = Field(
        None,
        description="Nombre de choix déjà connectés (ignorés dans le batch)"
    )
    failed_choices_count: Optional[int] = Field(
        None,
        description="Nombre de choix en échec lors de la génération batch"
    )
    total_choices_count: Optional[int] = Field(
        None,
        description="Nombre total de choix sur le nœud parent"
    )


class ValidateGraphRequest(BaseModel):
    """Requête pour valider un graphe."""
    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")


class ValidationErrorDetail(BaseModel):
    """Détail d'une erreur de validation."""
    type: str = Field(..., description="Type d'erreur")
    node_id: Optional[str] = Field(None, description="ID du nœud concerné")
    message: str = Field(..., description="Message d'erreur")
    severity: str = Field("error", description="Sévérité (error, warning)")
    target: Optional[str] = Field(None, description="Cible de la référence (si applicable)")
    cycle_path: Optional[str] = Field(None, description="Chemin complet du cycle (format: 'A → B → C → A')")
    cycle_nodes: Optional[List[str]] = Field(None, description="Liste des nœuds dans le cycle")
    cycle_id: Optional[str] = Field(None, description="ID stable du cycle (pour marquage intentionnel)")


class ValidateGraphResponse(BaseModel):
    """Réponse après validation d'un graphe."""
    valid: bool = Field(..., description="True si aucune erreur")
    errors: List[ValidationErrorDetail] = Field(..., description="Liste des erreurs")
    warnings: List[ValidationErrorDetail] = Field(..., description="Liste des warnings")


class CalculateLayoutRequest(BaseModel):
    """Requête pour calculer un layout automatique."""
    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")
    algorithm: str = Field("dagre", description="Algorithme de layout (dagre, manual)")
    direction: str = Field("TB", description="Direction (TB, LR, BT, RL)")


class CalculateLayoutResponse(BaseModel):
    """Réponse après calcul de layout."""
    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds avec positions calculées")


class AcceptNodeRequest(BaseModel):
    """Requête pour accepter un nœud généré."""
    dialogue_id: str = Field(..., description="ID du dialogue (filename)")


class RejectNodeRequest(BaseModel):
    """Requête pour rejeter un nœud généré."""
    dialogue_id: str = Field(..., description="ID du dialogue (filename)")


class RegenerateNodeRequest(BaseModel):
    """Requête pour régénérer un nœud avec de nouvelles instructions (Story 1.10)."""
    dialogue_id: str = Field(..., description="ID du dialogue (filename)")
    new_instructions: str = Field(..., description="Nouvelles instructions pour la régénération")
    preserve_connections: bool = Field(True, description="Préserver les connexions du nœud")
    parent_node_id: str = Field(..., description="ID du nœud parent (contexte de génération)")
    parent_node_content: Dict[str, Any] = Field(..., description="Contenu du nœud parent")
    context_selections: Dict[str, Any] = Field(default_factory=dict, description="Sélection de contexte GDD")
    system_prompt_override: Optional[str] = Field(None, description="Surcharge du system prompt")
    llm_model_identifier: Optional[str] = Field(None, description="Identifiant du modèle LLM")
    via_choice_index: Optional[int] = Field(None, description="Index du choix parent (si connexion par choix)")


class RegenerateNodeResponse(BaseModel):
    """Réponse après régénération d'un nœud (remplacement in-place, même ID)."""
    node: Dict[str, Any] = Field(..., description="Nœud régénéré (id = node_id demandé)")
    suggested_connections: List[SuggestedConnection] = Field(..., description="Connexions suggérées (parent → nouveau nœud)")


class NodePromptResponse(BaseModel):
    """Réponse GET /graph/prompt — prompt exact ou reconstruit pour un nœud (Story 1.14)."""
    raw_prompt: str = Field(..., description="Prompt brut envoyé au LLM (ou reconstruit)")
    prompt_tokens: Optional[int] = Field(None, description="Tokens du prompt (si disponible)")
    completion_tokens: Optional[int] = Field(None, description="Tokens de la réponse (si disponible)")
    timestamp: Optional[datetime] = Field(None, description="Horodatage de la génération (si stocké)")
    is_historical: bool = Field(..., description="True si prompt stocké à l'époque, False si reconstruit")
    message: Optional[str] = Field(None, description="Message informatif (ex: prompt reconstruit, contexte modifié)")

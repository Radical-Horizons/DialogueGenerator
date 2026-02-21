"""Schémas Pydantic pour l'API de gestion de graphes."""
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

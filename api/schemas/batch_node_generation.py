"""Schémas Pydantic — génération batch multi-parents (Story 8.9 / FR88)."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class BatchGenerateParentSpec(BaseModel):
    """Un nœud parent à traiter dans le lot."""

    parent_node_id: str = Field(..., description="ID du nœud parent")
    parent_node_content: Dict[str, Any] = Field(
        ..., description="Contenu du nœud parent (speaker, line, choices…)"
    )
    context_selections: Dict[str, Any] = Field(
        default_factory=dict,
        description="Snapshot GDD du nœud ou contexte global",
    )
    user_instructions: str = Field(
        default="",
        description="Instructions utilisateur (défaut backend si vide)",
    )
    npc_speaker_id: Optional[str] = Field(None, description="ID PNJ")
    player_character_id: Optional[str] = Field(None, description="ID PJ")


class BatchGenerateFromNodesJobRequest(BaseModel):
    """Corps POST pour démarrer un job de génération batch (N ≥ 10)."""

    document_id: Optional[str] = Field(
        None, description="ID dialogue pour annotation coûts"
    )
    parents: List[BatchGenerateParentSpec] = Field(
        ..., min_length=2, description="Parents sélectionnés (≥ 2)"
    )
    dialogue_nodes: Optional[List[Dict[str, Any]]] = Field(
        None, description="Snapshot graphe pour chemin ancêtre"
    )
    llm_model_identifier: Optional[str] = Field(None, description="Modèle LLM")
    system_prompt_override: Optional[str] = None
    max_choices: Optional[int] = None
    choices_mode: Optional[Literal["free", "capped"]] = None


class SuggestedConnectionPayload(BaseModel):
    """Connexion suggérée (alias from/to pour le front)."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    from_node: str = Field(..., alias="from")
    to_node: str = Field(..., alias="to")
    via_choice_index: Optional[int] = None
    connection_type: str = "choice"


class BatchGenerateParentItemResponse(BaseModel):
    """Résultat par parent."""

    parent_node_id: str
    status: Literal["ok", "error", "skipped", "cancelled"]
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    suggested_connections: List[SuggestedConnectionPayload] = Field(
        default_factory=list
    )
    error: Optional[str] = None
    warning: Optional[str] = None
    generated_choices_count: Optional[int] = None
    connected_choices_count: Optional[int] = None
    failed_choices_count: Optional[int] = None
    total_choices_count: Optional[int] = None
    context_gdd_content_fingerprint: Optional[str] = None


class BatchGenerateFromNodesReport(BaseModel):
    """Rapport agrégé d'un lot."""

    items: List[BatchGenerateParentItemResponse]
    cancelled: bool = False
    started_at: str = ""
    finished_at: str = ""
    ok_count: int = 0
    error_count: int = 0
    skipped_count: int = 0
    total_nodes_generated: int = 0


class BatchGenerateJobCreateResponse(BaseModel):
    """Réponse 202 à la création du job."""

    job_id: str
    status: Literal["queued"] = "queued"
    total: int


class BatchGenerateJobStatusResponse(BaseModel):
    """État / rapport d'un job de génération batch."""

    job_id: str
    status: Literal["queued", "running", "completed", "cancelled", "error"]
    current: int = 0
    total: int = 0
    detail: str = ""
    cancelled: bool = False
    error: Optional[str] = None
    report: Optional[BatchGenerateFromNodesReport] = None

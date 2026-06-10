"""Schémas Pydantic HTTP pour l'évaluation qualité dialogue (FR42)."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

# Réexport pour alignement OpenAPI / frontend (même identifiants que le juge LLM).
DialogueQualityCriterionId = Literal[
    "narrative_coherence",
    "characterization",
    "agency",
    "style",
]


class EvaluateDialogueQualityRequest(BaseModel):
    """Requête d'évaluation qualité (même charge utile graphe que /validate)."""

    nodes: List[dict] = Field(..., description="Nœuds ReactFlow")
    edges: List[dict] = Field(..., description="Arêtes ReactFlow")
    llm_model_identifier: Optional[str] = Field(
        None,
        description="Modèle LLM (api_identifier) ; défaut = default_model config",
    )


class DialogueQualityCriterionDetail(BaseModel):
    """Critère exposé à l'API / UI avec libellé français."""

    criterion_id: DialogueQualityCriterionId
    label: str = Field(..., description="Libellé affiché")
    score: int = Field(..., ge=0, le=10)
    comment: str = Field(default="")


class EvaluateDialogueQualityResponse(BaseModel):
    """Rapport d'évaluation qualité renvoyé au client."""

    overall_score: int = Field(..., ge=0, le=10)
    score_variance_margin: int = Field(
        default=1,
        description="Marge de variance documentée (±1 entre passes)",
    )
    score_variance_note: str = Field(
        ...,
        description="Texte UX expliquant la variance attendue ±1",
    )
    criteria: List[DialogueQualityCriterionDetail] = Field(default_factory=list)
    global_comment: Optional[str] = None
    suggestions: List[str] = Field(
        default_factory=list,
        description="Suggestions (juge ou dérivées commentaires)",
    )
    strengths: List[str] = Field(
        default_factory=list,
        description="Points forts (scores élevés)",
    )
    model_id: str = Field(..., description="Modèle api_identifier utilisé")
    provider: str = Field(
        ...,
        description="client_type config (openai, mistral, …)",
    )

"""Modèles Pydantic pour la sortie structurée du juge qualité dialogue (LLM)."""
from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field


DialogueQualityCriterionId = Literal[
    "narrative_coherence",
    "characterization",
    "agency",
    "style",
]


class DialogueQualityCriterionJudgeItem(BaseModel):
    """Critère tel que produit par le LLM (structured output)."""

    criterion_id: DialogueQualityCriterionId = Field(
        ...,
        description="Identifiant stable du critère",
    )
    score: int = Field(..., ge=0, le=10, description="Score 0–10 pour ce critère")
    comment: str = Field(
        default="",
        description="Commentaire bref du juge pour ce critère",
    )


class DialogueQualityJudgeStructuredResult(BaseModel):
    """Sortie structurée attendue du modèle juge (outil generate_interaction)."""

    overall_score: int = Field(..., ge=0, le=10, description="Score global 0–10")
    criteria: List[DialogueQualityCriterionJudgeItem] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="Les quatre critères epic (ordre libre)",
    )
    global_comment: str = Field(
        default="",
        description="Synthèse globale",
    )
    improvement_suggestions: List[str] = Field(
        default_factory=list,
        description="Suggestions d'amélioration (surtout si score bas)",
    )
    strengths: List[str] = Field(
        default_factory=list,
        description="Points forts à mettre en avant si la qualité est haute",
    )

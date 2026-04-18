"""Schémas POST preview document (Story 9.4)."""

from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel, Field


class DialoguePreviewRequest(BaseModel):
    """État simulé pour évaluation visibilité côté serveur."""

    model_config = {"extra": "forbid"}

    revision: int | None = None
    flag_states: Dict[str, Any] = Field(default_factory=dict)
    reputation_states: Dict[str, float] = Field(default_factory=dict)


class MaskedChoiceRef(BaseModel):
    """Référence stable d'un choix dont les conditions ne sont pas satisfaites."""

    model_config = {"extra": "forbid"}

    node_id: str = Field(..., min_length=1)
    choice_id: str = Field(..., min_length=1)


class DialoguePreviewResponse(BaseModel):
    """Agrégats et listes de masques pour tests perf / clients."""

    model_config = {"extra": "forbid"}

    revision: int
    nodes_total: int
    nodes_masked: int
    choices_total: int
    choices_masked: int
    masked_node_ids: List[str]
    masked_choice_refs: List[MaskedChoiceRef]

"""Schémas POST preview document (Stories 9.4 / 9.6)."""

from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel, Field

from api.schemas.game_systems import PreviewGameSystemsState


class DialoguePreviewRequest(BaseModel):
    """État simulé pour évaluation visibilité et stats FR94 côté serveur."""

    model_config = {"extra": "forbid"}

    revision: int | None = None
    flag_states: Dict[str, Any] = Field(default_factory=dict)
    reputation_states: Dict[str, float] = Field(default_factory=dict)
    game_systems_state: PreviewGameSystemsState = Field(default_factory=PreviewGameSystemsState)


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
    game_systems_state: PreviewGameSystemsState = Field(default_factory=PreviewGameSystemsState)
    simulation_limits: List[str] = Field(default_factory=list)

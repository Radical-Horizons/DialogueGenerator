"""Schémas du catalogue d'intégration systèmes de jeu FR94."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class GameSystemFamily(BaseModel):
    """Famille de systèmes de jeu exploitable par les dialogues."""

    model_config = {"extra": "forbid"}

    id: Literal["attributes_skills", "effort", "reputation"]
    label: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)


class RuntimeSourceStatus(BaseModel):
    """État de connexion de la source runtime externe."""

    model_config = {"extra": "forbid"}

    status: Literal["connected", "disconnected", "unknown"]
    label: str = Field(..., min_length=1)
    editing_blocked: bool
    message: str = Field(..., min_length=1)


class GameSystemsIntegrationCatalogResponse(BaseModel):
    """Catalogue affiché par le panneau d'intégration systèmes."""

    model_config = {"extra": "forbid"}

    families: list[GameSystemFamily]
    runtime_source: RuntimeSourceStatus


class PreviewGameSystemsState(BaseModel):
    """État simulé FR94 transmis au preview document."""

    model_config = {"extra": "forbid"}

    attributes: dict[str, float] = Field(default_factory=dict)
    skills: dict[str, float] = Field(default_factory=dict)
    effort_pool: float = 10
    reputation_values: dict[str, float] = Field(default_factory=dict)
    faction_titles: dict[str, str] = Field(default_factory=dict)

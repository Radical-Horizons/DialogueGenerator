"""Schémas du catalogue d'intégration systèmes de jeu FR94."""

from __future__ import annotations

from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

from services.dialogue_preview_limits import (
    MAX_PREVIEW_GAME_SYSTEMS_ATTRIBUTES,
    MAX_PREVIEW_GAME_SYSTEMS_FACTION_TITLES,
    MAX_PREVIEW_GAME_SYSTEMS_REPUTATION_VALUES,
    MAX_PREVIEW_GAME_SYSTEMS_SKILLS,
)


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

    @model_validator(mode="after")
    def _validate_map_sizes(self) -> Self:
        """Limite les cartes d'état simulé transmises au preview."""
        if len(self.attributes) > MAX_PREVIEW_GAME_SYSTEMS_ATTRIBUTES:
            raise ValueError(
                f"attributes: au plus {MAX_PREVIEW_GAME_SYSTEMS_ATTRIBUTES} clés autorisées"
            )
        if len(self.skills) > MAX_PREVIEW_GAME_SYSTEMS_SKILLS:
            raise ValueError(
                f"skills: au plus {MAX_PREVIEW_GAME_SYSTEMS_SKILLS} clés autorisées"
            )
        if len(self.reputation_values) > MAX_PREVIEW_GAME_SYSTEMS_REPUTATION_VALUES:
            raise ValueError(
                "reputation_values: au plus "
                f"{MAX_PREVIEW_GAME_SYSTEMS_REPUTATION_VALUES} clés autorisées"
            )
        if len(self.faction_titles) > MAX_PREVIEW_GAME_SYSTEMS_FACTION_TITLES:
            raise ValueError(
                f"faction_titles: au plus {MAX_PREVIEW_GAME_SYSTEMS_FACTION_TITLES} clés autorisées"
            )
        return self

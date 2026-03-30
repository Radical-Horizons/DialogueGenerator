"""Schémas Pydantic pour les règles de sélection de contexte GDD (Story 3.4)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

EntityTypeStr = Literal["character", "location", "item", "species", "community"]
DialogueTypeStr = str


class RuleCondition(BaseModel):
    """Condition unitaire d'une règle de sélection de contexte.

    Si ``entity_name`` est None, la condition matche n'importe quelle entité
    du type spécifié présente dans la sélection courante.
    """

    entity_type: EntityTypeStr
    entity_name: Optional[str] = None


class CreateRuleRequest(BaseModel):
    """Corps de la requête de création d'une règle."""

    name: str = Field(..., min_length=1)
    enabled: bool = True
    priority: Optional[int] = Field(None, ge=1)
    condition_operator: Literal["AND", "OR"] = "OR"
    conditions: list[RuleCondition] = Field(..., min_length=1)
    suggested_types: list[EntityTypeStr] = Field(..., min_length=1)
    dialogue_type: Optional[DialogueTypeStr] = None


class UpdateRuleRequest(BaseModel):
    """Corps de la requête de mise à jour d'une règle (tous champs optionnels)."""

    name: Optional[str] = Field(None, min_length=1)
    enabled: Optional[bool] = None
    priority: Optional[int] = Field(None, ge=1)
    condition_operator: Optional[Literal["AND", "OR"]] = None
    conditions: Optional[list[RuleCondition]] = Field(None, min_length=1)
    suggested_types: Optional[list[EntityTypeStr]] = Field(None, min_length=1)
    dialogue_type: Optional[DialogueTypeStr] = None


class ContextRule(BaseModel):
    """Règle de sélection de contexte GDD persistée."""

    id: str
    name: str
    enabled: bool
    priority: int
    condition_operator: Literal["AND", "OR"]
    conditions: list[RuleCondition]
    suggested_types: list[EntityTypeStr]
    dialogue_type: Optional[DialogueTypeStr] = None
    created_at: str
    updated_at: str


class RulesListResponse(BaseModel):
    """Réponse de la liste des règles."""

    rules: list[ContextRule]
    total: int


class DialogueTypeRulesResponse(BaseModel):
    """Réponse de lecture des règles pour un type de dialogue."""

    dialogue_type: DialogueTypeStr
    source: Literal["specific", "fallback_global"]
    rules: list[ContextRule]

"""Schémas Pydantic pour les règles de sélection de contexte GDD (Story 3.4)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

EntityTypeStr = Literal["character", "location", "item", "species", "community"]
DialogueTypeStr = str


class RuleCondition(BaseModel):
    """Condition unitaire d'une règle de sélection de contexte.

    Si ``entity_name`` est None, la condition matche n'importe quelle entité
    du type spécifié présente dans la sélection courante.
    """

    model_config = ConfigDict(populate_by_name=True)

    entity_type: EntityTypeStr = Field(
        validation_alias=AliasChoices("entity_type", "entityType"),
        serialization_alias="entityType",
    )
    entity_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("entity_name", "entityName"),
        serialization_alias="entityName",
    )


class CreateRuleRequest(BaseModel):
    """Corps de la requête de création d'une règle."""

    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1)
    enabled: bool = True
    priority: Optional[int] = Field(None, ge=1)
    condition_operator: Literal["AND", "OR"] = Field(
        default="OR",
        validation_alias=AliasChoices("condition_operator", "conditionOperator"),
    )
    conditions: list[RuleCondition] = Field(..., min_length=1)
    suggested_types: list[EntityTypeStr] = Field(
        ...,
        min_length=1,
        validation_alias=AliasChoices("suggested_types", "suggestedTypes"),
    )
    dialogue_type: Optional[DialogueTypeStr] = Field(
        default=None,
        validation_alias=AliasChoices("dialogue_type", "dialogueType"),
    )


class UpdateRuleRequest(BaseModel):
    """Corps de la requête de mise à jour d'une règle (tous champs optionnels)."""

    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = Field(None, min_length=1)
    enabled: Optional[bool] = None
    priority: Optional[int] = Field(None, ge=1)
    condition_operator: Optional[Literal["AND", "OR"]] = Field(
        default=None,
        validation_alias=AliasChoices("condition_operator", "conditionOperator"),
    )
    conditions: Optional[list[RuleCondition]] = Field(None, min_length=1)
    suggested_types: Optional[list[EntityTypeStr]] = Field(
        default=None,
        min_length=1,
        validation_alias=AliasChoices("suggested_types", "suggestedTypes"),
    )
    dialogue_type: Optional[DialogueTypeStr] = Field(
        default=None,
        validation_alias=AliasChoices("dialogue_type", "dialogueType"),
    )


class ContextRule(BaseModel):
    """Règle de sélection de contexte GDD persistée."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    enabled: bool
    priority: int
    condition_operator: Literal["AND", "OR"] = Field(
        validation_alias=AliasChoices("condition_operator", "conditionOperator"),
        serialization_alias="conditionOperator",
    )
    conditions: list[RuleCondition]
    suggested_types: list[EntityTypeStr] = Field(
        validation_alias=AliasChoices("suggested_types", "suggestedTypes"),
        serialization_alias="suggestedTypes",
    )
    dialogue_type: Optional[DialogueTypeStr] = Field(
        default=None,
        validation_alias=AliasChoices("dialogue_type", "dialogueType"),
        serialization_alias="dialogueType",
    )
    created_at: str = Field(
        validation_alias=AliasChoices("created_at", "createdAt"),
        serialization_alias="createdAt",
    )
    updated_at: str = Field(
        validation_alias=AliasChoices("updated_at", "updatedAt"),
        serialization_alias="updatedAt",
    )


class RulesListResponse(BaseModel):
    """Réponse de la liste des règles."""

    rules: list[ContextRule]
    total: int


class DialogueTypeRulesResponse(BaseModel):
    """Réponse de lecture des règles pour un type de dialogue."""

    model_config = ConfigDict(populate_by_name=True)

    dialogue_type: DialogueTypeStr = Field(
        validation_alias=AliasChoices("dialogue_type", "dialogueType"),
        serialization_alias="dialogueType",
    )
    source: Literal["specific", "fallback_global"]
    rules: list[ContextRule]

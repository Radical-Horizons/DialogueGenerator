"""Modèles Pydantic pour les conditions de visibilité structurées (Story 9.2).

Alignés sur ``docs/resources/dialogue-format.schema.json`` (definitions VisibilityConditions).
"""

from __future__ import annotations

from typing import Annotated, List, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

ComparisonOperator = Literal["=", "!=", ">=", "<=", ">", "<"]
EnumComparisonOperator = Literal["=", "!="]


class FlagBoolCondition(BaseModel):
    """Condition sur un flag catalogue de type bool."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["flag_bool"]
    flagId: str = Field(..., min_length=1)
    equals: bool


class FlagCounterCondition(BaseModel):
    """Condition sur un flag compteur (int/float catalogue)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["flag_counter"]
    flagId: str = Field(..., min_length=1)
    operator: ComparisonOperator
    value: float


class FlagEnumCondition(BaseModel):
    """Condition sur un flag enum (string + liste EnumValues catalogue)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["flag_enum"]
    flagId: str = Field(..., min_length=1)
    operator: EnumComparisonOperator
    value: str = Field(..., min_length=1)


class ReputationCondition(BaseModel):
    """Condition sur un seuil de réputation (axe × faction)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["reputation"]
    axisId: str = Field(..., min_length=1)
    factionId: str = Field(..., min_length=1)
    operator: ComparisonOperator
    threshold: float


ConditionAtom = Annotated[
    Union[FlagBoolCondition, FlagCounterCondition, FlagEnumCondition, ReputationCondition],
    Field(discriminator="kind"),
]


class VisibilityConditionsBlock(BaseModel):
    """Bloc AND/OR porté par un nœud ou un choix."""

    model_config = ConfigDict(extra="forbid")

    combinator: Literal["AND", "OR"]
    items: List[ConditionAtom] = Field(..., min_length=1)


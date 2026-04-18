"""Modèles Pydantic pour les effets déclenchés par choix (Story 9.3).

Alignés sur ``docs/resources/dialogue-format.schema.json`` (definitions ChoiceEffectAtom).
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

CounterAdjustOperator = Literal["=", "+=", "-="]


class SetBoolEffect(BaseModel):
    """Assignation d'un flag catalogue booléen."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["set_bool"]
    flagId: str = Field(..., min_length=1)
    value: bool


class AdjustCounterEffect(BaseModel):
    """Ajustement d'un compteur catalogue (=, +=, -=)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["adjust_counter"]
    flagId: str = Field(..., min_length=1)
    operator: CounterAdjustOperator
    value: float


class SetEnumEffect(BaseModel):
    """Assignation d'une valeur enum catalogue (pas d'arithmétique)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["set_enum"]
    flagId: str = Field(..., min_length=1)
    value: str = Field(..., min_length=1)


class ReputationDeltaEffect(BaseModel):
    """Delta de réputation sur un axe × faction (distinct des flags)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["reputation_delta"]
    axisId: str = Field(..., min_length=1)
    factionId: str = Field(..., min_length=1)
    delta: float


ChoiceEffectAtom = Annotated[
    Union[SetBoolEffect, AdjustCounterEffect, SetEnumEffect, ReputationDeltaEffect],
    Field(discriminator="kind"),
]

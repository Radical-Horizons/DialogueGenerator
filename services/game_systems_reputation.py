"""Helpers purs Réputation FR94."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

ComparisonOperator = Literal["=", "!=", ">=", "<=", ">", "<"]
ReputationReadMode = Literal["raw_npc", "final_npc", "community_calculated"]
ReputationImpactTier = Literal["aucun", "mineur", "majeur", "critique"]
RepPalier = Literal[
    "Hostilité",
    "Rejet",
    "Méfiance",
    "Distance",
    "Neutre",
    "Sympathie",
    "Faveur",
    "Dévotion",
    "Icône",
]


class ReputationAxis(str, Enum):
    """Axes FR94 de Réputation."""

    ADMIRATION = "Admiration"
    PRESTIGE = "Prestige"
    CRAINTE = "Crainte"


class SocialTarget(BaseModel):
    """Cible sociale explicite d'une condition ou d'un effet Réputation."""

    model_config = {"extra": "forbid"}

    kind: Literal["heroine", "npc", "community"]
    id: str = Field(..., min_length=1)


class ReputationCondition(BaseModel):
    """Condition Réputation FR94 avec cible et mode de lecture explicites."""

    model_config = {"extra": "forbid"}

    heroine_id: str = Field(..., min_length=1)
    target: SocialTarget
    axis: ReputationAxis
    read_mode: ReputationReadMode
    operator: ComparisonOperator
    threshold: float

    def state_key(self) -> str:
        """Retourne la clé stable de l'état preview FR94."""
        return (
            f"fr94::{self.heroine_id}::{self.target.kind}::{self.target.id}::"
            f"{self.axis.value}::{self.read_mode}"
        )


class ReputationPreviewState(BaseModel):
    """Valeurs numériques simulées de Réputation."""

    model_config = {"extra": "forbid"}

    values: dict[str, float] = Field(default_factory=dict)


def legacy_reputation_state_key(axis_id: str, faction_id: str) -> str:
    """Retourne la clé legacy Story 9.2/9.4 ``axisId::factionId``."""
    return f"{axis_id}::{faction_id}"


class ReputationConditionResult(BaseModel):
    """Résultat d'évaluation Réputation FR94."""

    model_config = {"extra": "forbid"}

    satisfied: bool
    current_value: float
    current_palier: RepPalier


class ReputationDeltaEffect(BaseModel):
    """Effet Réputation FR94 avec cible sociale explicite."""

    model_config = {"extra": "forbid"}

    heroine_id: str = Field(..., min_length=1)
    target: SocialTarget
    axis: ReputationAxis
    delta: float


def calculate_rep_palier(value: float) -> RepPalier:
    """Calcule le palier FR94 depuis une valeur numérique."""
    if value < -60:
        return "Hostilité"
    if value < -30:
        return "Rejet"
    if value < -10:
        return "Méfiance"
    if value < 0:
        return "Distance"
    if value < 10:
        return "Neutre"
    if value < 30:
        return "Sympathie"
    if value < 60:
        return "Faveur"
    if value < 90:
        return "Dévotion"
    return "Icône"


def _compare_numeric(left: float, operator: ComparisonOperator, right: float) -> bool:
    """Compare deux valeurs numériques selon l'opérateur FR94."""
    if operator == "=":
        return left == right
    if operator == "!=":
        return left != right
    if operator == ">=":
        return left >= right
    if operator == "<=":
        return left <= right
    if operator == ">":
        return left > right
    return left < right


def evaluate_reputation_condition(
    condition: ReputationCondition,
    state: ReputationPreviewState,
) -> ReputationConditionResult:
    """Évalue une condition Réputation FR94 depuis l'état numérique simulé."""
    current = float(state.values.get(condition.state_key(), 0))
    return ReputationConditionResult(
        satisfied=_compare_numeric(current, condition.operator, condition.threshold),
        current_value=current,
        current_palier=calculate_rep_palier(current),
    )


def classify_reputation_delta_impact(delta: float) -> ReputationImpactTier:
    """Classe un delta Réputation selon les repères FR94."""
    magnitude = abs(delta)
    if magnitude == 0:
        return "aucun"
    if magnitude <= 3:
        return "mineur"
    if magnitude <= 9:
        return "majeur"
    return "critique"


def validate_dialogue_flags_do_not_store_rep_palier(
    dialogue_flags: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Signale les flags qui tentent de persister un RepPalier runtime."""
    errors: list[dict[str, str]] = []
    for index, flag in enumerate(dialogue_flags):
        flag_id = str(flag.get("flagId", ""))
        if flag_id.startswith("RepPalier"):
            errors.append(
                {
                    "code": "reputation_palier_runtime_only",
                    "path": f"dialogueFlags[{index}]",
                    "message": (
                        "RepPalier est calculé à la volée depuis la Réputation numérique, "
                        "ne le stockez pas dans dialogueFlags."
                    ),
                }
            )
    return errors

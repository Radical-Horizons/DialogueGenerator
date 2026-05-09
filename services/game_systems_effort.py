"""Évaluation pure du coût d'Effort FR94."""

from __future__ import annotations

from pydantic import BaseModel, Field

DEFAULT_EFFORT_POOL = 10


class EffortPreviewState(BaseModel):
    """Pool d'Effort simulé en preview locale."""

    model_config = {"extra": "forbid"}

    available_pool: int = Field(default=DEFAULT_EFFORT_POOL, ge=0)


class EffortAccessResult(BaseModel):
    """Accessibilité d'un choix consommant de l'Effort."""

    model_config = {"extra": "forbid"}

    accessible: bool
    available_pool: int
    cost: int
    disabled_reason: str | None = None


def format_effort_disabled_reason(available_pool: int, cost: int) -> str:
    """Formate l'explication d'un choix grisé faute d'Effort."""
    return f"Effort insuffisant : {available_pool} PE disponibles, coût {cost} PE."


def evaluate_effort_cost(cost: int, state: EffortPreviewState) -> EffortAccessResult:
    """Retourne si le choix reste accessible pour le pool d'Effort simulé."""
    normalized_cost = max(0, int(cost))
    if state.available_pool >= normalized_cost:
        return EffortAccessResult(
            accessible=True,
            available_pool=state.available_pool,
            cost=normalized_cost,
        )
    return EffortAccessResult(
        accessible=False,
        available_pool=state.available_pool,
        cost=normalized_cost,
        disabled_reason=format_effort_disabled_reason(state.available_pool, normalized_cost),
    )

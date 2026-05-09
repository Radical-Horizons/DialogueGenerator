"""Évaluation pure des skill checks FR94."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SkillCheckIssue = Literal["succès_critique", "succès", "échec", "échec_critique"]


class SkillCheckDefinition(BaseModel):
    """Définition d'un test caractéristique + compétence contre un DD."""

    model_config = {"extra": "forbid"}

    attribute_id: str = Field(..., min_length=1)
    skill_id: str = Field(..., min_length=1)
    dc: int
    modifier: int = 0
    branches: dict[SkillCheckIssue, str] = Field(default_factory=dict)


class SkillCheckPreviewState(BaseModel):
    """Valeurs simulées utilisées par la preview locale."""

    model_config = {"extra": "forbid"}

    attributes: dict[str, int] = Field(default_factory=dict)
    skills: dict[str, int] = Field(default_factory=dict)


class SkillCheckResult(BaseModel):
    """Résultat déterministe d'un skill check preview."""

    model_config = {"extra": "forbid"}

    visible: bool
    score: int
    dc: int
    issue: SkillCheckIssue
    target_node: str | None = None


def _skill_check_issue_from_margin(margin: int) -> SkillCheckIssue:
    """Convertit la marge contre le DD en issue FR94."""
    if margin >= 5:
        return "succès_critique"
    if margin >= 0:
        return "succès"
    if margin <= -5:
        return "échec_critique"
    return "échec"


def evaluate_skill_check(
    check: SkillCheckDefinition,
    state: SkillCheckPreviewState,
) -> SkillCheckResult:
    """Évalue un test sans masquer le choix, puis retourne la branche d'issue."""
    score = (
        state.attributes.get(check.attribute_id, 0)
        + state.skills.get(check.skill_id, 0)
        + check.modifier
    )
    issue = _skill_check_issue_from_margin(score - check.dc)
    return SkillCheckResult(
        visible=True,
        score=score,
        dc=check.dc,
        issue=issue,
        target_node=check.branches.get(issue),
    )

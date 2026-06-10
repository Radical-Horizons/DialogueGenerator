"""Évaluation pure des conditions de visibilité pour preview serveur (Story 9.4).

Alignée sur ``frontend/src/utils/visibilityConditions.ts`` et les schémas Pydantic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping, Union

from api.schemas.visibility_conditions import (
    ComparisonOperator,
    ConditionAtom,
    VisibilityConditionsBlock,
)


def _num_from_flag(v: Union[bool, int, float, str, None]) -> Union[float, None]:
    if v is None:
        return None
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def _compare_nums(a: float, op: ComparisonOperator, b: float) -> bool:
    if op == "=":
        return a == b
    if op == "!=":
        return a != b
    if op == ">=":
        return a >= b
    if op == "<=":
        return a <= b
    if op == ">":
        return a > b
    if op == "<":
        return a < b
    return False


def _eval_atom(atom: ConditionAtom, flags: Mapping[str, Any], reputation: Mapping[str, float]) -> bool:
    if atom.kind == "flag_bool":
        v = flags.get(atom.flagId)
        if isinstance(v, bool):
            return v == atom.equals
        if v is None:
            return False
        return bool(v) == atom.equals
    if atom.kind == "flag_counter":
        raw = flags.get(atom.flagId)
        left = _num_from_flag(raw)  # type: ignore[arg-type]
        if left is None:
            return False
        return _compare_nums(left, atom.operator, float(atom.value))
    if atom.kind == "flag_enum":
        raw = flags.get(atom.flagId)
        s = "" if raw is None else str(raw)
        ok = s == atom.value
        return ok if atom.operator == "=" else not ok
    if atom.kind == "reputation":
        key = f"{atom.axisId}::{atom.factionId}"
        cur = reputation.get(key)
        if not isinstance(cur, (int, float)) or isinstance(cur, bool):
            return False
        return _compare_nums(float(cur), atom.operator, float(atom.threshold))
    return False


def evaluate_visibility_conditions_block(
    block: VisibilityConditionsBlock | None,
    flags: Mapping[str, Any],
    reputation: Mapping[str, float],
) -> bool:
    """Évalue un bloc structuré ; sans items → True."""
    if block is None or not block.items:
        return True
    results = [_eval_atom(a, flags, reputation) for a in block.items]
    if block.combinator == "AND":
        return all(results)
    return any(results)


@dataclass(frozen=True)
class VisibilityParseResult:
    """Résultat du parse d'un bloc visibilityConditions."""

    block: VisibilityConditionsBlock | None
    warning: str | None = None


def parse_visibility_block(raw: Any, *, path: str = "") -> VisibilityParseResult:
    """Parse YAML/JSON brut vers modèle ; invalide → bloc absent + avertissement."""
    if raw is None or not isinstance(raw, dict):
        return VisibilityParseResult(block=None)
    try:
        return VisibilityParseResult(block=VisibilityConditionsBlock.model_validate(raw))
    except Exception:
        location = path or "visibilityConditions"
        return VisibilityParseResult(
            block=None,
            warning=(
                f"{location}: conditions de visibilité invalides ; "
                "preview traité comme toujours visible"
            ),
        )

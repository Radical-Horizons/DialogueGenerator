"""Emplacements à écrire sous les choix d'un nœud : ce qu'un lot génère, donc paie.

La génération, l'estimation de coût et le contrôle de budget comptent tous ici.
Miroir front : ``frontend/src/utils/graphChoiceLabels.ts``.
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Tuple

# (champ du choix, nom de l'issue)
TEST_OUTCOMES: Tuple[Tuple[str, str], ...] = (
    ("testCriticalFailureNode", "critical-failure"),
    ("testFailureNode", "failure"),
    ("testSuccessNode", "success"),
    ("testCriticalSuccessNode", "critical-success"),
)


def _is_open_target(target: Any) -> bool:
    """Vrai si la cible reste à écrire (absente, vide ou placeholder ``END``)."""
    return not target or target == "END"


def choice_has_test(choice: Mapping[str, Any]) -> bool:
    """Vrai si le choix porte un test d'attribut non vide."""
    value = choice.get("test")
    return value is not None and (not isinstance(value, str) or bool(value.strip()))


def open_test_outcomes(choice: Mapping[str, Any]) -> List[str]:
    """Noms des issues de test sans nœud écrit."""
    return [name for field, name in TEST_OUTCOMES if _is_open_target(choice.get(field))]


def count_open_slots(choice: Mapping[str, Any]) -> int:
    """Nombre de nœuds qu'un lot écrit sous ce choix (un appel LLM chacun)."""
    if not _is_open_target(choice.get("targetNode")):
        return 0
    if choice_has_test(choice):
        return len(open_test_outcomes(choice))
    return 1


def count_parent_open_slots(parent_node_content: Dict[str, Any]) -> int:
    """Nombre de nœuds qu'un lot de choix écrit sous ce parent."""
    choices = parent_node_content.get("choices") or []
    return sum(count_open_slots(c) for c in choices if isinstance(c, dict))

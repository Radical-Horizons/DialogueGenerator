"""Attribution stable des choiceId (ADR-008) sur les documents Unity."""
from __future__ import annotations

import copy
from typing import Any, Dict


def stable_choice_id(node_id: str, choice_index: int) -> str:
    """Génère un choiceId stable déterministe."""
    return f"choice_{node_id}_{choice_index}"


def ensure_document_choice_ids(
    document: Dict[str, Any],
    *,
    in_place: bool = False,
) -> Dict[str, Any]:
    """Ajoute choiceId aux choix qui n'en ont pas (idempotent).

    Préserve ``schemaVersion`` et les choiceId existants.

    Args:
        document: Document Unity ``{ schemaVersion, nodes, … }``.
        in_place: Si True, modifie le document en place.

    Returns:
        Document avec tous les choix pourvus d'un choiceId.
    """
    doc = document if in_place else copy.deepcopy(document)
    nodes = doc.get("nodes") or []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id", ""))
        choices = node.get("choices") or []
        for idx, choice in enumerate(choices):
            if not isinstance(choice, dict):
                continue
            if not choice.get("choiceId"):
                choice["choiceId"] = stable_choice_id(node_id, idx)
    return doc

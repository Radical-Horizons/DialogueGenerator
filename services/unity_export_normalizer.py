"""Normalisation des documents Unity avant validation/export (Epic 5 retro T1).

Retire les emplacements de choix vides (``__idx_N``), les champs ``null`` rejetés
par le schéma JSON et les chaînes legacy vides (``condition``, ``test``).
Ajoute ``choiceId`` manquants et ``targetNode`` par défaut (``END``) pour l'export graphe.
"""
from __future__ import annotations

import copy
import re
from typing import Any, Dict, List, Union

from services.document_choice_id_service import ensure_document_choice_ids

_PLACEHOLDER_CHOICE_ID = re.compile(r"^__idx_\d+$")
_NULLABLE_INT_FIELDS = ("influenceDelta", "respectDelta")
_OPTIONAL_STRING_FIELDS = ("condition",)


def _is_placeholder_choice(choice: Dict[str, Any]) -> bool:
    """True si le choix est un slot UI vide (ADR-008) sans cible ni libellé."""
    choice_id = choice.get("choiceId")
    if not isinstance(choice_id, str) or not _PLACEHOLDER_CHOICE_ID.match(choice_id):
        return False
    text = choice.get("text", "")
    if isinstance(text, str) and text.strip():
        return False
    target = choice.get("targetNode")
    if isinstance(target, str) and target.strip():
        return False
    return True


def _clean_choice(choice: Dict[str, Any]) -> Dict[str, Any]:
    """Nettoie un choix exporté pour conformité schéma Unity."""
    cleaned = dict(choice)
    for key in _NULLABLE_INT_FIELDS:
        if cleaned.get(key) is None:
            cleaned.pop(key, None)
    for key in _OPTIONAL_STRING_FIELDS:
        value = cleaned.get(key)
        if value is None or (isinstance(value, str) and not value.strip()):
            cleaned.pop(key, None)
    target = cleaned.get("targetNode")
    if not isinstance(target, str) or not target.strip():
        cleaned["targetNode"] = "END"
    return cleaned


def _clean_node(node: Dict[str, Any]) -> Dict[str, Any]:
    """Nettoie un nœud Unity (choix, métadonnées vides)."""
    cleaned = dict(node)
    if cleaned.get("title") == "":
        cleaned.pop("title", None)
    choices = cleaned.get("choices")
    if isinstance(choices, list):
        filtered: List[Dict[str, Any]] = [
            _clean_choice(choice)
            for choice in choices
            if isinstance(choice, dict) and not _is_placeholder_choice(choice)
        ]
        if filtered:
            cleaned["choices"] = filtered
        else:
            cleaned.pop("choices", None)
    return cleaned


def normalize_unity_export_document(
    document: Dict[str, Any],
    *,
    in_place: bool = False,
) -> Dict[str, Any]:
    """Normalise un document Unity canonique pour validation/export.

    Args:
        document: Document ``{ schemaVersion, nodes, … }``.
        in_place: Si True, modifie ``document`` directement.

    Returns:
        Document normalisé (copie profonde par défaut).
    """
    doc = document if in_place else copy.deepcopy(document)
    ensure_document_choice_ids(doc, in_place=True)
    nodes = doc.get("nodes")
    if isinstance(nodes, list):
        doc["nodes"] = [
            _clean_node(node) for node in nodes if isinstance(node, dict)
        ]
    return doc


def prepare_unity_export_document(
    json_data: Union[List[Dict[str, Any]], Dict[str, Any]],
) -> Dict[str, Any]:
    """Normalise liste legacy ou document canonique pour export/validation.

    Args:
        json_data: Document Unity ou liste de nœuds legacy.

    Returns:
        Document canonique nettoyé.

    Raises:
        ValueError: Format JSON Unity non reconnu.
    """
    if isinstance(json_data, dict) and "nodes" in json_data:
        base: Dict[str, Any] = json_data
    elif isinstance(json_data, list):
        base = {"schemaVersion": "1.1.0", "nodes": json_data}
    else:
        raise ValueError(
            "Format document invalide : dict avec nodes ou liste de nœuds"
        )
    return normalize_unity_export_document(base)

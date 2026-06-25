"""Tests pour services/unity_node_validation_service.py."""
from __future__ import annotations

import pytest

from services.unity_node_validation_service import (
    UnityNodeValidationError,
    validate_choice_count,
    validate_enriched_node,
    validate_enriched_nodes,
)


def test_validate_choice_count_free_rejects_single_choice() -> None:
    """Mode libre : un seul choix doit échouer."""
    with pytest.raises(UnityNodeValidationError, match="un seul choix"):
        validate_choice_count([{"text": "A"}], max_choices=None, choices_mode="free")


def test_validate_choice_count_capped_allows_single_choice() -> None:
    """Mode capped : un choix sous le plafond est accepté."""
    validate_choice_count([{"text": "A"}], max_choices=3, choices_mode="capped")


def test_validate_enriched_nodes_detects_duplicate_ids() -> None:
    """IDs dupliqués détectés comme en render_unity_nodes."""
    nodes = [
        {"id": "A", "line": "x", "choices": [{"text": "c", "targetNode": "END"}]},
        {"id": "A", "line": "y"},
    ]
    with pytest.raises(UnityNodeValidationError, match="dupliqu"):
        validate_enriched_nodes(nodes)


def test_validate_enriched_node_leaf_requires_no_choices() -> None:
    """Feuille max_choices=0 : pas de branche."""
    node = {
        "id": "LEAF",
        "line": "Fin",
        "choices": [{"text": "x", "targetNode": "END"}],
    }
    with pytest.raises(UnityNodeValidationError, match="feuille"):
        validate_enriched_node(node, max_choices=0, choices_mode="capped")


def test_validate_enriched_node_accepts_valid_start() -> None:
    """Nœud START minimal valide."""
    node = {
        "id": "START",
        "line": "Bonjour",
        "choices": [
            {"text": "A", "targetNode": "END"},
            {"text": "B", "targetNode": "END"},
        ],
    }
    validate_enriched_node(node, max_choices=2, choices_mode="capped")

"""Tests resolve_fields_for_element (repli excerpt par fiche)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from services.context_field_manager import ContextFieldManager


@pytest.fixture
def shard_character_data() -> dict:
    """Fiche type export Notion shard (sans Introduction.Résumé classique)."""
    return {
        "Nom": "Uresaïr",
        "sections": {
            "re_sume__de_la_fiche": "Résumé narratif de la seigneuresse.",
            "guides": "Autre contenu long.",
        },
    }


@pytest.fixture
def excerpt_config() -> dict:
    """Config avec chemin excerpt obsolète sur certaines fiches."""
    return {
        "character": {
            "1": [
                {"path": "sections.relations_de_son_vivant", "label": "Relations (extrait)", "is_excerpt": True},
                {"path": "Nom", "label": "Nom"},
            ],
        },
    }


def test_excerpt_fallback_uses_summary_section_when_config_path_empty(
    excerpt_config: dict,
    shard_character_data: dict,
) -> None:
    """Le mode excerpt ne doit pas retourner une liste vide si un résumé section existe."""
    manager = ContextFieldManager(excerpt_config, MagicMock())
    with patch("services.context_field_validator.ContextFieldValidator") as mock_cls:
        mock_cls.return_value.filter_valid_fields.side_effect = lambda _t, fields: fields
        resolved = manager.resolve_fields_for_element(
            "character",
            shard_character_data,
            "excerpt",
            None,
            include_dialogue_type=True,
        )

    assert resolved is not None
    assert len(resolved) > 0
    assert any("re_sume" in path for path in resolved)


def test_excerpt_returns_empty_list_when_no_content_anywhere(excerpt_config: dict) -> None:
    """Sans contenu exploitable, retourne [] (appelant ignore l'élément)."""
    manager = ContextFieldManager(excerpt_config, MagicMock())
    empty_data = {"Nom": "Vide", "sections": {}}
    with patch("services.context_field_validator.ContextFieldValidator") as mock_cls:
        mock_cls.return_value.filter_valid_fields.side_effect = lambda _t, fields: fields
        resolved = manager.resolve_fields_for_element(
            "character",
            empty_data,
            "excerpt",
            None,
            include_dialogue_type=True,
        )

    assert resolved == ["Nom"]

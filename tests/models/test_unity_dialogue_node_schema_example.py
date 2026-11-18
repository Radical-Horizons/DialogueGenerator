"""L'exemple de test du schéma envoyé au LLM doit être pris dans le catalogue.

Le LLM recopie l'exemple de ``Field.description`` : « Raison+Rhétorique:8 » faisait
produire des tests sur une caractéristique qui n'existe pas (2026-11-18).
"""
from __future__ import annotations

import re

import pytest

from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueChoiceContent,
    UnityDialogueNodeContent,
)
from services.skill_check_catalog import CORE_ATTRIBUTE_ENTRIES, load_skill_ids_for_prompt

_EXAMPLE = re.compile(r"ex: '([^'+]+)\+([^':]+):\d+'")


@pytest.mark.parametrize("model", [UnityDialogueChoiceContent, UnityDialogueNodeContent])
def test_schema_test_example_uses_catalog_identifiers(model: type) -> None:
    """La caractéristique et la compétence de l'exemple existent dans les catalogues."""
    description = model.model_fields["test"].description or ""
    match = _EXAMPLE.search(description)
    assert match, f"exemple introuvable dans : {description}"
    attribute, skill = match.groups()
    assert attribute in {entry_id for entry_id, _ in CORE_ATTRIBUTE_ENTRIES}
    assert skill in load_skill_ids_for_prompt()

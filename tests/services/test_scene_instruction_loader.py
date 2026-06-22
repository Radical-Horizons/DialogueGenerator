"""Tests pour le chargement des instructions de scène (alignement UI)."""
from __future__ import annotations

from services.configuration_service import ConfigurationService
from services.scene_instruction_loader import (
    build_scene_user_instructions,
    extract_rencontre_initiale,
    load_scene_instructions_text,
)


def test_load_first_meeting_template_contains_in_game_semantics() -> None:
    """Le template première rencontre décrit l'interaction in-game."""
    config = ConfigurationService()
    text = load_scene_instructions_text(config, "first_meeting")
    assert "première rencontre" in text.lower()
    assert "in-game" in text.lower() or "in game" in text.lower()


def test_extract_rencontre_initiale_from_sections() -> None:
    """Extrait la section rencontre_initiale d'une fiche shard."""
    data = {
        "sections": {
            "rencontre_initiale": "VOKNIR : Oh Théomaque…",
        }
    }
    assert "Théomaque" in extract_rencontre_initiale(data)


def test_build_scene_user_instructions_without_context_builder() -> None:
    """Assemble au minimum le template de rôle narratif."""
    config = ConfigurationService()
    text = build_scene_user_instructions(config, "first_meeting")
    assert len(text) > 80

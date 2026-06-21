"""Tests PJ/PNJ et enrichissement contexte scène."""
from __future__ import annotations

import random

from api.schemas.dialogue import ContextSelection
from constants import PlayableCharacters
from services.scene_dramatis import (
    context_has_location,
    enrich_context_selections_for_scene,
    is_forbidden_npc,
    is_playable_character,
    is_valid_npc,
    resolve_scene_dramatis,
)


class TestPlayableAndNpcRules:
    """Règles métier PJ/PNJ Alteir."""

    def test_playable_characters_include_etheree_and_uresair(self) -> None:
        assert is_playable_character("Uresaïr")
        assert is_playable_character("L'Éthérée")
        assert is_playable_character("Vethraak")
        assert is_playable_character("Eonundé Alinen-Egan")

    def test_etheree_cannot_be_npc(self) -> None:
        assert is_forbidden_npc("L'Éthérée")
        assert not is_valid_npc("L'Éthérée", PlayableCharacters.URESAIR)

    def test_npc_cannot_be_same_as_player(self) -> None:
        assert not is_valid_npc("Uresaïr", "Uresaïr")
        assert is_valid_npc("Vethraak", "Uresaïr")

    def test_other_playable_is_valid_npc(self) -> None:
        dramatis = resolve_scene_dramatis(
            player_character_id=PlayableCharacters.ETHEEREE,
            npc_speaker_id=PlayableCharacters.URESAIR,
        )
        assert dramatis.player_character_id == PlayableCharacters.ETHEEREE
        assert dramatis.npc_speaker_id == PlayableCharacters.URESAIR


class TestResolveSceneDramatis:
    """Résolution automatique PJ/PNJ."""

    def test_defaults_to_etheree_as_player(self) -> None:
        dramatis = resolve_scene_dramatis()
        assert dramatis.player_character_id == PlayableCharacters.DEFAULT_PLAYER

    def test_picks_other_playable_when_npc_invalid(self) -> None:
        dramatis = resolve_scene_dramatis(
            player_character_id=PlayableCharacters.URESAIR,
            npc_speaker_id=PlayableCharacters.ETHEEREE,
        )
        assert dramatis.npc_speaker_id != PlayableCharacters.ETHEEREE
        assert dramatis.npc_speaker_id != PlayableCharacters.URESAIR

    def test_reads_scene_protagonists_from_context(self) -> None:
        dramatis = resolve_scene_dramatis(
            context_selections={
                "scene_protagonists": {
                    "personnage_a": PlayableCharacters.VETHRAAK,
                    "personnage_b": "Akthar-Neth",
                }
            }
        )
        assert dramatis.player_character_id == PlayableCharacters.VETHRAAK
        assert dramatis.npc_speaker_id == "Akthar-Neth"


class TestContextHasLocation:
    """Présence d'un lieu dans la sélection."""

    def test_locations_full(self) -> None:
        assert context_has_location({"locations_full": ["Merid"]})

    def test_scene_location(self) -> None:
        assert context_has_location({"scene_location": {"lieu": "Escelion", "sous_lieu": "Grotte"}})

    def test_empty(self) -> None:
        assert not context_has_location({})
        assert not context_has_location(ContextSelection())


class TestEnrichContextSelections:
    """Enrichissement fiches + aléatoire excerpt."""

    def test_injects_protagonists_and_location(self) -> None:
        dramatis = resolve_scene_dramatis(
            player_character_id=PlayableCharacters.ETHEEREE,
            npc_speaker_id=PlayableCharacters.URESAIR,
        )
        ctx = ContextSelection(
            scene_location={"lieu": "Merid", "sous_lieu": "Sanctuaire"},
        )
        enriched = enrich_context_selections_for_scene(
            ctx,
            dramatis,
            character_catalog=["Akthar-Neth", "Vethraak"],
            rng=random.Random(0),
        )
        assert enriched.scene_protagonists == {
            "personnage_a": PlayableCharacters.ETHEEREE,
            "personnage_b": PlayableCharacters.URESAIR,
        }
        assert "Merid" in (enriched.locations_full or []) or "Sanctuaire" in (enriched.locations_full or [])
        assert enriched.characters_full or enriched.characters_excerpt

    def test_random_excerpt_from_catalog(self) -> None:
        dramatis = resolve_scene_dramatis(
            player_character_id=PlayableCharacters.URESAIR,
            npc_speaker_id="PNJ",
        )
        ctx = ContextSelection()
        enriched = enrich_context_selections_for_scene(
            ctx,
            dramatis,
            character_catalog=["Akthar-Neth", "Seigneuresse Uresaïr"],
            random_excerpt_count=1,
            rng=random.Random(42),
        )
        assert "Akthar-Neth" in (enriched.characters_excerpt or []) or "Seigneuresse Uresaïr" in (
            enriched.characters_excerpt or []
        )

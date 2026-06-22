"""Tests résolution noms canoniques et lieu parent."""
from __future__ import annotations

from unittest.mock import MagicMock

from api.schemas.dialogue import ContextSelection
from constants import PlayableCharacters
from services.scene_dramatis import (
    enrich_context_selections_for_scene,
    infer_parent_location_for_scene,
    resolve_canonical_name_from_catalog,
    resolve_scene_dramatis,
    SceneDramatis,
)


def test_resolve_canonical_name_accent_insensitive() -> None:
    """Uresair sans accent résout vers Uresaïr."""
    catalog = [PlayableCharacters.URESAIR, "Voknir Esh'Maradel"]
    assert resolve_canonical_name_from_catalog("Uresair", catalog) == PlayableCharacters.URESAIR


def test_resolve_scene_dramatis_canonicalizes_player() -> None:
    """resolve_scene_dramatis normalise le PJ vers le nom GDD."""
    catalog = [PlayableCharacters.URESAIR, "Voknir Esh'Maradel"]
    dramatis = resolve_scene_dramatis(
        player_character_id="Uresair",
        npc_speaker_id="Voknir Esh'Maradel",
        character_catalog=catalog,
    )
    assert dramatis.player_character_id == PlayableCharacters.URESAIR


def test_enrich_infers_parent_location_from_npc_context() -> None:
    """Sous-lieu seul → lieu parent déduit de la fiche PNJ."""
    cb = MagicMock()
    cb.get_locations_names.return_value = ["Plis d'ossements", "Merid"]
    cb.get_character_details_by_name.return_value = {
        "sections": {
            "contexte": "Voknir vit en exil dans les Plis d'ossements.",
        }
    }
    context = ContextSelection(
        characters_full=["Uresaïr", "Voknir Esh'Maradel"],
        scene_location={"sous_lieu": "Atelier de Voknir"},
    )
    dramatis = SceneDramatis(
        player_character_id=PlayableCharacters.URESAIR,
        npc_speaker_id="Voknir Esh'Maradel",
    )
    enriched = enrich_context_selections_for_scene(
        context,
        dramatis,
        context_builder=cb,
    )
    assert enriched.scene_location is not None
    assert enriched.scene_location.get("lieu") == "Plis d'ossements"
    assert "Plis d'ossements" in (enriched.locations_full or [])


def test_infer_parent_location_matches_substring_in_npc_haystack() -> None:
    """infer_parent_location_for_scene lit contexte / rencontre_initiale."""
    cb = MagicMock()
    cb.get_locations_names.return_value = ["Plis d'ossements"]
    cb.get_character_details_by_name.return_value = {
        "sections": {"rencontre_initiale": "habitat dans les Plis d'ossements"}
    }
    loc = infer_parent_location_for_scene("Atelier", "Voknir Esh'Maradel", cb)
    assert loc == "Plis d'ossements"

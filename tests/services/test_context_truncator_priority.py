"""Tests troncature contexte avec fiche PNJ protégée."""
from __future__ import annotations

from services.context_truncator import cap_context_text_to_budget


def _sample_gdd_text() -> str:
  """Contexte minimal deux personnages + lieu."""
  return (
      "--- CONTEXTE GÉNÉRAL DE LA SCÈNE ---\n\n"
      "--- CHARACTERS ---\n"
      "--- Voknir Esh'Maradel ---\n"
      "--- VOIX ET STYLE ---\n"
      "Registre cartographe spatial.\n\n"
      "--- Uresaïr ---\n"
      "--- VOIX ET STYLE ---\n"
      "Maîtresse des Intervalles " + ("temps " * 5000) + "\n\n"
      "--- LOCATIONS ---\n"
      "--- Plis d'ossements ---\n"
      "Lieu sombre.\n"
  )


def test_cap_context_preserves_npc_speaker_block() -> None:
    """La fiche du PNJ speaker survit à la troncature même si le PJ est énorme."""
    text = _sample_gdd_text()
    capped = cap_context_text_to_budget(
        text,
        200,
        protect_entity_names=["Voknir Esh'Maradel"],
        all_entity_names=["Voknir Esh'Maradel", "Uresaïr"],
    )
    assert "Voknir Esh'Maradel" in capped
    assert "Registre cartographe spatial" in capped
    assert "tronqué" in capped or capped != text


def test_character_order_npc_first_in_enrich() -> None:
    """PNJ speaker avant PJ dans la sélection fusionnée."""
    from api.schemas.dialogue import ContextSelection
    from constants import PlayableCharacters
    from services.scene_dramatis import (
        SceneDramatis,
        enrich_context_selections_for_scene,
    )

    dramatis = SceneDramatis(
        player_character_id=PlayableCharacters.URESAIR,
        npc_speaker_id="Voknir Esh'Maradel",
    )
    ctx = ContextSelection(
        characters_full=[PlayableCharacters.URESAIR, "Voknir Esh'Maradel"],
    )
    enriched = enrich_context_selections_for_scene(
        ctx,
        dramatis,
        character_catalog=[PlayableCharacters.URESAIR, "Voknir Esh'Maradel"],
        random_excerpt_count=0,
    )
    service = enriched.to_service_dict()
    chars = service.get("characters") or []
    modes = service.get("_element_modes", {}).get("characters", {})
    assert chars[0] == "Voknir Esh'Maradel"
    assert modes.get("Voknir Esh'Maradel") == "full"
    assert modes.get(PlayableCharacters.URESAIR) == "excerpt"

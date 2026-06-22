#!/usr/bin/env python3
"""Reconstruit le prompt START complet (system + user XML) comme l'orchestrateur Unity."""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from api.container import ServiceContainer
from api.schemas.dialogue import ContextSelection
from constants import Defaults, ModelNames, PlayableCharacters
from core.prompt.prompt_engine import PromptInput
from services.configuration_service import ConfigurationService
from services.context_truncator import cap_context_text_to_budget
from services.dialogue_dramatic_progression import (
    DEFAULT_PROGRESSION_MAX_DEPTH,
    compose_generation_instructions,
)
from services.scene_dramatis import enrich_context_selections_for_scene, resolve_scene_dramatis
from services.scene_instruction_loader import build_scene_user_instructions
from services.unity_dialogue_orchestrator import _coerce_context_text


def main() -> int:
    """Dump le prompt START Voknir/Uresaïr première rencontre."""
    container = ServiceContainer()
    dialogue_service = container.get_dialogue_generation_service()
    prompt_engine = container.get_prompt_engine()
    context_builder = dialogue_service.context_builder
    skill_service = container.get_skill_catalog_service()
    trait_service = container.get_trait_catalog_service()
    config = ConfigurationService()

    player = PlayableCharacters.URESAIR
    npc = "Voknir Esh'Maradel"
    scene_type = "first_meeting"

    context_selections = ContextSelection(
        characters_full=[player, npc],
        scene_protagonists={"personnage_a": player, "personnage_b": npc},
        scene_location={"sous_lieu": "Atelier de Voknir"},
    )

    character_catalog = context_builder.get_characters_names()
    dramatis = resolve_scene_dramatis(
        player_character_id=player,
        npc_speaker_id=npc,
        context_selections=context_selections.model_dump(),
        character_catalog=character_catalog,
    )
    enriched = enrich_context_selections_for_scene(
        context_selections,
        dramatis,
        character_catalog=character_catalog,
        context_builder=context_builder,
    )

    scene_instruction = compose_generation_instructions(
        build_scene_user_instructions(
            config,
            scene_type,
            npc_speaker_id=dramatis.npc_speaker_id,
            context_builder=context_builder,
        ),
        depth=0,
        max_depth=DEFAULT_PROGRESSION_MAX_DEPTH,
        is_start=True,
        scene_type=scene_type,
    )

    context_dict = enriched.to_service_dict()
    structured_context = context_builder.build_context_json(
        selected_elements=context_dict,
        scene_instruction=scene_instruction,
        field_configs=None,
        organization_mode="narrative",
        max_tokens=Defaults.CONTEXT_TOKENS,
        include_dialogue_type=True,
        element_modes=context_dict.get("_element_modes"),
    )
    serialized = _coerce_context_text(context_builder.serialize_context_to_text(structured_context))
    context_summary = cap_context_text_to_budget(
        serialized,
        Defaults.CONTEXT_TOKENS,
        protect_entity_names=[dramatis.npc_speaker_id],
        all_entity_names=context_dict.get("characters"),
    )

    try:
        skills_list = skill_service.load_skills()
    except Exception:
        skills_list = []
    try:
        traits_list = trait_service.get_trait_labels()
    except Exception:
        traits_list = []

    prompt_input = PromptInput(
        user_instructions=scene_instruction,
        npc_speaker_id=dramatis.npc_speaker_id,
        player_character_id=dramatis.player_character_id,
        skills_list=skills_list,
        traits_list=traits_list,
        context_summary=context_summary,
        structured_context=structured_context,
        scene_location=enriched.scene_location,
        max_choices=2,
        choices_mode="capped",
        include_narrative_guides=True,
        max_context_tokens=Defaults.CONTEXT_TOKENS,
        llm_model_identifier=ModelNames.GPT_5_MINI,
    )
    built = prompt_engine.build_prompt(prompt_input)
    system_text = prompt_engine.system_prompt_template

    out_dir = _ROOT / "data" / "test_dialogues"
    out_dir.mkdir(parents=True, exist_ok=True)
    combined_path = out_dir / "_full_prompt_start_combined.txt"
    xml_path = out_dir / "_full_prompt_start_user.xml"
    system_path = out_dir / "_full_prompt_start_system.txt"

    xml_path.write_text(built.raw_prompt, encoding="utf-8")
    system_path.write_text(system_text, encoding="utf-8")

    header = (
        "PROMPT START — Voknir × Uresaïr — first_meeting — depth expand-tree nœud START\n"
        f"PJ={dramatis.player_character_id} | PNJ={dramatis.npc_speaker_id}\n"
        f"scene_location={enriched.scene_location}\n"
        f"locations_full={enriched.locations_full}\n"
        f"tokens_estimated={built.token_count} | sha256={built.prompt_hash}\n"
        + ("-" * 72)
        + "\n\n"
    )
    combined = (
        header
        + "########## MESSAGE SYSTEM (envoyé séparément au LLM) ##########\n\n"
        + system_text
        + "\n\n"
        + "########## MESSAGE USER (XML — raw_prompt) ##########\n\n"
        + built.raw_prompt
    )
    combined_path.write_text(combined, encoding="utf-8")

    print(f"combined: {combined_path} ({len(combined)} chars)")
    print(f"system:   {system_path} ({len(system_text)} chars)")
    print(f"user xml: {xml_path} ({len(built.raw_prompt)} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

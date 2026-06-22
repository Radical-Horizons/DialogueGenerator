"""Chargement des instructions de scène alignées sur l'UI (templates + rôle narratif)."""
from __future__ import annotations

from typing import Any, Optional

from services.configuration_service import ConfigurationService


def load_scene_instructions_text(
    config_service: ConfigurationService,
    scene_type: str,
) -> str:
    """Charge le texte d'instructions pour un type de scène (ex. first_meeting).

    Utilise la même source que GET /config/scene-instruction-templates
    (fichiers ``config/scene_instructions/*.txt`` via ``prompts_metadata``).

    Args:
        config_service: Service de configuration projet.
        scene_type: Identifiant du template (``first_meeting``, ``conversation``, …).

    Returns:
        Contenu du fichier de rôle narratif, ou chaîne vide si inconnu.
    """
    if not scene_type or not str(scene_type).strip():
        return ""
    key = str(scene_type).strip()
    for template in config_service.get_scene_instruction_templates():
        if template.get("id") == key:
            return str(template.get("instructions") or "").strip()
    return ""


def extract_rencontre_initiale(character_data: Optional[dict[str, Any]]) -> str:
    """Extrait la section ``rencontre_initiale`` d'une fiche personnage GDD."""
    if not character_data or not isinstance(character_data, dict):
        return ""
    sections = character_data.get("sections")
    if not isinstance(sections, dict):
        return ""
    raw = sections.get("rencontre_initiale")
    if not raw or not str(raw).strip():
        return ""
    return str(raw).strip()


def augment_first_meeting_instructions(
    base_instructions: str,
    *,
    npc_speaker_id: str,
    context_builder: Any,
) -> str:
    """Enrichit les consignes première rencontre avec la référence canonique du PNJ.

    La référence GDD sert d'ancrage (ton, convention d'ouverture) sans être recopiée
    mot pour mot.

    Args:
        base_instructions: Consignes utilisateur / template déjà chargées.
        npc_speaker_id: Nom canonique du PNJ speaker.
        context_builder: ContextBuilder pour lire la fiche GDD.

    Returns:
        Instructions enrichies.
    """
    base = (base_instructions or "").strip()
    if not npc_speaker_id or npc_speaker_id == "PNJ":
        return base
    try:
        character_data = context_builder.get_character_details_by_name(npc_speaker_id)
    except Exception:
        character_data = None
    rencontre = extract_rencontre_initiale(character_data)
    if not rencontre:
        return base
    anchor = (
        "\n\n--- Référence canonique (première rencontre in-game ; ne pas recopier mot pour mot) ---\n"
        f"{rencontre}"
    )
    return f"{base}{anchor}" if base else rencontre


def build_scene_user_instructions(
    config_service: ConfigurationService,
    scene_type: str,
    *,
    npc_speaker_id: Optional[str] = None,
    context_builder: Any = None,
) -> str:
    """Assemble les instructions de scène comme l'UI (template + ancrage PNJ si applicable).

    Args:
        config_service: Service de configuration.
        scene_type: Type de scène (``first_meeting`` par défaut côté CLI).
        npc_speaker_id: PNJ interlocuteur pour ancrage ``rencontre_initiale``.
        context_builder: Optionnel, pour enrichir la première rencontre.

    Returns:
        Instructions prêtes pour ``user_instructions``.
    """
    instructions = load_scene_instructions_text(config_service, scene_type)
    if scene_type == "first_meeting" and context_builder and npc_speaker_id:
        instructions = augment_first_meeting_instructions(
            instructions,
            npc_speaker_id=npc_speaker_id,
            context_builder=context_builder,
        )
    return instructions.strip()

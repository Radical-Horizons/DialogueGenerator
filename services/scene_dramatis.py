"""Rôles PJ/PNJ et enrichissement du contexte GDD pour la génération de dialogues."""
from __future__ import annotations

import random
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from constants import PlayableCharacters

PLAYABLE_CHARACTERS: Tuple[str, ...] = PlayableCharacters.NAMES
NPC_FORBIDDEN_NAMES: Tuple[str, ...] = (PlayableCharacters.ETHEEREE,)
DEFAULT_PLAYER_CHARACTER: str = PlayableCharacters.DEFAULT_PLAYER


def normalize_character_name(name: str) -> str:
    """Normalise un nom de personnage pour comparaison (casse, accents)."""
    folded = unicodedata.normalize("NFKD", name.strip())
    ascii_name = "".join(c for c in folded if not unicodedata.combining(c))
    return ascii_name.casefold()


def is_playable_character(name: Optional[str]) -> bool:
    """Indique si le nom correspond à un PJ jouable Alteir."""
    if not name or not str(name).strip():
        return False
    key = normalize_character_name(str(name))
    return any(normalize_character_name(p) == key for p in PLAYABLE_CHARACTERS)


def is_forbidden_npc(name: Optional[str]) -> bool:
    """L'Éthérée ne peut jamais être PNJ (speaker des répliques)."""
    if not name:
        return False
    key = normalize_character_name(str(name))
    return any(normalize_character_name(f) == key for f in NPC_FORBIDDEN_NAMES)


def is_valid_npc(name: Optional[str], player_character_id: str) -> bool:
    """PNJ valide : autre PJ (≠ PJ sélectionné, jamais l'Éthérée) ou tout autre personnage."""
    if not name or not str(name).strip():
        return False
    if is_forbidden_npc(name):
        return False
    if normalize_character_name(str(name)) == normalize_character_name(player_character_id):
        return False
    return True


def other_playable_characters(player_character_id: str) -> List[str]:
    """Autres PJ jouables utilisables comme PNJ interlocuteur."""
    player_key = normalize_character_name(player_character_id)
    return [
        name
        for name in PLAYABLE_CHARACTERS
        if normalize_character_name(name) != player_key and not is_forbidden_npc(name)
    ]


@dataclass(frozen=True)
class SceneDramatis:
    """Distribution PJ (choix) / PNJ (speaker des répliiques)."""

    player_character_id: str
    npc_speaker_id: str


def _protagonists_from_context(context: Optional[Dict[str, Any]]) -> Tuple[Optional[str], Optional[str]]:
    if not context:
        return None, None
    raw = context.get("scene_protagonists") or context.get("_scene_protagonists")
    if not isinstance(raw, dict):
        return None, None
    personnage_a = raw.get("personnage_a")
    personnage_b = raw.get("personnage_b")
    a = str(personnage_a).strip() if isinstance(personnage_a, str) and personnage_a.strip() else None
    b = str(personnage_b).strip() if isinstance(personnage_b, str) and personnage_b.strip() else None
    return a, b


def resolve_scene_dramatis(
    *,
    player_character_id: Optional[str] = None,
    npc_speaker_id: Optional[str] = None,
    context_selections: Optional[Dict[str, Any]] = None,
) -> SceneDramatis:
    """Résout PJ et PNJ à partir des champs explicites ou scene_protagonists."""
    prot_a, prot_b = _protagonists_from_context(context_selections)
    player = player_character_id or prot_a
    npc = npc_speaker_id or prot_b

    if not player or not is_playable_character(player):
        player = DEFAULT_PLAYER_CHARACTER

    if not npc or not is_valid_npc(npc, player):
        candidates: List[str] = []
        candidates.extend(other_playable_characters(player))
        if context_selections:
            for name in context_selections.get("characters") or []:
                if isinstance(name, str) and is_valid_npc(name, player):
                    candidates.append(name)
        npc = candidates[0] if candidates else "PNJ"

    return SceneDramatis(player_character_id=player, npc_speaker_id=npc)


def context_has_location(context: Any) -> bool:
    """Vérifie qu'au moins un lieu est présent dans la sélection."""
    if context is None:
        return False
    if hasattr(context, "locations_full"):
        if (context.locations_full or []) or (context.locations_excerpt or []):
            return True
        scene_loc = getattr(context, "scene_location", None)
        if isinstance(scene_loc, dict) and any(scene_loc.values()):
            return True
        return False
    if isinstance(context, dict):
        if context.get("locations") or context.get("locations_full") or context.get("locations_excerpt"):
            return True
        scene_loc = context.get("scene_location") or context.get("_scene_location")
        if isinstance(scene_loc, dict) and any(v for v in scene_loc.values() if v):
            return True
    return False


def enrich_context_selections_for_scene(
    context: Any,
    dramatis: SceneDramatis,
    *,
    character_catalog: Optional[Sequence[str]] = None,
    random_excerpt_count: int = 1,
    rng: Optional[random.Random] = None,
) -> Any:
    """Injecte PJ/PNJ/lieu dans le contexte et ajoute des fiches excerpt aléatoires."""
    from api.schemas.dialogue import ContextSelection

    rng = rng or random.Random()
    if isinstance(context, ContextSelection):
        data = context.model_copy(deep=True)
    elif isinstance(context, dict):
        data = ContextSelection.model_validate(context)
    else:
        raise TypeError("context doit être ContextSelection ou dict")

    protagonists = {
        "personnage_a": dramatis.player_character_id,
        "personnage_b": dramatis.npc_speaker_id,
    }
    data.scene_protagonists = protagonists

    full_set = set(data.characters_full or [])
    excerpt_set = set(data.characters_excerpt or [])

    # Les protagonistes (PJ + PNJ speaker) doivent toujours être en full pour que
    # leurs champs voix/registre soient disponibles dans le prompt.
    # Si l'un d'eux était déjà en excerpt (sélection UI), on le promeut en full.
    for name in (dramatis.player_character_id, dramatis.npc_speaker_id):
        if name and name != "PNJ":
            excerpt_set.discard(name)
            full_set.add(name)

    if data.scene_location:
        loc_name = data.scene_location.get("sous_lieu") or data.scene_location.get("lieu")
        if isinstance(loc_name, str) and loc_name.strip():
            locs = list(data.locations_full or [])
            if loc_name not in locs and loc_name not in (data.locations_excerpt or []):
                locs.append(loc_name)
                data.locations_full = locs

    if character_catalog and random_excerpt_count > 0:
        reserved = full_set | excerpt_set | {dramatis.player_character_id, dramatis.npc_speaker_id}
        pool = [
            name
            for name in character_catalog
            if name not in reserved and not is_forbidden_npc(name)
        ]
        rng.shuffle(pool)
        for extra in pool[:random_excerpt_count]:
            excerpt_set.add(extra)

    data.characters_full = sorted(full_set)
    data.characters_excerpt = sorted(excerpt_set)
    return data

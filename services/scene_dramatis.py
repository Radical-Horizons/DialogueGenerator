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


def resolve_canonical_name_from_catalog(name: Optional[str], catalog: Sequence[str]) -> str:
    """Retourne le nom GDD canonique correspondant (comparaison insensible aux accents)."""
    if not name or not str(name).strip() or not catalog:
        return str(name).strip() if name else ""
    key = normalize_character_name(str(name))
    for candidate in catalog:
        if normalize_character_name(candidate) == key:
            return candidate
    return str(name).strip()


def infer_parent_location_for_scene(
    sous_lieu: str,
    npc_speaker_id: str,
    context_builder: Any,
) -> Optional[str]:
    """Infère le lieu parent GDD à partir du sous-lieu ou de la fiche PNJ.

    Args:
        sous_lieu: Sous-lieu narratif (ex. atelier).
        npc_speaker_id: PNJ de la scène.
        context_builder: ContextBuilder pour lire fiches et lieux.

    Returns:
        Nom canonique du lieu parent, ou None.
    """
    if not context_builder:
        return None
    location_names = context_builder.get_locations_names()
    if not location_names:
        return None

    sub_key = normalize_character_name(sous_lieu)
    for loc_name in location_names:
        if normalize_character_name(loc_name) == sub_key:
            return loc_name

    npc_data = context_builder.get_character_details_by_name(npc_speaker_id)
    if isinstance(npc_data, dict):
        sections = npc_data.get("sections") or {}
        haystack = " ".join(
            str(sections.get(key) or "")
            for key in ("contexte", "rencontre_initiale", "re_sume__de_la_fiche")
        )
        for loc_name in sorted(location_names, key=len, reverse=True):
            if loc_name in haystack:
                return loc_name
    return None


def order_scene_character_names(
    names: Sequence[str],
    dramatis: SceneDramatis,
) -> List[str]:
    """Ordonne les personnages : PNJ speaker d'abord, PJ ensuite, puis le reste (alpha).

    Garantit que la troncature « tête de contexte » conserve la fiche du speaker.
    """
    remaining = list(dict.fromkeys(n for n in names if n))
    ordered: List[str] = []
    for priority in (dramatis.npc_speaker_id, dramatis.player_character_id):
        if priority and priority in remaining:
            ordered.append(priority)
            remaining.remove(priority)
    ordered.extend(sorted(remaining))
    return ordered


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
    character_catalog: Optional[Sequence[str]] = None,
) -> SceneDramatis:
    """Résout PJ et PNJ à partir des champs explicites ou scene_protagonists."""
    prot_a, prot_b = _protagonists_from_context(context_selections)
    player = player_character_id or prot_a
    npc = npc_speaker_id or prot_b

    if character_catalog:
        if player:
            player = resolve_canonical_name_from_catalog(player, character_catalog)
        if npc:
            npc = resolve_canonical_name_from_catalog(npc, character_catalog)

    if not player or not is_playable_character(player):
        player = DEFAULT_PLAYER_CHARACTER
        if character_catalog:
            player = resolve_canonical_name_from_catalog(player, character_catalog)

    if not npc or not is_valid_npc(npc, player):
        candidates: List[str] = []
        candidates.extend(other_playable_characters(player))
        if context_selections:
            for name in context_selections.get("characters") or []:
                if isinstance(name, str) and is_valid_npc(name, player):
                    candidates.append(name)
            for name in context_selections.get("characters_full") or []:
                if isinstance(name, str) and is_valid_npc(name, player):
                    candidates.append(name)
        if character_catalog:
            candidates = [
                resolve_canonical_name_from_catalog(name, character_catalog)
                for name in candidates
            ]
        npc = candidates[0] if candidates else "PNJ"
    elif character_catalog:
        npc = resolve_canonical_name_from_catalog(npc, character_catalog)

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
    context_builder: Any = None,
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

    # PNJ speaker : fiche complète (voix/registre indispensables à l'incarnation).
    if dramatis.npc_speaker_id and dramatis.npc_speaker_id != "PNJ":
        excerpt_set.discard(dramatis.npc_speaker_id)
        full_set.add(dramatis.npc_speaker_id)

    # PJ : extrait ciblé (résumé + champs voix essentiels via mode excerpt) pour libérer le budget.
    if dramatis.player_character_id:
        full_set.discard(dramatis.player_character_id)
        excerpt_set.add(dramatis.player_character_id)

    if data.scene_location:
        scene_loc = dict(data.scene_location)
        lieu = scene_loc.get("lieu")
        sous_lieu = scene_loc.get("sous_lieu")
        location_names: Sequence[str] = ()
        if context_builder:
            location_names = context_builder.get_locations_names()

        if isinstance(lieu, str) and lieu.strip() and location_names:
            canon_lieu = resolve_canonical_name_from_catalog(lieu, location_names)
            scene_loc["lieu"] = canon_lieu
            locs = list(data.locations_full or [])
            if canon_lieu not in locs and canon_lieu not in (data.locations_excerpt or []):
                locs.append(canon_lieu)
                data.locations_full = locs
        elif (
            (not lieu or not str(lieu).strip())
            and isinstance(sous_lieu, str)
            and sous_lieu.strip()
            and context_builder
        ):
            inferred = infer_parent_location_for_scene(
                sous_lieu.strip(),
                dramatis.npc_speaker_id,
                context_builder,
            )
            if inferred:
                scene_loc["lieu"] = inferred
                locs = list(data.locations_full or [])
                if inferred not in locs and inferred not in (data.locations_excerpt or []):
                    locs.append(inferred)
                    data.locations_full = locs

        loc_name = scene_loc.get("sous_lieu") or scene_loc.get("lieu")
        if isinstance(loc_name, str) and loc_name.strip():
            locs = list(data.locations_full or [])
            if loc_name not in locs and loc_name not in (data.locations_excerpt or []):
                if location_names:
                    canon = resolve_canonical_name_from_catalog(loc_name, location_names)
                    if canon in location_names and canon not in locs:
                        locs.append(canon)
                elif loc_name not in locs:
                    locs.append(loc_name)
                data.locations_full = locs
        data.scene_location = scene_loc

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

    data.characters_full = order_scene_character_names(sorted(full_set), dramatis)
    data.characters_excerpt = order_scene_character_names(sorted(excerpt_set), dramatis)
    return data

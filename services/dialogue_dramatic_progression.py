"""Progression dramatique et format dialogue/didascalie pour la génération.

Beats à la volée (profondeur) + format `line` : paroles entre guillemets,
didascalies en italique narrateur (compensation absence d'images in-game).
"""
from __future__ import annotations

from typing import Optional

DEFAULT_PROGRESSION_MAX_DEPTH = 4

DEFAULT_NODE_SCENE_INSTRUCTIONS = (
    "Écris le nœud : paroles du PNJ entre guillemets ; didascalies claires "
    "en *italique* narrateur (3e personne), hors guillemets."
)

# Lignes injectées dans le prompt XML Unity (prompt_builder).
DIALOGUE_ORALITY_PROMPT_LINES: tuple[str, ...] = (
    "Format `line` (dialogue + didascalie) :",
    "- Paroles du PNJ entre guillemets français « … » ; au nœud START, fixer tu ou vous "
    "dès la première réplique (cohérent sur tout le sous-arbre ; s'appuyer sur la fiche voix "
    "du PNJ et les instructions de scène).",
    "- Didascalies autorisées : *en italique* (markdown *…*), voix narrateur à la 3e personne, "
    "hors guillemets, phrases courtes et claires (gestes, lieu, réaction visible). "
    "Compensent l'absence d'images en jeu.",
    "- Exemple : *Voknir pose la Carte sur l'autel.* « Donne-moi ta main. Le prix est fixé. »",
    "- Interdit dans les guillemets : commentaire de ses propres gestes à la 1re personne "
    "(« je plante », « j'attends que tu… ») — mettre le geste en *italique* narrateur.",
    "- Événements mécaniques (flag, état durable) → aussi `consequences` si pertinent.",
    "- `choices.text` = réplique PJ entre guillemets « … », ou *[action]* en italique crochets.",
    "- Pas d'acquiescement vide en ouverture (« Très bien », « Vous l'avez demandé »).",
    "- Langage clair au premier passage.",
)

_BEAT_BY_PHASE = {
    "accroche": (
        "Beat dramatique (accroche) : tension immédiate (refus, prix, secret, provocation). "
        "Pas de report vague."
    ),
    "first_meeting_start": (
        "Beat dramatique (première rencontre in-game) : le PNJ ouvre la scène (convention : "
        "le PNJ parle en premier). Créer une première impression mémorable et établir le ton "
        "de la relation. Si une relation préexiste dans le lore, la faire sentir sans résumer "
        "toute la biographie. S'appuyer uniquement sur le contexte GDD fourni : ne pas inventer "
        "de complot, d'agents, d'éclaireurs ni d'artefacts non documentés."
    ),
    "complication": (
        "Beat dramatique (complication) : la scène bascule (contre-proposition, refus, prix payé, "
        "révélation) — par le dialogue et/ou une didascalie *italique* nette."
    ),
    "escalade": (
        "Beat dramatique (escalade) : friction ou enjeu nouveau ; le rapport entre personnages change."
    ),
    "pivot": (
        "Beat dramatique (pivot) : retournement (aveu, trahison, offre, rupture)."
    ),
    "cloture": (
        "Beat dramatique (clôture) : trancher (accord, rupture, promesse). Pas de report."
    ),
}

DIALOGUE_GENERATION_GLOBAL_CONSTRAINTS = (
    "\n\nContraintes de génération:\n"
    "- Format `line` : paroles « … » ; didascalies *italique* narrateur (3e pers.), hors guillemets.\n"
    "- Didascalies : claires, concises ; pas de jargon opaque ni rituel commenté dans les guillemets.\n"
    "- Interdit : acquiescements vides (« Très bien », « Vous l'avez demandé ») en ouverture.\n"
    "- `choices.text` : « réplique PJ » ou *[geste]* ; pas synopsis d'intention.\n"
    "- Flags / état durable → `consequences` en complément si besoin.\n"
    "- `choices.test` autorisé avec parcimonie quand le choix comporte risque, incertitude, "
    "pression sociale ou effort notable (format Attribut+Compétence:DD) ; éviter d'en mettre partout.\n"
    "- 1 à 4 phrases (didascalie + réplique comptées ensemble) ; même tu/vous que le START.\n"
    "- Ne pas répéter formulations déjà dans l'historique.\n"
)


def _resolve_beat_phase(
    *,
    depth: int,
    max_depth: int,
    is_start: bool,
    is_leaf: bool,
    scene_type: Optional[str] = None,
) -> str:
    """Retourne la clé de phase dramatique pour cette génération."""
    if is_start:
        if scene_type == "first_meeting":
            return "first_meeting_start"
        return "accroche"
    if is_leaf:
        return "cloture"
    if max_depth <= 0:
        return "complication"
    ratio = depth / max_depth
    if ratio <= 0.34:
        return "complication"
    if ratio <= 0.67:
        return "escalade"
    return "pivot"


def beat_instruction_for(
    *,
    depth: int,
    max_depth: Optional[int] = None,
    is_start: bool = False,
    is_leaf: bool = False,
    scene_type: Optional[str] = None,
) -> str:
    """Instruction de beat à la volée pour une profondeur donnée."""
    effective_max = max_depth if max_depth and max_depth > 0 else DEFAULT_PROGRESSION_MAX_DEPTH
    phase = _resolve_beat_phase(
        depth=depth,
        max_depth=effective_max,
        is_start=is_start,
        is_leaf=is_leaf,
        scene_type=scene_type,
    )
    return _BEAT_BY_PHASE[phase]


def compose_generation_instructions(
    base_instructions: str,
    *,
    depth: int = 1,
    max_depth: Optional[int] = None,
    is_start: bool = False,
    is_leaf: bool = False,
    include_global_constraints: bool = True,
    include_beat: bool = True,
    scene_type: Optional[str] = None,
) -> str:
    """Assemble consignes utilisateur, beat à la volée et contraintes globales."""
    parts: list[str] = []
    base = (base_instructions or "").strip()
    if not base:
        base = DEFAULT_NODE_SCENE_INSTRUCTIONS
    parts.append(base)

    if include_beat:
        parts.append(
            beat_instruction_for(
                depth=depth,
                max_depth=max_depth,
                is_start=is_start,
                is_leaf=is_leaf,
                scene_type=scene_type,
            )
        )

    composed = "\n\n".join(parts)
    if include_global_constraints:
        composed = f"{composed}{DIALOGUE_GENERATION_GLOBAL_CONSTRAINTS}"
    return composed

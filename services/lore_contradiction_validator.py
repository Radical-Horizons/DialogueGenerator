"""Validation des contradictions lore explicites (FR38) — faits GDD vs texte du graphe.

Heuristiques déterministes (pas de LLM). Les contradictions explicites produisent des
erreurs ``lore_contradiction_explicit``. Les cas ambigus (fiche GDD contradictoire,
mention de vitalité sans ancrage GDD) produisent des avertissements stables
``lore_contradiction_potential`` (AC 4.3 #4) — la story 4.4 pourra enrichir les heuristiques.

Performance (AC 4.3 #7) : complexité O(F×N) où F est le nombre de faits vitalité/contextes
distincts et N le nombre de nœuds dialogue avec texte non vide ; chaque test de proximité
est borné par ``_PROXIMITY_RADIUS`` (pas de scan quadratique sur la longueur totale du graphe).
"""
from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Dict, List, Literal, Optional, Sequence, Tuple

from models.prompt_structure import ContextCategory, ContextItem, PromptStructure

if TYPE_CHECKING:
    from core.context.context_builder import ContextBuilder

from services.graph_dialogue_text import build_node_id_to_lore_text, iter_dialogue_like_nodes

logger = logging.getLogger(__name__)

LORE_CONTRADICTION_TYPE = "lore_contradiction_explicit"
LORE_POTENTIAL_TYPE = "lore_contradiction_potential"

Vitality = Literal["alive", "dead"]


def _strip_accents(value: str) -> str:
    """Normalise Unicode NFKD et retire les marques combinantes."""
    nk = unicodedata.normalize("NFKD", value)
    return "".join(c for c in nk if not unicodedata.combining(c))


def normalize_entity_name(name: str) -> str:
    """Clé de comparaison insensible à la casse et aux accents."""
    return _strip_accents(name.strip().lower())


@dataclass(frozen=True)
class LoreGddFact:
    """Fait structuré issu du GDD (ou injecté en tests)."""

    entity_name: str
    category: str
    gdd_path: str
    vitality: Vitality


@dataclass(frozen=True)
class LoreVitalityContext:
    """Contexte vitalité extrait d'une fiche personnage (pour erreurs + avertissements)."""

    entity_name: str
    category: str
    gdd_path: str
    vitality: Optional[Vitality]
    gdd_contradictory_vitality: bool
    has_vitality_signals_in_gdd: bool


_ALIVE_IN_GDD = re.compile(
    r"\b(est vivant|est vivante|est en vie|vit toujours|encore en vie|toujours en vie)\b",
    re.IGNORECASE,
)
_DEAD_IN_GDD = re.compile(
    r"\b(est mort|est morte|est décédé|est décédée|est decede|est decedee|"
    r"a été tué|a été tuée|n['’]est plus|plus parmi nous)\b",
    re.IGNORECASE,
)


def infer_vitality_from_gdd_blob(text: str) -> Optional[Vitality]:
    """Déduit vivant/mort à partir d'un bloc texte GDD (une fiche).

    Retourne None si signal contradictoire ou absent — pas d'erreur explicite.
    """
    if not text or not str(text).strip():
        return None
    blob = str(text).lower()
    alive_hit = _ALIVE_IN_GDD.search(blob) is not None
    dead_hit = _DEAD_IN_GDD.search(blob) is not None
    if alive_hit and dead_hit:
        return None
    if dead_hit:
        return "dead"
    if alive_hit:
        return "alive"
    return None


def _item_display_name(item: ContextItem) -> str:
    meta = item.metadata or {}
    real = meta.get("real_name") or meta.get("nom") or meta.get("name")
    if isinstance(real, str) and real.strip():
        return real.strip()
    return item.name.strip() if item.name else ""


def _concat_item_sections(item: ContextItem) -> str:
    parts: List[str] = []
    for sec in item.sections:
        if sec.content and str(sec.content).strip():
            parts.append(str(sec.content))
    return "\n".join(parts)


def extract_vitality_facts_from_prompt_structure(
    structure: PromptStructure,
) -> List[LoreGddFact]:
    """Extrait des faits vitalité depuis une structure ``ContextBuilder.build_context_json``."""
    facts: List[LoreGddFact] = []
    for section in structure.sections:
        if section.type != "context" or not section.categories:
            continue
        for cat in section.categories:
            if not _category_is_character_like(cat):
                continue
            for item in cat.items:
                display = _item_display_name(item)
                if not display:
                    continue
                blob = _concat_item_sections(item)
                vitality = infer_vitality_from_gdd_blob(blob)
                if vitality is None:
                    continue
                path = f"{cat.title} › {display}"
                facts.append(
                    LoreGddFact(
                        entity_name=display,
                        category=cat.type,
                        gdd_path=path,
                        vitality=vitality,
                    )
                )
    return facts


def extract_vitality_contexts_from_prompt_structure(
    structure: PromptStructure,
) -> List[LoreVitalityContext]:
    """Extrait les contextes vitalité (y compris ambigus / sans signal) pour avertissements AC #4."""
    contexts: List[LoreVitalityContext] = []
    for section in structure.sections:
        if section.type != "context" or not section.categories:
            continue
        for cat in section.categories:
            if not _category_is_character_like(cat):
                continue
            for item in cat.items:
                display = _item_display_name(item)
                if not display:
                    continue
                blob = _concat_item_sections(item)
                if not blob.strip():
                    continue
                alive_hit = _ALIVE_IN_GDD.search(blob) is not None
                dead_hit = _DEAD_IN_GDD.search(blob) is not None
                vitality = infer_vitality_from_gdd_blob(blob)
                contradictory = alive_hit and dead_hit
                has_signals = alive_hit or dead_hit
                path = f"{cat.title} › {display}"
                contexts.append(
                    LoreVitalityContext(
                        entity_name=display,
                        category=cat.type,
                        gdd_path=path,
                        vitality=vitality,
                        gdd_contradictory_vitality=contradictory,
                        has_vitality_signals_in_gdd=has_signals,
                    )
                )
    return contexts


def _category_is_character_like(cat: ContextCategory) -> bool:
    key = (cat.type or "").lower()
    title = (cat.title or "").lower()
    return "character" in key or "personnage" in key or "personnage" in title


_DEAD_IN_DIALOGUE = re.compile(
    r"\b(est mort|est morte|est décédé|est décédée|est decede|est decedee|"
    r"a été tué|a été tuée)\b",
    re.IGNORECASE,
)
_ALIVE_IN_DIALOGUE = re.compile(
    r"\b(est vivant|est vivante|est en vie|vit toujours)\b",
    re.IGNORECASE,
)

# Fenêtre de proximité autour du nom d'entité (caractères) pour éviter les faux positifs globaux.
_PROXIMITY_RADIUS = 120


def _entity_in_proximity_pattern(
    text_lower: str, entity_norm: str, pattern: re.Pattern[str]
) -> bool:
    """Vrai si une occurrence du nom (mots entiers) a le motif dans un voisinage court."""
    if not entity_norm:
        return False
    try:
        escaped = re.escape(entity_norm)
    except re.error:
        return False
    for m in re.finditer(rf"\b{escaped}\b", text_lower):
        start = max(0, m.start() - _PROXIMITY_RADIUS)
        end = min(len(text_lower), m.end() + _PROXIMITY_RADIUS)
        window = text_lower[start:end]
        if pattern.search(window):
            return True
    return False


def _entity_name_word_boundary(text_lower: str, entity_norm: str) -> bool:
    """Vrai si le nom d'entité apparaît comme mot entier dans le texte."""
    if not entity_norm:
        return False
    try:
        escaped = re.escape(entity_norm)
    except re.error:
        return False
    return re.search(rf"\b{escaped}\b", text_lower) is not None


def find_potential_lore_warnings(
    node_text_by_id: Dict[str, str],
    vitality_contexts: Sequence[LoreVitalityContext],
) -> List[Dict[str, Any]]:
    """Avertissements ``lore_contradiction_potential`` (GDD ambigu ou ancrage vitalité absent)."""
    warnings: List[Dict[str, Any]] = []
    seen: set[Tuple[str, str, str]] = set()

    for ctx in vitality_contexts:
        if ctx.vitality is not None and not ctx.gdd_contradictory_vitality:
            continue

        ent_norm = normalize_entity_name(ctx.entity_name)
        if not ent_norm:
            continue

        for node_id, text_lower in node_text_by_id.items():
            if ctx.gdd_contradictory_vitality:
                if not _entity_name_word_boundary(text_lower, ent_norm):
                    continue
                key = (node_id, ent_norm, "gdd_contradictory")
                if key in seen:
                    continue
                seen.add(key)
                warnings.append(
                    {
                        "type": LORE_POTENTIAL_TYPE,
                        "node_id": node_id,
                        "message": (
                            f"Lore potentiel : la fiche GDD « {ctx.entity_name} » contient des signaux "
                            f"de vitalité contradictoires ({ctx.gdd_path}). Revue humaine recommandée."
                        ),
                        "severity": "warning",
                        "target": ctx.entity_name,
                        "gdd_reference": ctx.gdd_path,
                    }
                )
                continue

            if ctx.has_vitality_signals_in_gdd:
                continue

            dead_near = _entity_in_proximity_pattern(text_lower, ent_norm, _DEAD_IN_DIALOGUE)
            alive_near = _entity_in_proximity_pattern(text_lower, ent_norm, _ALIVE_IN_DIALOGUE)
            if not dead_near and not alive_near:
                continue
            key = (node_id, ent_norm, "no_gdd_anchor")
            if key in seen:
                continue
            seen.add(key)
            warnings.append(
                {
                    "type": LORE_POTENTIAL_TYPE,
                    "node_id": node_id,
                    "message": (
                        f"Lore potentiel : mention de vitalité près de « {ctx.entity_name} » sans signal "
                        f"vivant/mort explicite dans le GDD ({ctx.gdd_path}). Revue humaine recommandée."
                    ),
                    "severity": "warning",
                    "target": ctx.entity_name,
                    "gdd_reference": ctx.gdd_path,
                }
            )

    return warnings


def find_explicit_contradictions(
    node_text_by_id: Dict[str, str],
    facts: Sequence[LoreGddFact],
) -> List[Tuple[str, LoreGddFact, str]]:
    """Retourne liste de (node_id, fait, message_fr) pour contradictions explicites."""
    errors: List[Tuple[str, LoreGddFact, str]] = []
    dedup_seen: set[Tuple[str, str, Vitality]] = set()
    unique_facts: List[LoreGddFact] = []
    for fact in facts:
        key = (normalize_entity_name(fact.entity_name), fact.gdd_path, fact.vitality)
        if key in dedup_seen:
            continue
        dedup_seen.add(key)
        unique_facts.append(fact)

    for node_id, text_lower in node_text_by_id.items():
        for fact in unique_facts:
            ent_norm = normalize_entity_name(fact.entity_name)
            if not ent_norm:
                continue
            if fact.vitality == "alive":
                if _entity_in_proximity_pattern(text_lower, ent_norm, _DEAD_IN_DIALOGUE):
                    msg = (
                        f"Contradiction lore : le GDD indique que « {fact.entity_name} » est vivant(e) "
                        f"({fact.gdd_path}), mais le texte affirme explicitement sa mort."
                    )
                    errors.append((node_id, fact, msg))
            elif fact.vitality == "dead":
                if _entity_in_proximity_pattern(text_lower, ent_norm, _ALIVE_IN_DIALOGUE):
                    msg = (
                        f"Contradiction lore : le GDD indique que « {fact.entity_name} » est mort(e) "
                        f"({fact.gdd_path}), mais le texte affirme explicitement qu'il/elle est vivant(e)."
                    )
                    errors.append((node_id, fact, msg))
    return errors


def build_lore_summary(
    contradiction_count: int,
    nodes_with_contradictions: int,
    potential_warnings_count: int,
    nodes_with_potential_warnings: int,
    dialogue_nodes_analyzed: int,
) -> str:
    """Résumé FR : contradictions explicites, avertissements potentiels, nœuds analysés."""
    c = max(0, contradiction_count)
    n = max(0, nodes_with_contradictions)
    p = max(0, potential_warnings_count)
    np = max(0, nodes_with_potential_warnings)
    analyzed = max(0, dialogue_nodes_analyzed)
    parts: List[str] = []

    if c == 0:
        w_an = "nœud dialogue analysé" if analyzed == 1 else "nœuds dialogues analysés"
        parts.append(f"Aucune contradiction lore explicite ({analyzed} {w_an})")
    else:
        w_contra = "contradiction" if c == 1 else "contradictions"
        w_node = "nœud" if n == 1 else "nœuds"
        parts.append(f"{c} {w_contra} explicite{'s' if c != 1 else ''} dans {n} {w_node}")

    if p > 0:
        w_p = "avertissement lore potentiel" if p == 1 else "avertissements lore potentiels"
        w_np = "nœud" if np == 1 else "nœuds"
        parts.append(f"{p} {w_p} dans {np} {w_np}")

    return " — ".join(parts)


# Clés alignées sur le store frontend `ContextSelection` / payload génération.
_CONTEXT_SELECTION_LIST_KEYS: Tuple[str, ...] = (
    "characters_full",
    "characters_excerpt",
    "locations_full",
    "locations_excerpt",
    "items_full",
    "items_excerpt",
    "species_full",
    "species_excerpt",
    "communities_full",
    "communities_excerpt",
    "dialogues_examples",
)


def selections_dict_to_selected_elements(selections: Dict[str, Any]) -> Dict[str, List[str]]:
    """Convertit ``context_selections`` client en dict attendu par ``ContextBuilder.build_context_json``."""
    out: Dict[str, List[str]] = {}
    for key in _CONTEXT_SELECTION_LIST_KEYS:
        raw = selections.get(key)
        if isinstance(raw, list):
            out[key] = [str(x).strip() for x in raw if str(x).strip()]
        else:
            out[key] = []
    return out


def merge_lore_facts_with_context_builder(
    base_facts: List[LoreGddFact],
    context_selections: Dict[str, Any],
    scene_instruction: str,
    context_builder: Optional["ContextBuilder"],
) -> Tuple[List[LoreGddFact], List[LoreVitalityContext]]:
    """Complète les faits explicites et retourne les contextes vitalité (avertissements AC #4).

    Args:
        base_facts: Faits déjà fournis (prioritaires ; déduplication par nom normalisé + vitalité).
        context_selections: Sélections brutes (même contrat que la génération).
        scene_instruction: Scène / région textuelle optionnelle.
        context_builder: Builder injecté ; si None, retourne ``base_facts`` tel quel.

    Returns:
        Tuple (faits dédupliqués, contextes vitalité extraits du prompt — vide si pas de build).
    """
    merged: List[LoreGddFact] = list(base_facts)
    contexts: List[LoreVitalityContext] = []
    if context_builder is None or not context_selections:
        return _dedupe_lore_facts(merged), contexts

    selected = selections_dict_to_selected_elements(context_selections)
    if not any(selected.values()):
        return _dedupe_lore_facts(merged), contexts

    try:
        structure = context_builder.build_context_json(
            selected_elements=selected,
            scene_instruction=scene_instruction or "",
            field_configs=None,
            organization_mode="default",
            max_tokens=70000,
            include_dialogue_type=True,
            element_modes=None,
        )
        extracted = extract_vitality_facts_from_prompt_structure(structure)
        merged.extend(extracted)
        contexts = extract_vitality_contexts_from_prompt_structure(structure)
    except Exception:
        # Pas bloquant : la validation lore peut s'appuyer uniquement sur gdd_lore_facts.
        logger.warning(
            "Extraction faits lore via ContextBuilder ignorée (erreur build_context_json)",
            exc_info=True,
        )

    return _dedupe_lore_facts(merged), contexts


def _dedupe_lore_facts(facts: Sequence[LoreGddFact]) -> List[LoreGddFact]:
    seen: set[Tuple[str, str, Vitality]] = set()
    out: List[LoreGddFact] = []
    for f in facts:
        key = (normalize_entity_name(f.entity_name), f.gdd_path, f.vitality)
        if key in seen:
            continue
        seen.add(key)
        out.append(f)
    return out


def validate_explicit_lore_contradictions(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],  # noqa: ARG001 — réservé alignement API / extensions
    facts: Sequence[LoreGddFact],
    vitality_contexts: Optional[Sequence[LoreVitalityContext]] = None,
) -> Tuple[
    bool,
    List[Dict[str, Any]],
    List[Dict[str, Any]],
    str,
    int,
    int,
    int,
    int,
]:
    """Valide les contradictions lore explicites et signale les cas potentiels (warnings).

    Args:
        nodes: Nœuds graphe.
        edges: Arêtes (non utilisées pour l'heuristique MVP).
        facts: Faits GDD structurés.
        vitality_contexts: Contextes issus du ``ContextBuilder`` pour avertissements AC #4.

    Returns:
        Tuple ``(valid, errors, warnings, summary, c_count, n_c_count, p_count, n_p_count)``.
        ``valid`` est faux dès qu'il existe une contradiction explicite (les warnings ne bloquent pas).
    """
    _ = edges
    node_text_by_id = build_node_id_to_lore_text(nodes)
    raw = find_explicit_contradictions(node_text_by_id, facts)
    error_dicts: List[Dict[str, Any]] = []
    for node_id, fact, message in raw:
        error_dicts.append(
            {
                "type": LORE_CONTRADICTION_TYPE,
                "node_id": node_id,
                "message": message,
                "severity": "error",
                "target": fact.entity_name,
                "gdd_reference": fact.gdd_path,
            }
        )
    nodes_affected = len({e[0] for e in raw})
    ctx_seq = vitality_contexts if vitality_contexts is not None else ()
    warning_dicts = find_potential_lore_warnings(node_text_by_id, ctx_seq)
    nodes_potential = len({w["node_id"] for w in warning_dicts if w.get("node_id")})
    dialogue_analyzed = len(iter_dialogue_like_nodes(nodes))
    summary = build_lore_summary(
        len(raw),
        nodes_affected,
        len(warning_dicts),
        nodes_potential,
        dialogue_analyzed,
    )
    return (
        len(raw) == 0,
        error_dicts,
        warning_dicts,
        summary,
        len(raw),
        nodes_affected,
        len(warning_dicts),
        nodes_potential,
    )

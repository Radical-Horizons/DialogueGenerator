"""Détection context dropping : absence ou usage trop faible du contexte dans le dialogue (FR44).

Story 4.10 : ``ContextDroppingOptionsData`` enrichi pour mandatory_info et règles par type.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, Sequence, Tuple

from services.context_dropping_constants import (
    GLOBAL_NODE_ID,
    MIN_WORDS_FOR_SUBTLETY,
    RulesProfile,
)
from services.context_dropping_facts import (
    ContextKeyPhrase,
    extract_key_phrases_from_context,
    significant_words,
)
from services.graph_dialogue_text import build_node_id_to_lore_text, iter_dialogue_like_nodes
from services.graph_validation_service import _node_data, _node_id
from services.lore_contradiction_validator import normalize_entity_name

CaseKind = Literal["context_dropping", "too_subtle", "mandatory_missing"]


@dataclass
class ContextDroppingCaseInternal:
    """Occurrence interne avant sérialisation API."""

    kind: CaseKind
    node_id: Optional[str]
    node_display_id: Optional[str]
    context_label: str
    message: str
    suggestion: str
    severity: Literal["warning", "info"]


@dataclass
class ContextDroppingOptionsData:
    """Options de détection (Story 4.10 : mandatory_info, type de dialogue, overrides).

    Priorité lors de la fusion : champs requête > règles persistées > constantes.
    """

    rules_profile: RulesProfile = "strict"
    tolerance: Optional[float] = None
    mandatory_info: List[str] = field(default_factory=list)
    dialogue_type: Optional[str] = None
    dialogue_type_overrides: Dict[str, Dict[str, Any]] = field(default_factory=dict)


@dataclass
class ContextDroppingDetectionResult:
    """Résultat du scan."""

    cases: List[ContextDroppingCaseInternal] = field(default_factory=list)
    message: Optional[str] = None
    rules_profile_effective: str = "strict"
    summary: str = ""
    case_count: int = 0


def _display_id_for_node(node: Dict[str, Any]) -> str:
    data = _node_data(node)
    nid = _node_id(node) or ""
    sid = data.get("stableId")
    if isinstance(sid, str) and sid.strip():
        return sid.strip()
    doc_id = data.get("id")
    if isinstance(doc_id, str) and doc_id.strip():
        return doc_id.strip()
    return nid


def _combined_graph_text(node_text_map: Dict[str, str]) -> str:
    return "\n".join(node_text_map.values())


def _word_in_text(word: str, haystack: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(word)}(?!\w)", haystack) is not None


def _classify_phrase(
    phrase: ContextKeyPhrase,
    combined_norm: str,
) -> Tuple[Optional[CaseKind], Optional[str]]:
    """Retourne (kind, suggestion) ou (None, None) si la mention est jugée utilisée."""
    full = phrase.normalized
    if not full:
        return None, None
    # Même normalisation accent-insensible que pour les faits lore (évite faux « subtil »).
    if full in combined_norm:
        return None, None

    words = significant_words(full)
    if len(words) >= MIN_WORDS_FOR_SUBTLETY:
        hits = sum(1 for w in words if _word_in_text(w, combined_norm))
        if 0 < hits < len(words):
            return (
                "too_subtle",
                (
                    f"Renforcez l'explicitation : la mention « {phrase.label} » du contexte "
                    f"n'est reflétée que partiellement dans le dialogue (signal trop indirect pour le MVP)."
                ),
            )
        if hits == 0:
            return (
                "context_dropping",
                (
                    f"Context dropping : « {phrase.label} » (contexte) n'apparaît pas de façon "
                    f"détectable dans les lignes et choix analysés."
                ),
            )
        return None, None

    # Mot unique ou deux mots courts : absence stricte
    return (
        "context_dropping",
        (
            f"Context dropping : « {phrase.label} » du contexte n'est pas utilisé dans le dialogue "
            f"avec un signal détectable."
        ),
    )


def _resolve_effective_profile(opts: ContextDroppingOptionsData) -> RulesProfile:
    """Applique les overrides par type de dialogue si disponibles (fallback : global)."""
    override = opts.dialogue_type_overrides.get(opts.dialogue_type or "")
    if override and "rules_profile" in override:
        candidate = override["rules_profile"]
        if candidate in ("strict", "light"):
            return candidate
    return opts.rules_profile if opts.rules_profile in ("strict", "light") else "strict"


def _check_mandatory_info(
    mandatory_info: List[str],
    combined_norm: str,
    global_node_id: Optional[str],
    global_disp_id: Optional[str],
) -> List[ContextDroppingCaseInternal]:
    """Génère un cas par information obligatoire absente du texte agrégé."""
    cases: List[ContextDroppingCaseInternal] = []
    for label in mandatory_info:
        label_stripped = label.strip()
        if not label_stripped:
            continue
        if normalize_entity_name(label_stripped) not in combined_norm:
            msg = (
                f"Information obligatoire absente : « {label_stripped} » "
                f"n'apparaît pas dans les nœuds analysés."
            )
            cases.append(
                ContextDroppingCaseInternal(
                    kind="mandatory_missing",
                    node_id=global_node_id or GLOBAL_NODE_ID,
                    node_display_id=global_disp_id,
                    context_label=label_stripped[:300],
                    message=msg,
                    suggestion=(
                        f"Ajoutez une référence explicite à « {label_stripped} » "
                        f"dans le dialogue ou les choix des nœuds concernés."
                    ),
                    severity="warning",
                )
            )
    return cases


class ContextDroppingDetector:
    """Compare des mentions clés du contexte au texte des nœuds dialogue."""

    @classmethod
    def detect(
        cls,
        nodes: Sequence[Dict[str, Any]],
        _edges: Sequence[Dict[str, Any]],
        context_selections: Optional[Dict[str, Any]],
        scene_instruction: str = "",
        context_text: Optional[str] = None,
        options: Optional[ContextDroppingOptionsData] = None,
    ) -> ContextDroppingDetectionResult:
        """Analyse le graphe ; ``edges`` réservé pour cohérence d'API avec les autres détecteurs."""
        opts = options or ContextDroppingOptionsData()
        profile: RulesProfile = _resolve_effective_profile(opts)
        result = ContextDroppingDetectionResult(rules_profile_effective=profile)

        if not nodes:
            result.message = "Aucun nœud à analyser : graphe vide."
            result.summary = "0 cas de context dropping détectés"
            result.case_count = 0
            return result

        phrases = extract_key_phrases_from_context(
            context_selections,
            scene_instruction=scene_instruction,
            context_text=context_text,
            rules_profile=profile,
        )
        node_text_map = build_node_id_to_lore_text(list(nodes))
        combined_lower = _combined_graph_text(node_text_map) if node_text_map else ""
        combined_norm = normalize_entity_name(combined_lower)
        dialogue_nodes = iter_dialogue_like_nodes(list(nodes))
        first_id = _node_id(dialogue_nodes[0]) if dialogue_nodes else None
        first_disp = _display_id_for_node(dialogue_nodes[0]) if dialogue_nodes else None

        # Informations obligatoires : vérifiées indépendamment du contexte GDD (AC #4).
        mandatory_cases = _check_mandatory_info(
            opts.mandatory_info, combined_norm, first_id, first_disp
        )
        result.cases.extend(mandatory_cases)

        if not phrases:
            result.message = (
                "Aucune information clé exploitable dans le contexte "
                "(sélections vides, texte absent ou trop court). "
                "Ajoutez des entités en contexte ou un texte de contexte."
            )
            if not mandatory_cases:
                result.summary = "0 cas de context dropping détectés"
                result.case_count = 0
                return result

        if not node_text_map and not mandatory_cases:
            result.message = (
                "Aucun texte de dialogue ou de choix exploitable dans les nœuds "
                "(graphe sans contenu textuel)."
            )
            result.summary = "0 cas de context dropping détectés"
            result.case_count = 0
            return result

        for phrase in phrases:
            kind, user_hint = _classify_phrase(phrase, combined_norm)
            if kind is None:
                continue
            assert user_hint is not None
            sev: Literal["warning", "info"] = "warning" if kind == "context_dropping" else "info"
            msg = user_hint if kind == "context_dropping" else f"Subtilité : {user_hint}"
            result.cases.append(
                ContextDroppingCaseInternal(
                    kind=kind,
                    node_id=first_id or GLOBAL_NODE_ID,
                    node_display_id=first_disp,
                    context_label=phrase.label[:300],
                    message=msg,
                    suggestion=user_hint,
                    severity=sev,
                )
            )

        n = len(result.cases)
        result.case_count = n
        if n == 0:
            result.summary = "0 cas de context dropping détectés"
        else:
            dropping_n = sum(1 for c in result.cases if c.kind == "context_dropping")
            subtle_n = sum(1 for c in result.cases if c.kind == "too_subtle")
            mandatory_n = sum(1 for c in result.cases if c.kind == "mandatory_missing")
            parts = []
            if dropping_n:
                parts.append(f"{dropping_n} absence(s) de contexte")
            if subtle_n:
                parts.append(f"{subtle_n} subtilité")
            if mandatory_n:
                parts.append(f"{mandatory_n} info(s) obligatoire(s) manquante(s)")
            result.summary = f"{n} cas détectés ({', '.join(parts)})" if parts else f"{n} cas détectés"
        if n == 0:
            result.message = (
                "Les informations clés du contexte sont présentes dans le dialogue "
                "(heuristique MVP ; faux négatifs possibles)."
            )
        return result

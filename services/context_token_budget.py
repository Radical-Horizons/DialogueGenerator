"""Estimation du poids en tokens de la sélection GDD (hors troncature budget utilisateur).

Utilisé pour FR20 : comparer la sélection « pleine » à un plafond utilisateur, indépendamment
de la troncature appliquée lors du build avec ``max_context_tokens``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from api.schemas.dialogue import ContextSelection, ContextTokenBreakdownRow

BUCKET_SPECS: Tuple[Tuple[str, str], ...] = (
    ("characters", "full"),
    ("characters", "excerpt"),
    ("locations", "full"),
    ("locations", "excerpt"),
    ("items", "full"),
    ("items", "excerpt"),
    ("species", "full"),
    ("species", "excerpt"),
    ("communities", "full"),
    ("communities", "excerpt"),
)


@dataclass(frozen=True)
class ContextSelectionTokenMetrics:
    """Résultat agrégé pour l'UI budget contexte."""

    selection_tokens: int
    breakdown: List[ContextTokenBreakdownRow]
    breakdown_note: str


def _empty_context_selection_dict() -> Dict[str, Any]:
    return {
        "characters_full": [],
        "characters_excerpt": [],
        "locations_full": [],
        "locations_excerpt": [],
        "items_full": [],
        "items_excerpt": [],
        "species_full": [],
        "species_excerpt": [],
        "communities_full": [],
        "communities_excerpt": [],
        "dialogues_examples": [],
        "scene_protagonists": None,
        "scene_location": None,
        "generation_settings": None,
    }


def _base_partial_dict(full: Dict[str, Any]) -> Dict[str, Any]:
    """Copie les métadonnées de scène / exemples depuis la sélection complète."""
    out = _empty_context_selection_dict()
    out["dialogues_examples"] = list(full.get("dialogues_examples") or [])
    if full.get("scene_protagonists") is not None:
        out["scene_protagonists"] = full["scene_protagonists"]
    if full.get("scene_location") is not None:
        out["scene_location"] = full["scene_location"]
    if full.get("generation_settings") is not None:
        out["generation_settings"] = full["generation_settings"]
    return out


def _count_context_tokens_for_selection_dict(
    *,
    context_builder: Any,
    selection_dict: Dict[str, Any],
    user_instructions: str,
    field_configs: Optional[Dict[str, List[str]]],
    organization_mode: str,
    measurement_max_tokens: int,
) -> int:
    """Construit le contexte JSON puis compte les tokens du texte sérialisé."""
    cs = ContextSelection.model_validate(selection_dict)
    service_dict = cs.to_service_dict()
    structured = context_builder.build_context_json(
        selected_elements=service_dict,
        scene_instruction=user_instructions,
        field_configs=field_configs,
        organization_mode=organization_mode,
        max_tokens=measurement_max_tokens,
        include_dialogue_type=True,
        element_modes=service_dict.get("_element_modes"),
    )
    text = context_builder.serialize_context_to_text(structured)
    return int(context_builder._count_tokens(text))


def _breakdown_from_prompt_structure(structured: Any) -> List[ContextTokenBreakdownRow]:
    """Extrait un breakdown type/mode depuis une structure de contexte déjà construite."""
    rows_by_key: Dict[Tuple[str, str], int] = {}
    for section in getattr(structured, "sections", []) or []:
        for category in getattr(section, "categories", []) or []:
            entity_type = str(getattr(category, "type", "") or "")
            if entity_type not in {spec[0] for spec in BUCKET_SPECS}:
                continue
            for item in getattr(category, "items", []) or []:
                metadata = getattr(item, "metadata", None) or {}
                mode = str(metadata.get("mode") or "full")
                key = (entity_type, mode if mode in {"full", "excerpt"} else "full")
                rows_by_key[key] = rows_by_key.get(key, 0) + int(getattr(item, "tokenCount", None) or 0)
    return [
        ContextTokenBreakdownRow(entity_type=entity_type, mode=mode, token_count=tokens)
        for (entity_type, mode), tokens in rows_by_key.items()
        if tokens > 0
    ]


def compute_context_selection_token_metrics(
    context_builder: Any,
    *,
    full_selection: ContextSelection,
    user_instructions: str,
    field_configs: Optional[Dict[str, List[str]]],
    organization_mode: str,
    measurement_max_tokens: int,
    include_breakdown: bool = True,
) -> ContextSelectionTokenMetrics:
    """Calcule les tokens « pleine sélection » et un breakdown par type/mode.

    Chaque ligne du breakdown isole un compartiment (ex. personnages mode complet) : la somme
    des lignes peut dépasser ``selection_tokens`` car les en-têtes/formatage sont répétés.

    Args:
        context_builder: Instance ``ContextBuilder`` (injection tests).
        full_selection: Sélection API complète.
        user_instructions: Instructions scène (identiques au build principal).
        field_configs: Config champs contexte (optionnel).
        organization_mode: Mode d'organisation narrative / default / minimal.
        measurement_max_tokens: Plafond technique pour la mesure (ex. MAX_CONTEXT_TOKENS).
        include_breakdown: Si False, saute les builds isolés par type/mode pour les chemins rapides.

    Returns:
        Métriques pour réponse ``/context/estimate-tokens``.
    """
    full_dict = full_selection.model_dump()

    service_dict = full_selection.to_service_dict()
    structured = context_builder.build_context_json(
        selected_elements=service_dict,
        scene_instruction=user_instructions,
        field_configs=field_configs,
        organization_mode=organization_mode,
        max_tokens=measurement_max_tokens,
        include_dialogue_type=True,
        element_modes=service_dict.get("_element_modes"),
    )
    text = context_builder.serialize_context_to_text(structured)
    selection_tokens = int(context_builder._count_tokens(text))

    breakdown: List[ContextTokenBreakdownRow] = []
    if not include_breakdown:
        return ContextSelectionTokenMetrics(
            selection_tokens=selection_tokens,
            breakdown=breakdown,
            breakdown_note="Breakdown non calculé pour cette mesure rapide.",
        )

    structured_breakdown = _breakdown_from_prompt_structure(structured)
    if structured_breakdown:
        note = (
            "Breakdown dérivé de la structure complète déjà construite ; le total affiché pour "
            "le budget utilise la sélection complète en un seul build."
        )
        return ContextSelectionTokenMetrics(
            selection_tokens=selection_tokens,
            breakdown=structured_breakdown,
            breakdown_note=note,
        )

    non_empty_buckets = [
        (entity_type, mode)
        for entity_type, mode in BUCKET_SPECS
        if full_dict.get(f"{entity_type}_{mode}")
    ]
    for entity_type, mode in BUCKET_SPECS:
        key = f"{entity_type}_{mode}"
        names = list(full_dict.get(key) or [])
        if not names:
            continue
        if len(non_empty_buckets) == 1:
            tok = selection_tokens
        else:
            partial = _base_partial_dict(full_dict)
            partial[key] = names
            tok = _count_context_tokens_for_selection_dict(
                context_builder=context_builder,
                selection_dict=partial,
                user_instructions=user_instructions,
                field_configs=field_configs,
                organization_mode=organization_mode,
                measurement_max_tokens=measurement_max_tokens,
            )
        breakdown.append(
            ContextTokenBreakdownRow(entity_type=entity_type, mode=mode, token_count=tok)
        )

    note = (
        "Les lignes sont des mesures isolées par type et mode ; leur somme peut dépasser le "
        "total « sélection » car les en-têtes de contexte sont comptés plusieurs fois. "
        "Le total affiché pour le budget utilise la sélection complète en un seul build."
    )
    return ContextSelectionTokenMetrics(
        selection_tokens=selection_tokens,
        breakdown=breakdown,
        breakdown_note=note,
    )

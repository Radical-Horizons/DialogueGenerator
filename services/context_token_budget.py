"""Estimation du poids en tokens de la sélection GDD (hors troncature budget utilisateur).

Utilisé pour FR20 : comparer la sélection « pleine » à un plafond utilisateur, indépendamment
de la troncature appliquée lors du build avec ``max_context_tokens``.
"""
from __future__ import annotations

import hashlib
import json
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from api.schemas.dialogue import ContextSelection, ContextTokenBreakdownRow
from services.context_truncator import cap_context_text_to_budget
from services.context_token_reconciler import reconcile_prompt_structure_token_counts

_METRICS_CACHE_MAXSIZE: int = 64
_METRICS_CACHE: "OrderedDict[str, ContextSelectionTokenMetrics]" = OrderedDict()


def clear_context_metrics_cache() -> None:
    """Vide le cache LRU des métriques (utilitaire de test)."""
    _METRICS_CACHE.clear()


def _metrics_cache_key(
    *,
    gdd_revision: int,
    full_dict: Dict[str, Any],
    user_instructions: str,
    field_configs: Optional[Dict[str, List[str]]],
    organization_mode: str,
    measurement_max_tokens: int,
    include_breakdown: bool,
    user_budget_max_tokens: Optional[int],
) -> str:
    """Calcule une clé de cache stable pour une mesure de tokens contexte."""
    payload = {
        "rev": gdd_revision,
        "sel": full_dict,
        "instr": user_instructions,
        "fields": field_configs,
        "org": organization_mode,
        "meas": measurement_max_tokens,
        "breakdown": include_breakdown,
        "budget": user_budget_max_tokens,
    }
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

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
    context_tokens: int
    breakdown: List[ContextTokenBreakdownRow]
    breakdown_note: str
    serialized_text: str = ""


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
    user_budget_max_tokens: Optional[int] = None,
    prebuilt_structure: Optional[Any] = None,
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
        user_budget_max_tokens: Plafond utilisateur pour ``context_tokens`` (troncature post-sérialisation).
        prebuilt_structure: Structure déjà construite (évite un second ``build_context_json``).

    Returns:
        Métriques pour réponse ``/context/estimate-tokens``.
    """
    full_dict = full_selection.model_dump()

    gdd_revision = int(getattr(context_builder, "gdd_revision", -1))
    cache_key: Optional[str] = None
    if gdd_revision >= 0:
        cache_key = _metrics_cache_key(
            gdd_revision=gdd_revision,
            full_dict=full_dict,
            user_instructions=user_instructions,
            field_configs=field_configs,
            organization_mode=organization_mode,
            measurement_max_tokens=measurement_max_tokens,
            include_breakdown=include_breakdown,
            user_budget_max_tokens=user_budget_max_tokens,
        )
        cached = _METRICS_CACHE.get(cache_key)
        if cached is not None:
            _METRICS_CACHE.move_to_end(cache_key)
            return cached

    def _finalize(metrics: ContextSelectionTokenMetrics) -> ContextSelectionTokenMetrics:
        if cache_key is not None:
            _METRICS_CACHE[cache_key] = metrics
            _METRICS_CACHE.move_to_end(cache_key)
            while len(_METRICS_CACHE) > _METRICS_CACHE_MAXSIZE:
                _METRICS_CACHE.popitem(last=False)
        return metrics

    if prebuilt_structure is not None:
        structured = prebuilt_structure
        reconciled_total = int(
            getattr(getattr(structured, "metadata", None), "totalTokens", 0) or 0
        )
        if reconciled_total <= 0:
            reconcile_prompt_structure_token_counts(structured)
    else:
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
    selection_tokens = int(getattr(getattr(structured, "metadata", None), "totalTokens", 0) or 0)
    if selection_tokens <= 0:
        selection_tokens = int(context_builder._count_tokens(text))
    context_tokens = selection_tokens
    if user_budget_max_tokens is not None:
        capped_text = cap_context_text_to_budget(text, user_budget_max_tokens)
        context_tokens = (
            selection_tokens
            if capped_text == text
            else int(context_builder._count_tokens(capped_text))
        )

    breakdown: List[ContextTokenBreakdownRow] = []
    if not include_breakdown:
        return _finalize(ContextSelectionTokenMetrics(
            selection_tokens=selection_tokens,
            context_tokens=context_tokens,
            breakdown=breakdown,
            breakdown_note="Breakdown non calculé pour cette mesure rapide.",
            serialized_text=text,
        ))

    structured_breakdown = _breakdown_from_prompt_structure(structured)
    if structured_breakdown:
        reconciled_total = int(getattr(getattr(structured, "metadata", None), "totalTokens", 0) or 0)
        if reconciled_total > 0:
            selection_tokens = reconciled_total
            if user_budget_max_tokens is not None:
                capped_text = cap_context_text_to_budget(text, user_budget_max_tokens)
                context_tokens = (
                    selection_tokens
                    if capped_text == text
                    else int(context_builder._count_tokens(capped_text))
                )
        note = (
            "Les lignes sont la somme des fiches par type/mode ; le total « sélection » "
            "égale la somme des catégories (un seul encodage tiktoken sur le texte sérialisé)."
        )
        return _finalize(ContextSelectionTokenMetrics(
            selection_tokens=selection_tokens,
            context_tokens=context_tokens,
            breakdown=structured_breakdown,
            breakdown_note=note,
            serialized_text=text,
        ))

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
    return _finalize(ContextSelectionTokenMetrics(
        selection_tokens=selection_tokens,
        context_tokens=context_tokens,
        breakdown=breakdown,
        breakdown_note=note,
        serialized_text=text,
    ))

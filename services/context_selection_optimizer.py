"""Optimisation déterministe de la sélection GDD pour respecter un budget tokens (FR21).

Utilise exclusivement ``compute_context_selection_token_metrics`` pour mesurer les tokens,
afin de rester aligné sur ``/context/estimate-tokens``.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from api.schemas.dialogue import (
    ContextOptimizationRules,
    ContextSelection,
    OptimizeContextChange,
    OptimizeContextEffectReport,
    OptimizeContextResponse,
)
from constants import Defaults
from services.context_token_budget import compute_context_selection_token_metrics

logger = logging.getLogger(__name__)

# Ordre de réduction « conservative » : types jugés moins centraux en premier.
_CONSERVATIVE_REDUCTION_ORDER: Tuple[str, ...] = (
    "communities",
    "species",
    "items",
    "locations",
    "characters",
)
_AGGRESSIVE_REDUCTION_ORDER: Tuple[str, ...] = tuple(reversed(_CONSERVATIVE_REDUCTION_ORDER))


def _reduction_order(strategy: str) -> Tuple[str, ...]:
    if strategy == "aggressive":
        return _AGGRESSIVE_REDUCTION_ORDER
    return _CONSERVATIVE_REDUCTION_ORDER


def _pin_set(rules: ContextOptimizationRules) -> Set[str]:
    return {k.strip() for k in rules.pinned_entity_keys if k.strip()}


def _iter_candidate_moves(
    work: ContextSelection,
    order: Tuple[str, ...],
    pinned: Set[str],
) -> Iterable[Tuple[str, str]]:
    """Yield (entity_type, name) pour chaque entité encore en mode full, dans l'ordre de réduction."""
    for entity_type in order:
        full_key = f"{entity_type}_full"
        names = sorted(getattr(work, full_key, []) or [])
        for name in names:
            key = f"{entity_type}:{name}"
            if key in pinned:
                continue
            yield entity_type, name


def _move_full_to_excerpt(work: ContextSelection, entity_type: str, name: str) -> None:
    full_key = f"{entity_type}_full"
    excerpt_key = f"{entity_type}_excerpt"
    full_list = list(getattr(work, full_key) or [])
    excerpt_list = list(getattr(work, excerpt_key) or [])
    if name not in full_list:
        return
    setattr(work, full_key, [x for x in full_list if x != name])
    if name not in excerpt_list:
        excerpt_list.append(name)
    setattr(work, excerpt_key, excerpt_list)


def _measure(
    context_builder: Any,
    *,
    selection: ContextSelection,
    user_instructions: str,
    field_configs: Optional[Dict[str, List[str]]],
    organization_mode: str,
    measurement_max_tokens: int,
) -> int:
    m = compute_context_selection_token_metrics(
        context_builder,
        full_selection=selection,
        user_instructions=user_instructions,
        field_configs=field_configs,
        organization_mode=organization_mode,
        measurement_max_tokens=measurement_max_tokens,
        include_breakdown=False,
    )
    return int(m.selection_tokens)


def _tokens_by_entity_type(metrics_breakdown: List[Any]) -> Dict[str, int]:
    """Agrège un breakdown token par type d'entité."""
    out: Dict[str, int] = {}
    for row in metrics_breakdown:
        out[row.entity_type] = out.get(row.entity_type, 0) + int(row.token_count)
    return out


def _build_effect_report(
    *,
    changes: List[OptimizeContextChange],
    rules: ContextOptimizationRules,
    before_breakdown: List[Any],
    after_breakdown: List[Any],
) -> OptimizeContextEffectReport:
    """Construit le rapport d'effets affichable par le frontend."""
    changes_by_type: Dict[str, int] = {}
    for change in changes:
        changes_by_type[change.entity_type] = changes_by_type.get(change.entity_type, 0) + 1
    return OptimizeContextEffectReport(
        changes_by_entity_type=changes_by_type,
        pinned_entity_keys=sorted(_pin_set(rules)),
        tokens_before_by_entity_type=_tokens_by_entity_type(before_breakdown),
        tokens_after_by_entity_type=_tokens_by_entity_type(after_breakdown),
    )


def compute_pre_generation_fidelity_proxy_percent(
    tokens_before: int,
    tokens_after: int,
) -> int:
    """Proxy pré-génération : ratio tokens après / avant (0–100), borné."""
    if tokens_before <= 0:
        return 100 if tokens_after <= 0 else 0
    ratio = tokens_after / tokens_before
    return max(0, min(100, int(round(ratio * 100))))


def optimize_context_selection(
    context_builder: Any,
    *,
    initial_selection: ContextSelection,
    user_instructions: str,
    field_configs: Optional[Dict[str, List[str]]],
    organization_mode: str,
    budget_tokens: int,
    rules: ContextOptimizationRules,
    measurement_max_tokens: int = Defaults.MAX_CONTEXT_TOKENS,
) -> OptimizeContextResponse:
    """Produit une sélection proposée dont les tokens estimés sont ≤ budget_tokens.

    Déterministe : même entrée et même GDD → même sortie.

    Args:
        context_builder: ContextBuilder injecté.
        initial_selection: Sélection courante (API).
        user_instructions: Instructions scène (identiques estimate-tokens).
        field_configs: Config champs (optionnel).
        organization_mode: Mode d'organisation narrative / default / minimal.
        budget_tokens: Plafond utilisateur (FR20 / max_context_tokens).
        rules: Règles MVP (épingles, stratégie, seuil warning).
        measurement_max_tokens: Plafond technique de mesure (aligné estimate-tokens).

    Returns:
        Réponse structurée pour le client.
    """
    work = ContextSelection.model_validate(initial_selection.model_dump())
    order = _reduction_order(rules.strategy)
    pinned = _pin_set(rules)

    tokens_before = _measure(
        context_builder,
        selection=work,
        user_instructions=user_instructions,
        field_configs=field_configs,
        organization_mode=organization_mode,
        measurement_max_tokens=measurement_max_tokens,
    )
    before_metrics_for_report = compute_context_selection_token_metrics(
        context_builder,
        full_selection=work,
        user_instructions=user_instructions,
        field_configs=field_configs,
        organization_mode=organization_mode,
        measurement_max_tokens=measurement_max_tokens,
    )

    if tokens_before <= budget_tokens:
        return OptimizeContextResponse(
            proposed_context_selections=work,
            selection_tokens_before=tokens_before,
            selection_tokens_after=tokens_before,
            tokens_saved=0,
            changes=[],
            pre_generation_context_fidelity_proxy_percent=100,
            warnings=[],
            no_op=True,
            budget_respected=True,
            effect_report=_build_effect_report(
                changes=[],
                rules=rules,
                before_breakdown=before_metrics_for_report.breakdown,
                after_breakdown=before_metrics_for_report.breakdown,
            ),
        )

    changes: List[OptimizeContextChange] = []
    max_steps = 512
    step = 0

    while step < max_steps:
        current = _measure(
            context_builder,
            selection=work,
            user_instructions=user_instructions,
            field_configs=field_configs,
            organization_mode=organization_mode,
            measurement_max_tokens=measurement_max_tokens,
        )
        if current <= budget_tokens:
            break
        moved = False
        for entity_type, name in _iter_candidate_moves(work, order, pinned):
            _move_full_to_excerpt(work, entity_type, name)
            changes.append(
                OptimizeContextChange(
                    entity_type=entity_type,
                    entity_name=name,
                    from_mode="full",
                    to_mode="excerpt",
                )
            )
            moved = True
            break
        if not moved:
            logger.warning(
                "Optimisation contexte : budget %s non atteignable sans retirer des entités "
                "épinglées ou déjà en extrait (tokens=%s).",
                budget_tokens,
                current,
            )
            break
        step += 1

    tokens_after = _measure(
        context_builder,
        selection=work,
        user_instructions=user_instructions,
        field_configs=field_configs,
        organization_mode=organization_mode,
        measurement_max_tokens=measurement_max_tokens,
    )
    after_metrics_for_report = compute_context_selection_token_metrics(
        context_builder,
        full_selection=work,
        user_instructions=user_instructions,
        field_configs=field_configs,
        organization_mode=organization_mode,
        measurement_max_tokens=measurement_max_tokens,
    )
    tokens_saved = max(0, tokens_before - tokens_after)
    proxy = compute_pre_generation_fidelity_proxy_percent(tokens_before, tokens_after)

    warnings: List[str] = []
    thr = rules.pre_generation_proxy_warning_threshold_percent
    if proxy < thr:
        warnings.append(
            f"Proxy pré-génération faible ({proxy} % < seuil {thr} %). "
            "Envisagez d'augmenter le budget ou d'ajuster les règles / épingles."
        )
    budget_respected = tokens_after <= budget_tokens
    if not budget_respected:
        warnings.append(
            "Le budget tokens n'a pas pu être respecté sans retirer des entités "
            "(toutes les cibles restantes sont épinglées ou déjà en extrait). "
            "Augmentez le budget, désépinglez des entités ou retirez des fiches du contexte."
        )

    return OptimizeContextResponse(
        proposed_context_selections=work,
        selection_tokens_before=tokens_before,
        selection_tokens_after=tokens_after,
        tokens_saved=tokens_saved,
        changes=changes,
        pre_generation_context_fidelity_proxy_percent=proxy,
        warnings=warnings,
        no_op=False,
        budget_respected=budget_respected,
        effect_report=_build_effect_report(
            changes=changes,
            rules=rules,
            before_breakdown=before_metrics_for_report.breakdown,
            after_breakdown=after_metrics_for_report.breakdown,
        ),
    )

"""Validation titres de faction et diagnostics sociaux FR94."""

from __future__ import annotations

import logging
from typing import Any, Literal, Mapping

from pydantic import BaseModel, TypeAdapter

from api.schemas.choice_effects import ChoiceEffectAtom, ReputationDeltaEffect
from api.schemas.visibility_conditions import ReputationCondition, VisibilityConditionsBlock
from services.game_systems_reputation import validate_dialogue_flags_do_not_store_rep_palier

INFLUENCE_RESPECT_SYSTEM_LABEL = "Influence & Respect (PJ possédés)"

logger = logging.getLogger(__name__)
_visibility_block_adapter = TypeAdapter(VisibilityConditionsBlock)
_choice_effect_adapter = TypeAdapter(ChoiceEffectAtom)


class FactionTitleValidationResult(BaseModel):
    """Résultat de validation d'une condition de titre de faction."""

    model_config = {"extra": "forbid"}

    valid: bool
    source: Literal["one_way_flag", "title_catalog"] | None = None
    message: str | None = None


def validate_faction_title_condition(
    condition: dict[str, Any],
    catalog_title_ids: set[str] | None = None,
) -> FactionTitleValidationResult:
    """Valide qu'un titre vient d'un flag one-way ou du catalogue titres."""
    flag_id = str(condition.get("flagId", ""))
    if flag_id.startswith("Flag_faction_titre_"):
        return FactionTitleValidationResult(valid=True, source="one_way_flag")

    title_id = str(condition.get("titleId", ""))
    if title_id and title_id in (catalog_title_ids or set()):
        return FactionTitleValidationResult(valid=True, source="title_catalog")

    return FactionTitleValidationResult(
        valid=False,
        message=(
            "Un titre de faction doit référencer un flag one-way "
            "`Flag_faction_titre_{faction}` ou une entrée du catalogue titres."
        ),
    )


def social_system_confusion_message(axis_id: str) -> str:
    """Formate le diagnostic commun Influence/Respect vs Réputation."""
    return (
        f"{axis_id} appartient au système {INFLUENCE_RESPECT_SYSTEM_LABEL}, "
        "pas à la Réputation."
    )


def diagnose_reputation_axis_confusion(axis_id: str) -> dict[str, str] | None:
    """Signale Influence/Respect lorsqu'ils sont utilisés comme Réputation."""
    if axis_id not in {"Influence", "Respect"}:
        return None
    return {
        "code": "social_system_confusion",
        "message": social_system_confusion_message(axis_id),
    }


def _node_identity(node: Mapping[str, Any]) -> str:
    """Retourne l'identifiant stable utile pour les chemins de diagnostic."""
    return str(node.get("id") or node.get("stableId") or "").strip()


def _parse_visibility_block(raw: Any, path: str) -> VisibilityConditionsBlock | None:
    """Parse un bloc de conditions sans faire échouer la validation globale."""
    if raw is None:
        return None
    try:
        return _visibility_block_adapter.validate_python(raw)
    except Exception:
        logger.debug("Bloc visibilityConditions ignoré pour diagnostics FR94: %s", path, exc_info=True)
        return None


def _parse_choice_effect(raw: Any, path: str) -> ChoiceEffectAtom | None:
    """Parse un effet de choix sans faire échouer la validation globale."""
    try:
        return _choice_effect_adapter.validate_python(raw)
    except Exception:
        logger.debug("choiceEffect ignoré pour diagnostics FR94: %s", path, exc_info=True)
        return None


def _append_axis_diagnostic(
    findings: list[dict[str, str]],
    axis_id: str,
    path: str,
) -> None:
    diagnostic = diagnose_reputation_axis_confusion(axis_id)
    if diagnostic is None:
        return
    findings.append(
        {
            "code": diagnostic["code"],
            "path": path,
            "message": diagnostic["message"],
        }
    )


def validate_document_social_systems(document: Mapping[str, Any]) -> list[dict[str, str]]:
    """Retourne les diagnostics FR94 à intégrer au rapport de validation document."""
    findings: list[dict[str, str]] = []
    dialogue_flags = document.get("dialogueFlags")
    if isinstance(dialogue_flags, list):
        findings.extend(validate_dialogue_flags_do_not_store_rep_palier(dialogue_flags))

    nodes = document.get("nodes")
    if not isinstance(nodes, list):
        return findings

    for node_index, node in enumerate(nodes):
        if not isinstance(node, Mapping):
            continue
        node_id = _node_identity(node)
        node_prefix = f"nodes[{node_index}]"
        if node_id:
            node_prefix = f"{node_prefix}({node_id})"
        block = _parse_visibility_block(node.get("visibilityConditions"), f"{node_prefix}.visibilityConditions")
        if block:
            for item_index, atom in enumerate(block.items):
                if isinstance(atom, ReputationCondition):
                    _append_axis_diagnostic(
                        findings,
                        atom.axisId,
                        f"{node_prefix}.visibilityConditions.items[{item_index}].axisId",
                    )
        for choice_index, choice in enumerate(node.get("choices") or []):
            if not isinstance(choice, Mapping):
                continue
            choice_prefix = f"{node_prefix}.choices[{choice_index}]"
            choice_block = _parse_visibility_block(
                choice.get("visibilityConditions"),
                f"{choice_prefix}.visibilityConditions",
            )
            if choice_block:
                for item_index, atom in enumerate(choice_block.items):
                    if isinstance(atom, ReputationCondition):
                        _append_axis_diagnostic(
                            findings,
                            atom.axisId,
                            f"{choice_prefix}.visibilityConditions.items[{item_index}].axisId",
                        )
            effects = choice.get("choiceEffects")
            if not isinstance(effects, list):
                continue
            for effect_index, raw_effect in enumerate(effects):
                effect = _parse_choice_effect(raw_effect, f"{choice_prefix}.choiceEffects[{effect_index}]")
                if isinstance(effect, ReputationDeltaEffect):
                    _append_axis_diagnostic(
                        findings,
                        effect.axisId,
                        f"{choice_prefix}.choiceEffects[{effect_index}].axisId",
                    )
    return findings

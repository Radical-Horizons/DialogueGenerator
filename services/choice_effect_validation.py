"""Validation catalogue des effets sur choix (Story 9.3).

Couche pure + service injectable ; aligné sur ``visibility_condition_validation`` (Story 9.2).
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, MutableMapping

from pydantic import TypeAdapter

from api.schemas.choice_effects import (
    AdjustCounterEffect,
    ChoiceEffectAtom,
    ReputationDeltaEffect,
    SetBoolEffect,
    SetEnumEffect,
)
from services.dialogue_flag_validation import default_counter_bounds
from services.flag_catalog_index import definitions_by_id_from_catalog
from services.flag_catalog_service import FlagCatalogService
from services.reputation_effect_bounds import reputation_delta_bounds_for_axis

_atom_adapter = TypeAdapter(ChoiceEffectAtom)

def _parse_catalog_default_numeric(meta: Mapping[str, Any]) -> float | None:
    """Lit une valeur par défaut numérique depuis une ligne catalogue."""
    raw = meta.get("defaultValue")
    if raw is None or raw == "":
        return None
    try:
        s = str(raw).strip()
        if not s:
            return None
        return float(s) if "." in s else float(int(s))
    except (TypeError, ValueError):
        return None


def _initial_counter_value(
    document: Mapping[str, Any],
    flag_id: str,
    meta: Mapping[str, Any],
    csv_type: str,
) -> float:
    """Valeur de départ pour simulation clamp (dialogueFlags puis défaut catalogue)."""
    bindings = document.get("dialogueFlags")
    if isinstance(bindings, list):
        for b in bindings:
            if not isinstance(b, Mapping):
                continue
            if str(b.get("flagId") or "").strip() != flag_id:
                continue
            iv = b.get("initialValue")
            if iv is None:
                break
            try:
                return float(iv)
            except (TypeError, ValueError):
                break
    d = _parse_catalog_default_numeric(meta)
    if d is not None:
        return d
    lo = meta.get("minValue")
    hi = meta.get("maxValue")
    if lo is None or hi is None:
        lo, hi = default_counter_bounds(csv_type)
    return float(lo)


def _apply_counter_operator(current: float, op: str, operand: float) -> float:
    """Applique =, +=, -= sur un compteur."""
    if op == "=":
        return operand
    if op == "+=":
        return current + operand
    if op == "-=":
        return current - operand
    raise ValueError(f"opérateur compteur invalide: {op}")


def validate_effect_atom_against_catalog(
    atom: ChoiceEffectAtom,
    definitions_by_id: Mapping[str, Mapping[str, Any]],
    document: Mapping[str, Any],
    path: str,
) -> None:
    """Valide un effet typé contre le catalogue et les bornes GDD.

    Raises:
        ValueError: incohérence type, hors bornes, ou ID inconnu.
    """
    if isinstance(atom, ReputationDeltaEffect):
        lo, hi = reputation_delta_bounds_for_axis(atom.axisId)
        if atom.delta < lo or atom.delta > hi:
            raise ValueError(
                f"{path}: delta réputation hors bornes pour l'axe « {atom.axisId} » "
                f"([{lo}, {hi}], GDD)."
            )
        return

    flag_id = atom.flagId.strip()
    meta = definitions_by_id.get(flag_id)
    if meta is None:
        raise ValueError(f"{path}: flag catalogue inconnu: {flag_id}")

    semantic = str(meta.get("semanticType") or "").strip().lower()
    if semantic == "unsupported":
        raise ValueError(f"{path}: flag {flag_id} non utilisable (unsupported).")

    csv_type = str(meta.get("type") or "bool").strip().lower()

    if isinstance(atom, SetBoolEffect):
        if semantic != "bool":
            raise ValueError(
                f"{path}: effet set_bool incompatible avec le type catalogue de {flag_id} "
                f"(« {semantic} », attendu bool)."
            )
        return

    if isinstance(atom, SetEnumEffect):
        if semantic != "enum":
            raise ValueError(
                f"{path}: effet set_enum incompatible avec le type catalogue de {flag_id} "
                f"(« {semantic} », attendu enum)."
            )
        allowed = meta.get("enumValues") or []
        if not isinstance(allowed, list) or not allowed:
            raise ValueError(f"{path}: catalogue enum incomplet pour {flag_id}.")
        allowed_str = [str(x) for x in allowed]
        if atom.value not in allowed_str:
            raise ValueError(
                f"{path}: valeur enum « {atom.value} » invalide pour {flag_id} "
                f"(autorisé: {allowed_str})."
            )
        return

    if isinstance(atom, AdjustCounterEffect):
        if semantic != "compteur":
            raise ValueError(
                f"{path}: effet adjust_counter incompatible avec le type catalogue de {flag_id} "
                f"(« {semantic} », attendu compteur)."
            )
        lo = meta.get("minValue")
        hi = meta.get("maxValue")
        if lo is None or hi is None:
            lo, hi = default_counter_bounds(csv_type)
        lo_f, hi_f = float(lo), float(hi)

        current = _initial_counter_value(document, flag_id, meta, csv_type)
        try:
            result = _apply_counter_operator(float(current), atom.operator, float(atom.value))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{path}: valeurs compteur invalides pour {flag_id}.") from exc

        if result < lo_f or result > hi_f:
            raise ValueError(
                f"{path}: après application ({atom.operator} {atom.value}), "
                f"le compteur {flag_id} sortirait des bornes [{lo_f}, {hi_f}] (simulation)."
            )
        return


def parse_and_validate_choice_effects(
    raw: Any,
    path: str,
    definitions_by_id: Mapping[str, Mapping[str, Any]],
    document: Mapping[str, Any],
) -> List[ChoiceEffectAtom]:
    """Parse JSON puis valide chaque effet contre le catalogue."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError(f"{path}: choiceEffects doit être une liste ou être omis.")
    items: List[ChoiceEffectAtom] = []
    for i, entry in enumerate(raw):
        sub = f"{path}[{i}]"
        try:
            atom = _atom_adapter.validate_python(entry)
        except Exception as exc:
            raise ValueError(f"{sub}: effet invalide: {exc}") from exc
        validate_effect_atom_against_catalog(atom, definitions_by_id, document, sub)
        items.append(atom)
    return items


def validate_document_choice_effects(
    document: MutableMapping[str, Any],
    definitions_by_id: Mapping[str, Mapping[str, Any]],
) -> None:
    """Parcourt ``nodes[*].choices[*].choiceEffects``."""
    nodes = document.get("nodes")
    if not isinstance(nodes, list):
        return
    for ni, node in enumerate(nodes):
        if not isinstance(node, MutableMapping):
            continue
        choices = node.get("choices") or []
        if not isinstance(choices, list):
            continue
        for ci, choice in enumerate(choices):
            if not isinstance(choice, MutableMapping):
                continue
            ce = choice.get("choiceEffects")
            if ce is None:
                continue
            parse_and_validate_choice_effects(
                ce,
                f"nodes[{ni}].choices[{ci}].choiceEffects",
                definitions_by_id,
                document,
            )


class ChoiceEffectValidationService:
    """Validation catalogue des listes ``choiceEffects`` sur les choix."""

    def __init__(self, catalog: FlagCatalogService) -> None:
        """Initialise avec le catalogue CSV Unity.

        Args:
            catalog: Service catalogue flags (Story 9.1).
        """
        self._catalog = catalog

    def validate_document(self, document: MutableMapping[str, Any]) -> None:
        """Valide tous les effets du document ; lève ``ValueError`` si erreur bloquante."""
        definitions_by_id = definitions_by_id_from_catalog(self._catalog)
        validate_document_choice_effects(document, definitions_by_id)

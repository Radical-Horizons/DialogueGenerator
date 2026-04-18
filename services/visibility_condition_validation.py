"""Validation catalogue des conditions de visibilité (Story 9.2).

Couche pure + service injectable ; les routers restent minces.
"""

from __future__ import annotations

from typing import Any, Dict, Mapping, MutableMapping, Union

from api.schemas.visibility_conditions import (
    FlagBoolCondition,
    FlagCounterCondition,
    FlagEnumCondition,
    ReputationCondition,
    VisibilityConditionsBlock,
)
from services.dialogue_flag_validation import default_counter_bounds
from services.flag_catalog_service import FlagCatalogService

_COUNT_OPS: frozenset[str] = frozenset({"=", "!=", ">=", "<=", ">", "<"})
_ENUM_OPS: frozenset[str] = frozenset({"=", "!="})


def _definitions_index(catalog: FlagCatalogService) -> Dict[str, Dict[str, Any]]:
    """Construit un index ``flag_id -> définition enrichie`` (comme Story 9.1)."""
    out: Dict[str, Dict[str, Any]] = {}
    for row in catalog.load_definitions():
        fid = str(row.get("id") or "").strip()
        if fid:
            out[fid] = row
    return out


def validate_atom_against_catalog(
    atom: Union[
        FlagBoolCondition,
        FlagCounterCondition,
        FlagEnumCondition,
        ReputationCondition,
    ],
    definitions_by_id: Mapping[str, Mapping[str, Any]],
    path: str,
) -> None:
    """Valide un atome contre le catalogue flags (réputation : structure uniquement).

    Args:
        atom: Atome déjà parsé Pydantic.
        definitions_by_id: Index catalogue.
        path: Préfixe de chemin pour les messages d'erreur.

    Raises:
        ValueError: incohérence type / borne / ID inconnu.
    """
    if isinstance(atom, ReputationCondition):
        if atom.operator not in _COUNT_OPS:
            raise ValueError(f"{path}: opérateur réputation invalide.")
        return

    flag_id = atom.flagId.strip()
    meta = definitions_by_id.get(flag_id)
    if meta is None:
        raise ValueError(f"{path}: flag catalogue inconnu: {flag_id}")

    semantic = str(meta.get("semanticType") or "").strip().lower()
    if semantic == "unsupported":
        raise ValueError(f"{path}: flag {flag_id} non utilisable (type catalogue unsupported).")

    if isinstance(atom, FlagBoolCondition):
        if semantic != "bool":
            raise ValueError(
                f"{path}: attendu flag bool catalogue pour {flag_id}, trouvé « {semantic} »."
            )
        return

    csv_type = str(meta.get("type") or "bool").strip().lower()

    if isinstance(atom, FlagCounterCondition):
        if semantic != "compteur":
            raise ValueError(
                f"{path}: attendu compteur catalogue pour {flag_id}, trouvé « {semantic} »."
            )
        if atom.operator not in _COUNT_OPS:
            raise ValueError(f"{path}: opérateur invalide pour compteur.")
        lo = meta.get("minValue")
        hi = meta.get("maxValue")
        if lo is None or hi is None:
            lo, hi = default_counter_bounds(csv_type)
        lo_f, hi_f = float(lo), float(hi)
        val = float(atom.value)
        if val < lo_f or val > hi_f:
            raise ValueError(
                f"{path}: valeur compteur hors bornes pour {flag_id} ([{lo_f}, {hi_f}])."
            )
        return

    if isinstance(atom, FlagEnumCondition):
        if semantic != "enum":
            raise ValueError(
                f"{path}: attendu enum catalogue pour {flag_id}, trouvé « {semantic} »."
            )
        if atom.operator not in _ENUM_OPS:
            raise ValueError(f"{path}: opérateur enum attendu = ou !=.")
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


def parse_and_validate_block(
    raw: Any,
    path: str,
    definitions_by_id: Mapping[str, Mapping[str, Any]],
) -> VisibilityConditionsBlock:
    """Parse JSON en modèle Pydantic puis valide le catalogue pour chaque atome."""
    try:
        block = VisibilityConditionsBlock.model_validate(raw)
    except Exception as exc:
        raise ValueError(f"{path}: bloc visibilityConditions invalide: {exc}") from exc

    for i, atom in enumerate(block.items):
        validate_atom_against_catalog(atom, definitions_by_id, f"{path}.items[{i}]")
    return block


def validate_document_visibility_conditions(
    document: MutableMapping[str, Any],
    definitions_by_id: Mapping[str, Mapping[str, Any]],
) -> None:
    """Parcourt ``nodes[*]`` et ``choices[*]`` ; valide tout champ ``visibilityConditions``."""
    nodes = document.get("nodes")
    if not isinstance(nodes, list):
        return
    for ni, node in enumerate(nodes):
        if not isinstance(node, MutableMapping):
            continue
        vc = node.get("visibilityConditions")
        if vc is not None:
            parse_and_validate_block(vc, f"nodes[{ni}].visibilityConditions", definitions_by_id)
        choices = node.get("choices") or []
        if not isinstance(choices, list):
            continue
        for ci, choice in enumerate(choices):
            if not isinstance(choice, MutableMapping):
                continue
            cvc = choice.get("visibilityConditions")
            if cvc is not None:
                parse_and_validate_block(
                    cvc,
                    f"nodes[{ni}].choices[{ci}].visibilityConditions",
                    definitions_by_id,
                )


class VisibilityConditionValidationService:
    """Service injectable : validation catalogue des blocs visibilityConditions."""

    def __init__(self, catalog: FlagCatalogService) -> None:
        """Initialise avec le catalogue CSV Unity.

        Args:
            catalog: Service catalogue flags (Story 9.1).
        """
        self._catalog = catalog

    def validate_document(self, document: MutableMapping[str, Any]) -> None:
        """Valide tous les blocs du document ; lève ``ValueError`` si erreur bloquante."""
        definitions_by_id = _definitions_index(self._catalog)
        validate_document_visibility_conditions(document, definitions_by_id)

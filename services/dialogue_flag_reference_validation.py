"""Validation des références de flags catalogue vs liaisons ``dialogueFlags`` (Story 9.5 / FR93).

Logique pure : aucun I/O ; comparer les atomes ``flag_*`` / effets flag aux identifiants
déclarés pour le dialogue.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, FrozenSet, Iterator, List, Mapping, MutableMapping, Optional, Sequence, Tuple

from pydantic import TypeAdapter

from api.schemas.choice_effects import (
    AdjustCounterEffect,
    ChoiceEffectAtom,
    ReputationDeltaEffect,
    SetBoolEffect,
    SetEnumEffect,
)
from api.schemas.visibility_conditions import (
    FlagBoolCondition,
    FlagCounterCondition,
    FlagEnumCondition,
    ReputationCondition,
    VisibilityConditionsBlock,
)
from services.edit_distance import levenshtein_bounded

logger = logging.getLogger(__name__)

_visibility_block_adapter = TypeAdapter(VisibilityConditionsBlock)
_effect_atom_adapter = TypeAdapter(ChoiceEffectAtom)

_MAX_SUGGEST_LEN_DELTA = 3
_MAX_SUGGEST_DIST = 2


@dataclass(frozen=True)
class FlagReferenceErrorDetail:
    """Une référence flag absente des déclarations ``dialogueFlags``."""

    flag_id: str
    message: str
    json_path: str
    node_id: Optional[str]
    choice_index: Optional[int]
    suggested_flag_id: Optional[str]


@dataclass(frozen=True)
class FlagReferenceWarningDetail:
    """Flag déclaré mais jamais référencé."""

    flag_id: str
    message: str


@dataclass(frozen=True)
class FlagReferenceAnalysisResult:
    """Résultat agrégé : erreurs bloquantes, avertissements, résumé."""

    errors: List[FlagReferenceErrorDetail]
    warnings: List[FlagReferenceWarningDetail]
    summary: str
    used_flag_count: int

    @property
    def error_count(self) -> int:
        """Nombre d'erreurs bloquantes."""
        return len(self.errors)


def _best_flag_suggestion(
    unknown: str,
    declared: FrozenSet[str],
    catalog_ids: FrozenSet[str],
    max_dist: int = _MAX_SUGGEST_DIST,
) -> Optional[str]:
    """Retourne le meilleur candidat parmi déclarations + catalogue, distance bornée."""
    candidates: List[str] = []
    candidates.extend(declared)
    # Évite de parcourir tout le catalogue : filtre longueur puis distance.
    ulen = len(unknown)
    for cid in catalog_ids:
        if cid in declared:
            continue
        if abs(len(cid) - ulen) > _MAX_SUGGEST_LEN_DELTA:
            continue
        candidates.append(cid)

    best: Optional[str] = None
    best_d = max_dist + 1
    seen: set[str] = set()
    for c in candidates:
        if c in seen:
            continue
        seen.add(c)
        if abs(len(c) - ulen) > _MAX_SUGGEST_LEN_DELTA:
            continue
        d = levenshtein_bounded(unknown, c, max_dist)
        if d < best_d:
            best_d = d
            best = c
            if best_d == 0:
                break
    return best if best_d <= max_dist else None


def _node_identity(node: Mapping[str, Any]) -> str:
    """Identifiant pour navigation graphe : ``id`` document (React Flow), sinon ``stableId``."""
    nid = node.get("id")
    if nid is not None and str(nid).strip():
        return str(nid).strip()
    sid = node.get("stableId")
    if sid is not None and str(sid).strip():
        return str(sid).strip()
    return ""


def _parse_visibility_block(raw: Any, path: str) -> Optional[VisibilityConditionsBlock]:
    """Parse bloc ; None si absent ou invalide (aucune erreur catalogue ici)."""
    if raw is None:
        return None
    try:
        return _visibility_block_adapter.validate_python(raw)
    except Exception:
        logger.debug(
            "Bloc visibilityConditions ignoré pour agrégation FR93 (parse PyDantic): %s",
            path,
            exc_info=True,
        )
        return None


def _iter_condition_flag_ids(
    block: VisibilityConditionsBlock,
    path_prefix: str,
) -> Iterator[Tuple[str, str]]:
    for i, atom in enumerate(block.items):
        sub = f"{path_prefix}.items[{i}]"
        if isinstance(
            atom,
            (FlagBoolCondition, FlagCounterCondition, FlagEnumCondition),
        ):
            yield atom.flagId.strip(), sub
        elif isinstance(atom, ReputationCondition):
            continue


def _parse_choice_effects_list(
    raw: Any, path: str
) -> List[ChoiceEffectAtom]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        return []
    items: List[ChoiceEffectAtom] = []
    for i, entry in enumerate(raw):
        try:
            items.append(_effect_atom_adapter.validate_python(entry))
        except Exception:
            logger.debug(
                "Atome choiceEffects[%s] ignoré pour agrégation FR93 (parse PyDantic): %s",
                i,
                path,
                exc_info=True,
            )
            continue
    return items


def _effect_flag_atoms(
    atoms: Sequence[ChoiceEffectAtom],
    path: str,
) -> Iterator[Tuple[str, str, Optional[int]]]:
    for i, atom in enumerate(atoms):
        sub = f"{path}[{i}]"
        if isinstance(atom, ReputationDeltaEffect):
            continue
        if isinstance(atom, (SetBoolEffect, SetEnumEffect, AdjustCounterEffect)):
            yield atom.flagId.strip(), sub, None


def collect_declared_flag_ids(document: Mapping[str, Any]) -> FrozenSet[str]:
    """Extrait les ``flagId`` déclarés à la racine du document."""
    raw = document.get("dialogueFlags")
    if raw is None:
        return frozenset()
    if not isinstance(raw, list):
        return frozenset()
    out: set[str] = set()
    for entry in raw:
        if not isinstance(entry, Mapping):
            continue
        fid = entry.get("flagId") or entry.get("flag_id")
        if fid is not None and str(fid).strip():
            out.add(str(fid).strip())
    return frozenset(out)


def collect_referenced_flag_ids_with_paths(
    document: Mapping[str, Any],
) -> List[Tuple[str, str, Optional[str], Optional[int]]]:
    """Liste (flag_id, json_path, node_id, choice_index) pour atomes flag uniquement."""
    out: List[Tuple[str, str, Optional[str], Optional[int]]] = []
    nodes = document.get("nodes")
    if not isinstance(nodes, list):
        return out
    for ni, node in enumerate(nodes):
        if not isinstance(node, MutableMapping):
            continue
        node_id = _node_identity(node) or None
        vc = node.get("visibilityConditions")
        block = _parse_visibility_block(vc, f"nodes[{ni}].visibilityConditions")
        if block:
            for fid, jp in _iter_condition_flag_ids(
                block, f"nodes[{ni}].visibilityConditions"
            ):
                out.append((fid, jp, node_id, None))

        choices = node.get("choices") or []
        if not isinstance(choices, list):
            continue
        for ci, choice in enumerate(choices):
            if not isinstance(choice, MutableMapping):
                continue
            cvc = choice.get("visibilityConditions")
            cblock = _parse_visibility_block(
                cvc, f"nodes[{ni}].choices[{ci}].visibilityConditions"
            )
            if cblock:
                base = f"nodes[{ni}].choices[{ci}].visibilityConditions"
                for fid, jp in _iter_condition_flag_ids(cblock, base):
                    out.append((fid, jp, node_id, ci))

            ce = choice.get("choiceEffects")
            ce_path = f"nodes[{ni}].choices[{ci}].choiceEffects"
            atoms = _parse_choice_effects_list(ce, ce_path)
            for fid, jp, _ in _effect_flag_atoms(atoms, ce_path):
                out.append((fid, jp, node_id, ci))
    return out


def analyze_dialogue_flag_references(
    document: Mapping[str, Any],
    *,
    catalog_flag_ids: FrozenSet[str],
) -> FlagReferenceAnalysisResult:
    """Compare références flag dans conditions/effets aux déclarations dialogue.

    Args:
        document: Document canonique (racine avec ``dialogueFlags``, ``nodes``).
        catalog_flag_ids: Identifiants connus du catalogue CSV (suggestions typo).

    Returns:
        Erreurs (référence non déclarée pour ce dialogue), warnings (déclaré inutilisé),
        résumé lisible.
    """
    declared = collect_declared_flag_ids(document)
    refs = collect_referenced_flag_ids_with_paths(document)

    used: set[str] = set()
    errors: List[FlagReferenceErrorDetail] = []

    for flag_id, json_path, node_id, choice_idx in refs:
        used.add(flag_id)
        if flag_id in declared:
            continue

        sug = _best_flag_suggestion(flag_id, declared, catalog_flag_ids)
        loc = ""
        if choice_idx is not None:
            loc = f", choix {choice_idx + 1}"
        msg = (
            f"Flag « {flag_id} » référencé mais non déclaré dans dialogueFlags pour ce dialogue"
            f" ({json_path}{loc})."
        )
        errors.append(
            FlagReferenceErrorDetail(
                flag_id=flag_id,
                message=msg,
                json_path=json_path,
                node_id=node_id,
                choice_index=choice_idx,
                suggested_flag_id=sug,
            )
        )

    warnings: List[FlagReferenceWarningDetail] = []
    for fid in sorted(declared - used):
        warnings.append(
            FlagReferenceWarningDetail(
                flag_id=fid,
                message=(
                    f"Flag « {fid} » déclaré dans dialogueFlags mais non utilisé dans des "
                    "conditions ni effets pour ce dialogue."
                ),
            )
        )

    n_err = len(errors)
    n_used = len(used)
    summary = (
        f"{n_err} erreur(s), {len(warnings)} avertissement(s) non bloquant(s), "
        f"{n_used} flag(s) référencé(s) dans les conditions et effets."
    )
    return FlagReferenceAnalysisResult(
        errors=errors,
        warnings=warnings,
        summary=summary,
        used_flag_count=n_used,
    )

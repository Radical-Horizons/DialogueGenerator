"""Validation et normalisation des liaisons catalogue ↔ dialogue (Story 9.1).

Logique pure, testable sans FastAPI ni I/O fichier.
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, MutableMapping, Tuple, Union

BoundValue = Union[bool, int, float, str]


def infer_semantic_type(csv_type: str, enum_values: List[str]) -> str:
    """Infère le type fonctionnel FR89 depuis le type CSV enrichi.

    Args:
        csv_type: Valeur brute ``Type`` du catalogue (ex. ``bool``, ``int``).
        enum_values: Valeurs enum ordonnées si ligne ``EnumValues`` présente.

    Returns:
        ``bool``, ``compteur``, ``enum``, ou ``unsupported`` pour binding dialogue.
    """
    t = (csv_type or "").strip().lower()
    if t == "bool":
        return "bool"
    if t in ("int", "float"):
        return "compteur"
    if t == "string" and enum_values:
        return "enum"
    return "unsupported"


def default_counter_bounds(csv_type: str) -> Tuple[int | float, int | float]:
    """Bornes par défaut si absentes du catalogue."""
    if csv_type.lower().strip() == "float":
        return (-1e308, 1e308)
    return (-(2**31), 2**31 - 1)


def normalize_dialogue_flag_bindings(
    dialogue_flags_raw: Any,
    definitions_by_id: Mapping[str, Mapping[str, Any]],
) -> List[Dict[str, Any]]:
    """Valide ``dialogueFlags`` et retourne une liste normalisée sérialisable JSON.

    Args:
        dialogue_flags_raw: Liste de dicts ou liste vide attendue à la racine document.
        definitions_by_id: Index ``flag_id -> définition catalogue enrichie``.

    Returns:
        Liste normalisée ``[{flagId, type, initialValue}, ...]``.

    Raises:
        ValueError: liaison invalide (contrat stable pour conversion en HTTP 400).
    """
    if dialogue_flags_raw is None:
        return []
    if not isinstance(dialogue_flags_raw, list):
        raise ValueError("dialogueFlags doit être une liste ou être omis.")
    seen: set[str] = set()
    normalized: List[Dict[str, Any]] = []

    for i, raw in enumerate(dialogue_flags_raw):
        if not isinstance(raw, MutableMapping):
            raise ValueError(f"dialogueFlags[{i}] doit être un objet.")
        flag_id = str(raw.get("flagId") or raw.get("flag_id") or "").strip()
        if not flag_id:
            raise ValueError(f"dialogueFlags[{i}]: flagId requis.")
        if flag_id in seen:
            raise ValueError(f"Flag dupliqué dans dialogueFlags: {flag_id}")
        seen.add(flag_id)

        declared = raw.get("type")
        declared_str = (
            str(declared).strip().lower() if declared is not None else ""
        )
        initial = raw.get("initialValue") if "initialValue" in raw else raw.get("initial_value")

        catalog = definitions_by_id.get(flag_id)
        if catalog is None:
            raise ValueError(f"Flag inconnu dans le catalogue: {flag_id}")

        semantic = str(catalog.get("semanticType") or "").strip().lower()
        if semantic == "unsupported":
            raise ValueError(
                f"Le flag {flag_id} n'est pas utilisable comme liaison dialogue "
                "(type catalogue non supporté pour FR89)."
            )

        csv_type = str(catalog.get("type") or "bool").strip().lower()
        if declared_str and declared_str != semantic:
            raise ValueError(
                f"Type incohérent pour {flag_id}: document « {declared_str} », "
                f"catalogue « {semantic} »."
            )

        if semantic == "bool":
            if not isinstance(initial, bool):
                raise ValueError(f"Valeur initiale bool attendue pour {flag_id}.")
            normalized.append(
                {"flagId": flag_id, "type": "bool", "initialValue": initial}
            )
            continue

        if semantic == "compteur":
            lo = catalog.get("minValue")
            hi = catalog.get("maxValue")
            if lo is None or hi is None:
                lo, hi = default_counter_bounds(csv_type)
            if isinstance(initial, bool) or initial is None:
                raise ValueError(f"Valeur initiale numérique attendue pour {flag_id}.")
            try:
                if csv_type == "float":
                    val = float(initial)
                    lo_f, hi_f = float(lo), float(hi)
                    if val < lo_f or val > hi_f:
                        raise ValueError(
                            f"Valeur initiale hors bornes pour {flag_id} "
                            f"([{lo_f}, {hi_f}])."
                        )
                    normalized.append(
                        {"flagId": flag_id, "type": "compteur", "initialValue": val}
                    )
                else:
                    val = int(initial)
                    lo_i, hi_i = int(lo), int(hi)
                    if val < lo_i or val > hi_i:
                        raise ValueError(
                            f"Valeur initiale hors bornes pour {flag_id} "
                            f"([{lo_i}, {hi_i}])."
                        )
                    normalized.append(
                        {"flagId": flag_id, "type": "compteur", "initialValue": val}
                    )
            except (TypeError, ValueError) as exc:
                if isinstance(exc, ValueError) and "hors bornes" in str(exc):
                    raise
                raise ValueError(f"Valeur initiale numérique invalide pour {flag_id}.") from exc
            continue

        if semantic == "enum":
            allowed = catalog.get("enumValues") or []
            if not isinstance(allowed, list) or not allowed:
                raise ValueError(f"Catalogue incomplet pour enum {flag_id}.")
            allowed_str = [str(x) for x in allowed]
            sval = str(initial) if initial is not None else ""
            if sval not in allowed_str:
                raise ValueError(
                    f"Valeur enum initiale invalide pour {flag_id}: « {sval} » "
                    f"(autorisé: {allowed_str})."
                )
            normalized.append(
                {"flagId": flag_id, "type": "enum", "initialValue": sval}
            )
            continue

        raise ValueError(f"Type sémantique non géré pour {flag_id}: {semantic}")

    return normalized


def threshold_warnings_for_bindings(
    normalized_bindings: List[Mapping[str, Any]],
    definitions_by_id: Mapping[str, Mapping[str, Any]],
) -> List[str]:
    """Calcule les alertes non bloquantes (seuils GDD).

    Args:
        normalized_bindings: Sortie de :func:`normalize_dialogue_flag_bindings`.
        definitions_by_id: Index catalogue enrichi (``scope``, ``semanticType``).

    Returns:
        Messages utilisateur (français) si seuils dépassés.
    """
    from services.dialogue_flag_thresholds import (
        MAX_CONVERSATIONAL_FLAGS,
        MAX_COUNTERS,
    )

    warnings: List[str] = []
    conversational = 0
    counters = 0
    for b in normalized_bindings:
        fid = str(b.get("flagId") or "")
        sem = str(b.get("type") or "").lower()
        meta = definitions_by_id.get(fid) or {}
        if sem == "compteur":
            counters += 1
            continue
        if str(meta.get("scope") or "").lower() == "conversationnel":
            conversational += 1

    if conversational > MAX_CONVERSATIONAL_FLAGS:
        warnings.append(
            f"Liaisons « conversationnelles » : {conversational} "
            f"(repère GDD ≤ {MAX_CONVERSATIONAL_FLAGS})."
        )
    if counters > MAX_COUNTERS:
        warnings.append(
            f"Compteurs liés : {counters} (repère GDD ≤ {MAX_COUNTERS})."
        )
    return warnings

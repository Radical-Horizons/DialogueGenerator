"""Résolution des champs relation Notion (UUID) vers noms de fiches GDD."""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Mapping, Optional, Set

from services.gdd_notion_sync_utils import normalize_notion_id

_RELATION_SPLIT_RE = re.compile(r"[,;]+")


def get_gdd_property(record: Mapping[str, Any], field: str) -> Optional[str]:
    """Lit une propriété GDD à la racine ou sous ``values`` (export Notion)."""
    raw = record.get(field)
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    values = record.get("values")
    if isinstance(values, dict):
        nested = values.get(field)
        if isinstance(nested, str) and nested.strip():
            return nested.strip()
    return None


def parse_relation_tokens(raw: str) -> List[str]:
    """Découpe un champ relation Notion (virgules / point-virgules)."""
    return [part.strip() for part in _RELATION_SPLIT_RE.split(raw) if part.strip()]


def looks_like_notion_uuid(token: str) -> bool:
    """Indique si le jeton ressemble à un identifiant Notion (UUID 32 hex)."""
    try:
        normalize_notion_id(token)
        return True
    except ValueError:
        return False


def build_notion_page_id_index(records: Iterable[Mapping[str, Any]]) -> Dict[str, str]:
    """Index ``notion_page_id`` normalisé → ``Nom`` canonique."""
    index: Dict[str, str] = {}
    for record in records:
        if not isinstance(record, Mapping):
            continue
        nom = record.get("Nom")
        if not nom:
            continue
        raw_id = record.get("notion_page_id")
        if not raw_id:
            continue
        try:
            key = normalize_notion_id(str(raw_id).strip())
        except ValueError:
            continue
        index[key] = str(nom)
    return index


def _resolve_single_token(
    token: str,
    *,
    notion_id_index: Mapping[str, str],
    known_names: Set[str],
    known_names_folded: Dict[str, str],
) -> Optional[str]:
    """Résout un jeton relation (UUID ou nom) en ``Nom`` GDD."""
    if looks_like_notion_uuid(token):
        try:
            resolved = notion_id_index.get(normalize_notion_id(token))
            if resolved:
                return resolved
        except ValueError:
            pass
        return None

    if token in known_names:
        return token

    folded = token.casefold()
    if folded in known_names_folded:
        return known_names_folded[folded]

    # Legacy : noms en clair dans Contient (fiches agrégées classiques).
    if not looks_like_notion_uuid(token):
        return token

    return None


def resolve_relation_field_to_names(
    raw: Optional[str],
    *,
    notion_id_index: Mapping[str, str],
    known_names: Optional[Iterable[str]] = None,
) -> List[str]:
    """Convertit un champ relation (UUIDs et/ou noms) en noms de fiches triés."""
    if not raw or not str(raw).strip():
        return []

    names_set = {str(n) for n in (known_names or []) if n}
    names_folded = {str(n).casefold(): str(n) for n in names_set}

    resolved: List[str] = []
    seen: Set[str] = set()
    for token in parse_relation_tokens(str(raw)):
        name = _resolve_single_token(
            token,
            notion_id_index=notion_id_index,
            known_names=names_set,
            known_names_folded=names_folded,
        )
        if name and name not in seen:
            seen.add(name)
            resolved.append(name)

    return sorted(resolved, key=lambda n: n.casefold())


def resolve_relation_value_to_name(
    value: Optional[str],
    *,
    notion_id_index: Mapping[str, str],
    known_names: Optional[Iterable[str]] = None,
) -> Optional[str]:
    """Résout une valeur unique (UUID ou nom) en ``Nom`` GDD."""
    if not value or not str(value).strip():
        return None
    names = resolve_relation_field_to_names(
        str(value).strip(),
        notion_id_index=notion_id_index,
        known_names=known_names,
    )
    if len(names) == 1:
        return names[0]
    token = str(value).strip()
    names_set = {str(n) for n in (known_names or []) if n}
    names_folded = {str(n).casefold(): str(n) for n in names_set}
    return _resolve_single_token(
        token,
        notion_id_index=notion_id_index,
        known_names=names_set,
        known_names_folded=names_folded,
    )


def resolve_scene_location_labels(
    scene_location: Mapping[str, Any],
    location_records: Iterable[Mapping[str, Any]],
) -> Dict[str, str]:
    """Traduit ``lieu`` / ``sous_lieu`` UUID → noms pour prompt et UI backend."""
    index = build_notion_page_id_index(location_records)
    known = [
        str(record.get("Nom"))
        for record in location_records
        if isinstance(record, Mapping) and record.get("Nom")
    ]
    result: Dict[str, str] = {}
    for key in ("lieu", "sous_lieu"):
        raw = scene_location.get(key)
        if not isinstance(raw, str) or not raw.strip():
            continue
        resolved = resolve_relation_value_to_name(
            raw.strip(),
            notion_id_index=index,
            known_names=known,
        )
        result[key] = resolved if resolved else raw.strip()
    return result

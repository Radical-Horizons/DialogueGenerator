"""Index catalogue flag_id → définition (réutilisable par validations Story 9.x)."""

from __future__ import annotations

from typing import Any, Dict

from services.flag_catalog_service import FlagCatalogService


def definitions_by_id_from_catalog(catalog: FlagCatalogService) -> Dict[str, Dict[str, Any]]:
    """Construit un index ``flag_id -> définition enrichie`` depuis le CSV catalogue."""
    out: Dict[str, Dict[str, Any]] = {}
    for row in catalog.load_definitions():
        fid = str(row.get("id") or "").strip()
        if fid:
            out[fid] = row
    return out

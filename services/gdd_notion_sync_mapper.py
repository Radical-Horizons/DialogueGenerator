"""Transformation Notion → enregistrement GDD minimal (Nom + sections)."""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, MutableSequence


def extract_page_title(page: Mapping[str, Any]) -> str:
    """Extrait le titre affiché d'une page Notion (API officielle)."""
    props = page.get("properties") or {}
    for _key, prop in props.items():
        if not isinstance(prop, dict):
            continue
        if prop.get("type") == "title":
            title_arr = prop.get("title") or []
            parts = [t.get("plain_text", "") for t in title_arr if isinstance(t, dict)]
            name = "".join(parts).strip()
            if name:
                return name
    return ""


def notion_page_to_gdd_record(page: Mapping[str, Any], body_text: str) -> Dict[str, Any]:
    """Construit un objet compatible charge GDD (liste d'entités).

    Args:
        page: Payload JSON page Notion.
        body_text: Contenu texte/markdown agrégé des blocs.

    Returns:
        Dict avec clés Nom et sections.
    """
    title = extract_page_title(page)
    return {
        "Nom": title or "SansTitre",
        "sections": {"_general": body_text or ""},
    }


def merge_records_by_nom(
    existing: MutableSequence[Dict[str, Any]],
    new_records: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Fusionne des enregistrements : même Nom remplace la première occurrence.

    Args:
        existing: Liste actuelle (sera copiée, non mutée destructivement).
        new_records: Nouveaux enregistrements issus de Notion.

    Returns:
        Nouvelle liste fusionnée.
    """
    out: List[Dict[str, Any]] = [dict(x) for x in existing]
    for rec in new_records:
        nom = rec.get("Nom")
        idx: int | None = None
        for i, item in enumerate(out):
            if item.get("Nom") == nom:
                idx = i
                break
        if idx is not None:
            out[idx] = dict(rec)
        else:
            out.append(dict(rec))
    return out

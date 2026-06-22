"""Résolution nom → page Notion pour sync ciblée d'une entité GDD."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

from services.element_repository import ElementCategory
from services.gdd_category_entity_lookup import _find_shard_dir
from services.gdd_loader import GDDLoader
from services.gdd_name_resolver import GddNameResolver
from services.gdd_notion_sync_mapper import extract_page_title
from services.gdd_notion_sync_utils import category_stem_to_list_category_key, normalize_notion_id
from services.gdd_shard_filenames import (
    build_gdd_shard_filename,
    notion_page_id_from_shard_stem,
)

logger = logging.getLogger(__name__)

_CATEGORY_STEM_TO_ELEMENT: Dict[str, ElementCategory] = {
    "personnages": ElementCategory.CHARACTERS,
    "lieux": ElementCategory.LOCATIONS,
    "objets": ElementCategory.ITEMS,
    "especes": ElementCategory.SPECIES,
    "communautes": ElementCategory.COMMUNITIES,
    "dialogues": ElementCategory.DIALOGUES,
    "structure_narrative": ElementCategory.NARRATIVE_STRUCTURES,
    "chapitres": ElementCategory.CHAPTERS,
    "scènes": ElementCategory.SCENES,
    "quetes": ElementCategory.QUESTS,
}


@dataclass(frozen=True)
class EntityPageResolution:
    """Résultat de la résolution nom → page Notion."""

    query_name: str
    resolved_name: Optional[str]
    notion_page_id: Optional[str]
    matched_from: Optional[str]
    gdd_relative_path: Optional[str] = None


def category_stem_from_file(category_file: str) -> str:
    """Retourne le stem normalisé d'un ``category_file`` (ex. personnages)."""
    from pathlib import PurePath

    return PurePath((category_file or "").strip()).stem.lower()


def resolve_canonical_name(
    gdd_root: Path,
    category_stem: str,
    search_name: str,
) -> Optional[str]:
    """Résout un libellé vers le ``Nom`` canonique GDD (exact, alias, fuzzy)."""
    cleaned = (search_name or "").strip()
    if not cleaned:
        return None
    element_cat = _CATEGORY_STEM_TO_ELEMENT.get(category_stem)
    if element_cat is None:
        return cleaned
    loader = GDDLoader(categories_path=gdd_root, project_root_dir=gdd_root.parent.parent)
    gdd_data = loader.load_all()
    resolver = GddNameResolver(gdd_data)
    return resolver.resolve(element_cat, cleaned)


def _notion_id_from_shard_path(path: Path) -> Optional[str]:
    """Extrait l'UUID Notion depuis un fichier shard (legacy ou ``nom_uuid``)."""
    return notion_page_id_from_shard_stem(path.stem.strip())


def find_notion_page_id_on_disk(
    gdd_root: Path,
    category_stem: str,
    canonical_name: str,
) -> Optional[tuple[str, str]]:
    """Cherche ``notion_page_id`` et chemin relatif GDD pour un ``Nom`` canonique.

    Returns:
        Tuple ``(notion_page_id, gdd_relative_path)`` ou ``None``.
    """
    name = (canonical_name or "").strip()
    if not name:
        return None
    shard_dir = _find_shard_dir(gdd_root, category_stem)
    if shard_dir is not None:
        for shard_path in sorted(shard_dir.glob("*.json")):
            try:
                with open(shard_path, "r", encoding="utf-8") as handle:
                    record = json.load(handle)
            except (OSError, json.JSONDecodeError) as exc:
                logger.debug("Shard GDD illisible %s: %s", shard_path, exc)
                continue
            if not isinstance(record, dict):
                continue
            if str(record.get("Nom", "")).strip() != name:
                continue
            page_id = str(record.get("notion_page_id") or "").strip()
            if not page_id:
                page_id = _notion_id_from_shard_path(shard_path) or ""
            if not page_id:
                return None
            rel = f"{shard_dir.name}/{shard_path.name}"
            return page_id, rel

    list_key = category_stem_to_list_category_key(category_stem)
    if list_key is None:
        mono = gdd_root / f"{category_stem}.json"
        if mono.is_file():
            try:
                with open(mono, "r", encoding="utf-8") as handle:
                    raw = json.load(handle)
            except (OSError, json.JSONDecodeError):
                return None
            records = raw if isinstance(raw, list) else [raw] if isinstance(raw, dict) else []
            for record in records:
                if isinstance(record, dict) and str(record.get("Nom", "")).strip() == name:
                    page_id = str(record.get("notion_page_id") or "").strip()
                    if page_id:
                        return page_id, mono.name
    return None


def find_notion_page_id_in_database_rows(
    pages: List[Mapping[str, Any]],
    search_name: str,
    *,
    canonical_name: Optional[str] = None,
) -> Optional[tuple[str, str]]:
    """Fuzzy match sur les titres Notion d'une base.

    Returns:
        Tuple ``(notion_page_id, resolved_title)`` ou ``None``.
    """
    cleaned = (search_name or "").strip()
    if not cleaned or not pages:
        return None

    labels: List[tuple[str, str]] = []
    for page in pages:
        pid = str(page.get("id") or "").strip()
        title = extract_page_title(page)
        if pid and title:
            labels.append((title, pid))

    if not labels:
        return None

    from services.gdd_loader import GDDData

    resolver = GddNameResolver(GDDData())
    target = (canonical_name or cleaned).strip()
    matched_title = resolver._fuzzy_match(target, [(label, label) for label, _ in labels])
    if matched_title:
        for label, pid in labels:
            if label == matched_title:
                return pid, label

    matched_title = resolver._fuzzy_match(cleaned, [(label, label) for label, _ in labels])
    if matched_title:
        for label, pid in labels:
            if label == matched_title:
                return pid, label
    return None


def resolve_entity_page(
    gdd_root: Path,
    category_file: str,
    search_name: str,
    notion_pages: Optional[List[Mapping[str, Any]]] = None,
) -> EntityPageResolution:
    """Résout une entité GDD vers une page Notion (disque puis titres Notion)."""
    query = (search_name or "").strip()
    stem = category_stem_from_file(category_file)
    if not query:
        return EntityPageResolution(
            query_name=query,
            resolved_name=None,
            notion_page_id=None,
            matched_from=None,
        )

    canonical = resolve_canonical_name(gdd_root, stem, query) or query
    disk_hit = find_notion_page_id_on_disk(gdd_root, stem, canonical)
    if disk_hit is not None:
        page_id, rel = disk_hit
        return EntityPageResolution(
            query_name=query,
            resolved_name=canonical,
            notion_page_id=page_id,
            matched_from="disk",
            gdd_relative_path=rel,
        )

    if notion_pages:
        notion_hit = find_notion_page_id_in_database_rows(
            notion_pages,
            query,
            canonical_name=canonical,
        )
        if notion_hit is not None:
            page_id, title = notion_hit
            list_key = category_stem_to_list_category_key(stem) or stem
            rel = f"{list_key}/{build_gdd_shard_filename(title, page_id)}"
            return EntityPageResolution(
                query_name=query,
                resolved_name=title,
                notion_page_id=page_id,
                matched_from="notion",
                gdd_relative_path=rel,
            )

    return EntityPageResolution(
        query_name=query,
        resolved_name=canonical if canonical != query else None,
        notion_page_id=None,
        matched_from=None,
    )

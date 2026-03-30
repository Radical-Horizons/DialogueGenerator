"""Découpage d'un monolithe GDD (liste) en répertoire de shards (un JSON par fiche)."""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from services.gdd_loader import GDDLoader
from services.gdd_notion_sync_utils import normalize_notion_id

logger = logging.getLogger(__name__)


def _find_monolith_file(categories_path: Path, category_key: str) -> Optional[Path]:
    """Retourne le chemin du monolithe (``_full`` prioritaire) ou ``None``."""
    if not categories_path.is_dir():
        return None
    for name in (f"{category_key}_full.json", f"{category_key}.json"):
        candidate = categories_path / name
        if candidate.is_file():
            return candidate
        lower = name.lower()
        for child in categories_path.iterdir():
            if child.is_file() and child.name.lower() == lower:
                return child
    return None


def _extract_list(payload: Any, json_key: str) -> List[Dict[str, Any]]:
    """Extrait une liste d'objets depuis un monolithe JSON."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        inner = payload.get(json_key)
        if isinstance(inner, list):
            return [x for x in inner if isinstance(x, dict)]
    return []


def _safe_stem_from_nom(nom: str, index: int) -> str:
    base = re.sub(r"[^\w\-]+", "_", nom.strip(), flags=re.UNICODE)[:64].strip("_")
    if not base:
        base = "fiche"
    return f"{base}_{index:04d}"


def _shard_filename(rec: Dict[str, Any], index: int) -> str:
    nid = rec.get("notion_page_id")
    if isinstance(nid, str) and nid.strip():
        try:
            return f"{normalize_notion_id(nid.strip())}.json"
        except ValueError:
            pass
    nom = str(rec.get("Nom") or "")
    return f"{_safe_stem_from_nom(nom, index)}.json"


def split_category_to_shards(
    categories_path: Path,
    category_key: str,
    *,
    dry_run: bool = False,
) -> int:
    """Découpe une catégorie liste en shards sous ``categories_path / category_key /``.

    Args:
        categories_path: Répertoire racine des catégories GDD.
        category_key: Clé ``GDDLoader.CATEGORIES_CONFIG`` (ex. ``personnages``).
        dry_run: Si True, n'écrit aucun fichier.

    Returns:
        Nombre de fichiers écrits (ou qui seraient écrits en dry-run).

    Raises:
        ValueError: Catégorie inconnue ou non-liste.
        FileNotFoundError: Monolithe absent.
    """
    if category_key not in GDDLoader.CATEGORIES_CONFIG:
        raise ValueError(f"Catégorie inconnue: {category_key}")
    cfg = GDDLoader.CATEGORIES_CONFIG[category_key]
    if cfg["type"] is not list:
        raise ValueError(f"Catégorie non-liste (shards non supportés): {category_key}")

    monolith = _find_monolith_file(categories_path, category_key)
    if monolith is None:
        raise FileNotFoundError(
            f"Aucun fichier {category_key}.json (ou _full) dans {categories_path}"
        )

    raw = json.loads(monolith.read_text(encoding="utf-8"))
    items = _extract_list(raw, cfg["key"])
    if not items:
        logger.warning("Aucun enregistrement dict trouvé dans %s", monolith)
        return 0

    out_dir = categories_path / category_key
    if not dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    used_names: Set[str] = set()
    for i, rec in enumerate(items):
        fname = _shard_filename(rec, i)
        if fname in used_names:
            root, ext = os.path.splitext(fname)
            fname = f"{root}_dup{i}{ext}"
        used_names.add(fname)
        target = out_dir / fname
        if dry_run:
            logger.info("[dry-run] écrirait %s", target)
        else:
            target.write_text(
                json.dumps(rec, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        written += 1

    logger.info(
        "%s %s fiche(s) pour la catégorie %s",
        "Simulé :" if dry_run else "Écrit",
        written,
        category_key,
    )
    return written

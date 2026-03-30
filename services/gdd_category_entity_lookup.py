"""Vérifie si une entité GDD (champ ``Nom``) existe sur disque pour une catégorie donnée."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.gdd_loader import GDDLoader

logger = logging.getLogger(__name__)


def _nom_matches(record: Dict[str, Any], entity_name: str) -> bool:
    """True si le record a le même ``Nom`` (comparaison trim, exacte)."""
    return str(record.get("Nom", "")).strip() == entity_name.strip()


def _find_monolith_path(gdd_root: Path, stem: str) -> Optional[Path]:
    """Retourne ``{stem}.json`` ou ``{stem}_full.json`` (insensible à la casse)."""
    if not gdd_root.is_dir():
        return None
    stem_lower = stem.lower()
    for p in gdd_root.iterdir():
        if not p.is_file() or p.suffix.lower() != ".json":
            continue
        base = p.stem.lower()
        if base == stem_lower or base == f"{stem_lower}_full":
            return p
    return None


def _records_from_monolith(path: Path) -> List[Dict[str, Any]]:
    """Extrait une liste de dicts depuis un JSON monolithe (liste racine ou clé unique)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        logger.debug("Lecture monolithe GDD impossible %s: %s", path, exc)
        return []
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, dict):
        if isinstance(raw.get("Nom"), str):
            return [raw]
        for v in raw.values():
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
    return []


def _find_shard_dir(gdd_root: Path, stem: str) -> Optional[Path]:
    if not gdd_root.is_dir():
        return None
    low = stem.lower()
    for c in gdd_root.iterdir():
        if c.is_dir() and c.name.lower() == low:
            return c
    return None


def live_gdd_entity_exists(repo_root: Path, category_stem: str, entity_name: str) -> bool:
    """True si une fiche avec ce ``Nom`` est présente dans la catégorie live (fichier ou shards).

    Utilise ``GDDLoader`` pour les clés ``CATEGORIES_CONFIG`` ; sinon monolithe ou répertoire
    de même stem que l'historique d'entité.

    Args:
        repo_root: Racine du projet DialogueGenerator.
        category_stem: Stem de catégorie (ex. ``personnages``, ``lieux``).
        entity_name: Valeur du champ ``Nom``.

    Returns:
        False si répertoire GDD absent, catégorie introuvable, ou aucune fiche correspondante.
    """
    stem = (category_stem or "").strip()
    name = (entity_name or "").strip()
    if not stem or not name:
        return False
    gdd_root = repo_root / "data" / "GDD_categories"
    if not gdd_root.is_dir():
        return False

    loader = GDDLoader(categories_path=gdd_root, project_root_dir=repo_root)
    if stem in loader.CATEGORIES_CONFIG:
        data = loader.load_category(stem)
        if isinstance(data, list):
            return any(isinstance(x, dict) and _nom_matches(x, name) for x in data)
        if isinstance(data, dict) and _nom_matches(data, name):
            return True
        return False

    shard = _find_shard_dir(gdd_root, stem)
    if shard is not None:
        records = loader.load_shard_json_records(shard)
        return any(_nom_matches(x, name) for x in records)

    mono = _find_monolith_path(gdd_root, stem)
    if mono is not None:
        return any(_nom_matches(x, name) for x in _records_from_monolith(mono))

    return False

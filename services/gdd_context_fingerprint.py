"""Empreinte du contenu des fiches GDD d'une sélection de contexte (Story 3.9 FR19)."""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

from services.element_resolver import ElementResolver

logger = logging.getLogger(__name__)

GDD_FINGERPRINT_VERSION = "v2"

_FINGERPRINT_CACHE_LOCK = threading.Lock()
_FINGERPRINT_CACHE: Dict[str, Tuple[float, str]] = {}
_FINGERPRINT_CACHE_TTL_SEC = 4.0
_FINGERPRINT_CACHE_MAX_ENTRIES = 512


def structured_context_fingerprint(structured: Dict[str, Any]) -> str:
    """Calcule une empreinte SHA-256 stable d'un contenu JSON.

    Args:
        structured: Contenu à empreindre ; l'ordre des clés est sans effet.

    Returns:
        Chaîne hexadécimale SHA-256.
    """
    canonical = json.dumps(structured, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _repo_root_for_fingerprint_cache(context_builder: Any) -> Path:
    """Déduit la racine projet depuis le builder (pour mtime manifeste / GDD)."""
    try:
        p = getattr(context_builder, "_gdd_categories_path", None)
        if p is not None:
            gp = Path(p).resolve()
            if gp.name.lower() == "gdd_categories" and gp.parent.name.lower() == "data":
                return gp.parent.parent
    except (OSError, TypeError, ValueError):
        pass
    from core.context.context_builder import PROJECT_ROOT_DIR

    return Path(PROJECT_ROOT_DIR)


def _gdd_invalidation_token(repo_root: Path) -> str:
    """Jeton lié aux écritures GDD (manifeste sync + shards JSON sous GDD_categories).

    Le mtime du répertoire seul est peu fiable sous Windows quand seuls des fichiers
    enfants changent ; on réutilise la même logique que le cache GDD (max mtime des ``*.json``).
    """
    parts: List[str] = []
    manifest = repo_root / "data" / ".gdd_snapshot" / "manifest.json"
    try:
        if manifest.is_file():
            parts.append(str(manifest.stat().st_mtime_ns))
    except OSError:
        pass
    gdd_dir = repo_root / "data" / "GDD_categories"
    try:
        if gdd_dir.is_dir():
            from api.utils.gdd_cache import gdd_shard_directory_fingerprint

            mmax, njson = gdd_shard_directory_fingerprint(gdd_dir)
            parts.append(f"{mmax:.9f}|{njson}")
    except OSError:
        pass
    return "|".join(parts) if parts else "0"


def _prune_fingerprint_cache(now: float) -> None:
    """Retire les entrées expirées ; si trop volumineux, vide le cache."""
    global _FINGERPRINT_CACHE
    expired_keys = [k for k, (exp, _) in _FINGERPRINT_CACHE.items() if exp <= now]
    for k in expired_keys:
        del _FINGERPRINT_CACHE[k]
    if len(_FINGERPRINT_CACHE) > _FINGERPRINT_CACHE_MAX_ENTRIES:
        _FINGERPRINT_CACHE = {}


def clear_gdd_content_fingerprint_cache() -> None:
    """Vide le cache d'empreinte (tests ou invalidation explicite)."""
    with _FINGERPRINT_CACHE_LOCK:
        _FINGERPRINT_CACHE.clear()


def selected_gdd_element_names(context_selections: Dict[str, Any]) -> Dict[str, List[str]]:
    """Extrait les fiches GDD désignées par une sélection de contexte.

    Le mode (complet ou extrait) ne compte pas : une fiche sélectionnée reste la même fiche.
    Les protagonistes et le lieu de scène en font partie, car le prompt les inclut toujours.

    Args:
        context_selections: Sélections telles que le front les envoie.

    Returns:
        Noms triés par clé de catégorie (``characters``, ``locations``…).
    """
    selected: Dict[str, Set[str]] = {}

    def add(category: str, raw_name: Any) -> None:
        if isinstance(raw_name, str) and raw_name.strip():
            selected.setdefault(category, set()).add(raw_name.strip())

    for key, value in context_selections.items():
        category = key.removesuffix("_full").removesuffix("_excerpt")
        if category in ElementResolver.CATEGORY_TO_ELEMENT_CATEGORY and isinstance(value, list):
            for name in value:
                add(category, name)

    protagonists = context_selections.get("scene_protagonists") or context_selections.get(
        "_scene_protagonists"
    )
    if isinstance(protagonists, dict):
        for name in protagonists.values():
            add("characters", name)

    scene_location = context_selections.get("scene_location") or context_selections.get(
        "_scene_location"
    )
    if isinstance(scene_location, dict):
        for key in ("lieu", "sous_lieu"):
            add("locations", scene_location.get(key))

    return {category: sorted(names) for category, names in selected.items()}


def compute_gdd_content_fingerprint(
    context_builder: Any,
    context_selections: Dict[str, Any],
) -> str:
    """Calcule l'empreinte du contenu des fiches GDD sélectionnées.

    Ne dépend que de ces fiches : ni des champs retenus pour le prompt, ni du mode
    d'organisation, ni de l'ordre de sélection. L'appelant passe la sélection **brute** du
    front, celle que le nœud garde en snapshot, et non le contexte enrichi d'une génération,
    qui contient une fiche tirée au sort.

    Recharge les fichiers GDD via ``load_gdd_files()`` pour refléter le disque courant.

    Args:
        context_builder: Instance ``ContextBuilder``.
        context_selections: Sélections brutes du front.

    Returns:
        Empreinte ``v2:<sha256>`` ; le préfixe distingue les empreintes de l'ancien calcul,
        que le contrôle de péremption ne doit pas comparer.
    """
    names_by_category = selected_gdd_element_names(context_selections)
    repo = _repo_root_for_fingerprint_cache(context_builder)
    inv = _gdd_invalidation_token(repo)
    cache_basis = json.dumps(
        {"names": names_by_category, "inv": inv},
        sort_keys=True,
        ensure_ascii=False,
    )
    cache_key = hashlib.sha256(cache_basis.encode("utf-8")).hexdigest()
    now = time.monotonic()
    with _FINGERPRINT_CACHE_LOCK:
        _prune_fingerprint_cache(now)
        hit = _FINGERPRINT_CACHE.get(cache_key)
        if hit is not None:
            expires_at, cached_fp = hit
            if now < expires_at:
                return cached_fp

    context_builder.load_gdd_files()
    records = {
        category: {name: context_builder.get_element_record(category, name) for name in names}
        for category, names in names_by_category.items()
    }
    fp = f"{GDD_FINGERPRINT_VERSION}:{structured_context_fingerprint(records)}"
    with _FINGERPRINT_CACHE_LOCK:
        _FINGERPRINT_CACHE[cache_key] = (now + _FINGERPRINT_CACHE_TTL_SEC, fp)
    return fp

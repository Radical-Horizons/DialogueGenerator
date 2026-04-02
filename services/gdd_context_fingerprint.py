"""Empreinte du contenu GDD utilisé pour une sélection de contexte (Story 3.9 FR19)."""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Plafond tokens pour l'empreinte (aligné génération : évite charge excessive tout en couvrant le contenu).
_FINGERPRINT_MAX_CONTEXT_TOKENS = 200_000

_FINGERPRINT_CACHE_LOCK = threading.Lock()
_FINGERPRINT_CACHE: Dict[str, Tuple[float, str]] = {}
_FINGERPRINT_CACHE_TTL_SEC = 4.0
_FINGERPRINT_CACHE_MAX_ENTRIES = 512


def structured_context_fingerprint(structured: Dict[str, Any]) -> str:
    """Calcule une empreinte SHA-256 stable du contexte structuré.

    Args:
        structured: Résultat de ``ContextBuilder.build_context_json``.

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


def compute_gdd_content_fingerprint(
    context_builder: Any,
    context_selections: Dict[str, Any],
    *,
    field_configs: Optional[Dict[str, List[str]]] = None,
    organization_mode: str = "narrative",
    element_modes: Optional[Dict[str, Any]] = None,
) -> str:
    """Construit le JSON de contexte puis son empreinte (même pipeline que génération).

    Recharge les fichiers GDD via ``load_gdd_files()`` pour refléter le disque courant.

    Args:
        context_builder: Instance ``ContextBuilder``.
        context_selections: Sélections brutes (peuvent contenir ``_element_modes``).
        field_configs: Champs par type (optionnel).
        organization_mode: Mode d'organisation du contexte.
        element_modes: Modes par élément si non fournis dans les sélections.

    Returns:
        Empreinte SHA-256 hex.

    Raises:
        RuntimeError: Si le context builder n'est pas initialisé après chargement.
    """
    repo = _repo_root_for_fingerprint_cache(context_builder)
    inv = _gdd_invalidation_token(repo)
    cache_basis = json.dumps(
        {
            "sel": context_selections,
            "fc": field_configs,
            "org": organization_mode,
            "em": element_modes,
            "inv": inv,
        },
        sort_keys=True,
        ensure_ascii=False,
        default=str,
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
    payload = dict(context_selections) if isinstance(context_selections, dict) else {}
    modes = element_modes
    if "_element_modes" in payload:
        extracted = payload.pop("_element_modes", None)
        if modes is None and isinstance(extracted, dict):
            modes = extracted
    structured = context_builder.build_context_json(
        selected_elements=payload,
        scene_instruction="",
        field_configs=field_configs,
        organization_mode=organization_mode,
        max_tokens=_FINGERPRINT_MAX_CONTEXT_TOKENS,
        include_dialogue_type=True,
        element_modes=modes,
    )
    fp = structured_context_fingerprint(structured)
    with _FINGERPRINT_CACHE_LOCK:
        _FINGERPRINT_CACHE[cache_key] = (now + _FINGERPRINT_CACHE_TTL_SEC, fp)
    return fp

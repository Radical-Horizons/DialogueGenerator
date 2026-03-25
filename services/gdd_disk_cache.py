"""Cache disque du GDD (pickle) invalidé par empreinte des fichiers sources.

Réduit fortement le temps de cold start quand les JSON GDD ne changent pas entre
deux lancements du processus API (reloader, tests manuels, etc.).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import pickle
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from services.gdd_loader import GDDLoader

logger = logging.getLogger(__name__)

DISK_CACHE_FORMAT_VERSION = 1
MANIFEST_NAME = "manifest.json"
PICKLE_NAME = "gdd_data.pkl"
SNAPSHOT_SUBDIR = ".gdd_snapshot"


def _disk_cache_enabled() -> bool:
    """True si le cache disque est autorisé (désactivé sous pytest par défaut)."""
    if "pytest" in sys.modules:
        return False
    return os.getenv("GDD_DISK_CACHE", "true").lower() in ("true", "1", "yes")


def _snapshot_dir(loader: GDDLoader) -> Path:
    """Répertoire du snapshot sous data/ du projet."""
    return (Path(loader._project_root_dir) / "data" / SNAPSHOT_SUBDIR).resolve()


def _manifest_path(loader: GDDLoader) -> Path:
    return _snapshot_dir(loader) / MANIFEST_NAME


def _pickle_path(loader: GDDLoader) -> Path:
    return _snapshot_dir(loader) / PICKLE_NAME


def compute_gdd_fingerprint(loader: GDDLoader) -> str:
    """Empreinte des chemins GDD + mtimes + tailles (ordre stable)."""
    lines: List[str] = [
        f"categories_path|{loader._categories_path.resolve()}",
        f"import_path|{loader._import_path.resolve()}",
        f"format|{DISK_CACHE_FORMAT_VERSION}",
    ]
    vp = loader._resolve_vision_json_path()
    if vp is not None:
        st = vp.stat()
        lines.append(f"vision|{vp.resolve()}|{st.st_mtime_ns}|{st.st_size}")
    else:
        lines.append("vision|MISSING")

    for category_name in loader.CATEGORIES_CONFIG:
        p = loader._resolve_category_json_path(category_name)
        if p is not None:
            st = p.stat()
            lines.append(f"{category_name}|{p.resolve()}|{st.st_mtime_ns}|{st.st_size}")
        else:
            lines.append(f"{category_name}|MISSING")

    payload = "\n".join(lines).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def try_load_gdd_from_disk(loader: GDDLoader) -> Optional[GDDData]:
    """Retourne GDDData désérialisé si manifest et pickle valides, sinon None."""
    if not _disk_cache_enabled():
        return None

    snap = _snapshot_dir(loader)
    manifest_file = snap / MANIFEST_NAME
    pickle_file = snap / PICKLE_NAME
    if not manifest_file.is_file() or not pickle_file.is_file():
        return None

    try:
        with open(manifest_file, "r", encoding="utf-8") as f:
            manifest: Dict[str, Any] = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        logger.debug("Cache disque GDD: manifest illisible (%s), rechargement JSON.", e)
        return None

    if manifest.get("format") != DISK_CACHE_FORMAT_VERSION:
        return None

    current_fp = compute_gdd_fingerprint(loader)
    if manifest.get("fingerprint") != current_fp:
        logger.debug("Cache disque GDD: empreinte obsolète, rechargement JSON.")
        return None

    try:
        with open(pickle_file, "rb") as f:
            data = pickle.load(f)
    except (OSError, pickle.PickleError, AttributeError, EOFError) as e:
        logger.warning("Cache disque GDD: pickle invalide (%s), rechargement JSON.", e)
        return None

    # Import runtime class (pickle peut avoir référencé GDDData)
    from services.gdd_loader import GDDData as GDDDataCls

    if not isinstance(data, GDDDataCls):
        logger.warning("Cache disque GDD: type inattendu %s, rechargement JSON.", type(data))
        return None

    logger.info(
        "GDD chargé depuis le cache disque (%s) — aucun reparsing JSON.",
        pickle_file,
    )
    return data


def try_save_gdd_to_disk(loader: GDDLoader, gdd_data: "GDDData") -> None:
    """Écrit manifest + pickle (écriture atomique du pickle)."""
    if not _disk_cache_enabled():
        return

    snap = _snapshot_dir(loader)
    try:
        snap.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.warning("Cache disque GDD: impossible de créer %s (%s).", snap, e)
        return

    fingerprint = compute_gdd_fingerprint(loader)
    manifest = {
        "format": DISK_CACHE_FORMAT_VERSION,
        "fingerprint": fingerprint,
    }
    pickle_file = snap / PICKLE_NAME
    tmp = snap / (PICKLE_NAME + ".tmp")

    try:
        with open(tmp, "wb") as f:
            pickle.dump(gdd_data, f, protocol=pickle.HIGHEST_PROTOCOL)
        tmp.replace(pickle_file)
        with open(snap / MANIFEST_NAME, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=0)
        logger.debug("Cache disque GDD écrit (%s).", pickle_file)
    except OSError as e:
        logger.warning("Cache disque GDD: écriture échouée (%s).", e)
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass

"""Noms de fichiers shards GDD : ``{nom}_{uuid}.json`` avec compatibilité legacy ``{uuid}.json``."""
from __future__ import annotations

import json
import logging
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

from services.gdd_notion_atomic_io import write_json_atomic
from services.gdd_notion_sync_utils import normalize_notion_id

logger = logging.getLogger(__name__)

_UUID_SUFFIX_RE = re.compile(
    r"_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$",
    re.IGNORECASE,
)


def sanitize_shard_nom_stem(nom: str) -> str:
    """Réduit un ``Nom`` GDD en segment de nom de fichier (ASCII, sans espaces).

    Args:
        nom: Titre de la fiche.

    Returns:
        Segment sûr pour le disque (max 48 caractères), ou ``fiche`` si vide.
    """
    cleaned = (nom or "").strip()
    if not cleaned:
        return "fiche"
    nk = unicodedata.normalize("NFKD", cleaned)
    ascii_text = "".join(c for c in nk if not unicodedata.combining(c))
    base = re.sub(r"[^\w\-]+", "_", ascii_text, flags=re.UNICODE).strip("_")[:48]
    return base or "fiche"


def build_gdd_shard_filename(nom: str, notion_page_id: str) -> str:
    """Construit ``{nom_sanitisé}_{uuid}.json`` pour une fiche shard.

    Args:
        nom: Titre affiché de l'entité.
        notion_page_id: Identifiant Notion de la page (ligne de base).

    Returns:
        Nom de fichier relatif (ex. ``Uresair_1996e4d2-1b45-80c4-9c73-ddac6322e9bd.json``).

    Raises:
        ValueError: Si ``notion_page_id`` n'est pas un UUID Notion valide.
    """
    nid = normalize_notion_id(notion_page_id.strip())
    stem = sanitize_shard_nom_stem(nom)
    return f"{stem}_{nid}.json"


def notion_page_id_from_shard_stem(stem: str) -> Optional[str]:
    """Extrait l'UUID Notion depuis un stem de shard (legacy ou ``nom_uuid``).

    Args:
        stem: Nom de fichier sans extension.

    Returns:
        UUID normalisé ou ``None`` si non reconnu.
    """
    raw = (stem or "").strip()
    if not raw:
        return None
    suffix = _UUID_SUFFIX_RE.search(raw)
    if suffix is not None:
        try:
            return normalize_notion_id(suffix.group(1))
        except ValueError:
            return None
    try:
        return normalize_notion_id(raw)
    except ValueError:
        return None


def _record_notion_page_id(record: Mapping[str, Any]) -> Optional[str]:
    """Lit ``notion_page_id`` dans un enregistrement shard."""
    raw = str(record.get("notion_page_id") or "").strip()
    if not raw:
        return None
    try:
        return normalize_notion_id(raw)
    except ValueError:
        return raw


def legacy_shard_paths_for_page(
    shard_dir: Path,
    notion_page_id: str,
    *,
    keep_filename: str,
) -> List[Path]:
    """Liste les shards obsolètes pour une même page Notion (évite les doublons).

    Args:
        shard_dir: Répertoire de catégorie (ex. ``personnages/``).
        notion_page_id: UUID de la page Notion cible.
        keep_filename: Nom de fichier à conserver (nouveau format).

    Returns:
        Chemins à supprimer avant ou après écriture du shard canonique.
    """
    try:
        target_id = normalize_notion_id(notion_page_id.strip())
    except ValueError:
        return []
    if not shard_dir.is_dir():
        return []
    keep_name = Path(keep_filename).name
    stale: List[Path] = []
    for path in shard_dir.glob("*.json"):
        if path.name == keep_name:
            continue
        stem_id = notion_page_id_from_shard_stem(path.stem)
        if stem_id == target_id:
            stale.append(path)
            continue
        try:
            with open(path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(payload, dict):
            continue
        rec_id = _record_notion_page_id(payload)
        if rec_id == target_id:
            stale.append(path)
    return stale


def write_gdd_shard_atomic(
    shard_dir: Path,
    record: Dict[str, Any],
    notion_page_id: str,
) -> Path:
    """Écrit un shard ``nom_uuid`` et retire les fichiers legacy pour la même page.

    Args:
        shard_dir: Répertoire cible de la catégorie liste.
        record: Enregistrement GDD sérialisable.
        notion_page_id: Identifiant Notion de la ligne.

    Returns:
        Chemin absolu du fichier écrit.
    """
    shard_dir.mkdir(parents=True, exist_ok=True)
    nom = str(record.get("Nom") or "").strip()
    filename = build_gdd_shard_filename(nom, notion_page_id)
    target = shard_dir / filename
    for stale in legacy_shard_paths_for_page(
        shard_dir,
        notion_page_id,
        keep_filename=filename,
    ):
        try:
            stale.unlink(missing_ok=True)
            logger.debug("Shard legacy supprimé : %s", stale.name)
        except OSError as exc:
            logger.warning("Impossible de supprimer le shard legacy %s: %s", stale, exc)
    write_json_atomic(target, record)
    return target

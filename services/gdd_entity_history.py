"""Historique local des versions d'entités GDD (Story 3.9 FR19), alimenté par la sync Notion."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.gdd_notion_atomic_io import read_json_file, write_json_atomic

_MAX_EVENTS_PER_ENTITY = 40

_HISTORY_ROOT = Path("data") / "GDD_entity_history"


def _safe_entity_key(name: str) -> str:
    """Nom de fichier sûr à partir du champ ``Nom`` GDD."""
    raw = (name or "unknown").strip() or "unknown"
    safe = re.sub(r"[^\w\-.]+", "_", raw, flags=re.UNICODE)
    return safe[:120] if len(safe) > 120 else safe


def entity_history_path(repo_root: Path, category_stem: str, entity_name: str) -> Path:
    """Chemin du fichier d'historique pour une entité."""
    stem = re.sub(r"[^\w\-.]+", "_", category_stem.strip() or "misc", flags=re.UNICODE)[:80]
    return repo_root / _HISTORY_ROOT / stem / f"{_safe_entity_key(entity_name)}.json"


def record_entity_change(
    repo_root: Path,
    category_stem: str,
    entity_name: str,
    snapshot: Dict[str, Any],
    *,
    source: str = "notion_sync",
    recorded_at: Optional[str] = None,
) -> None:
    """Ajoute une entrée d'historique (append, plafonné).

    Args:
        repo_root: Racine du dépôt DialogueGenerator.
        category_stem: Fichier catégorie sans extension (ex. ``personnages``).
        entity_name: Valeur du champ ``Nom`` de l'entité.
        snapshot: Copie sérialisable du record GDD au moment de l'écriture.
        source: Origine de la modification.
        recorded_at: Horodatage ISO8601 ; défaut : UTC maintenant.
    """
    path = entity_history_path(repo_root, category_stem, entity_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    existing: List[Dict[str, Any]] = read_json_file(path, default=[])
    if not isinstance(existing, list):
        existing = []
    at = recorded_at or datetime.now(timezone.utc).isoformat()
    entry = {
        "at": at,
        "source": source,
        "summary": f"Mise à jour ({source})",
        "snapshot": snapshot,
    }
    existing.append(entry)
    if len(existing) > _MAX_EVENTS_PER_ENTITY:
        existing = existing[-_MAX_EVENTS_PER_ENTITY :]
    write_json_atomic(path, existing, indent=2)


def load_entity_history(
    repo_root: Path,
    category_stem: str,
    entity_name: str,
) -> List[Dict[str, Any]]:
    """Charge la timeline brute (liste d'événements)."""
    path = entity_history_path(repo_root, category_stem, entity_name)
    data = read_json_file(path, default=[])
    return data if isinstance(data, list) else []


def diff_snapshots_json(before: Dict[str, Any], after: Dict[str, Any]) -> str:
    """Diff texte minimal entre deux snapshots (MVP, pas un vrai diff unifié)."""
    b = json.dumps(before, sort_keys=True, ensure_ascii=False, indent=2, default=str)
    a = json.dumps(after, sort_keys=True, ensure_ascii=False, indent=2, default=str)
    if b == a:
        return "(aucun changement de contenu sérialisé)"
    return f"--- avant ({len(b)} car.)\n+++ après ({len(a)} car.)\n"

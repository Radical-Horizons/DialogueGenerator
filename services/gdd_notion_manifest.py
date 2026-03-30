"""Manifeste local last_edited_time pour sync incrémentale GDD Notion."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Tuple

from services.gdd_notion_atomic_io import read_json_file, write_json_atomic

MANIFEST_SCHEMA_VERSION = 1


@dataclass
class GddNotionManifest:
    """Manifeste : horodatages Notion par ressource."""

    schema_version: int = MANIFEST_SCHEMA_VERSION
    entries: Dict[str, str] = field(default_factory=dict)
    last_full_sync_at: Optional[str] = None

    def set_edited(self, resource_id: str, edited_iso: str) -> None:
        """Enregistre le last_edited_time Notion pour une ressource."""
        self.entries[resource_id] = edited_iso

    def is_stale(self, resource_id: str, notion_last_edited: str) -> bool:
        """True si la ressource doit être retraitée (ou inconnue du manifeste)."""
        prev_s = self.entries.get(resource_id)
        if not prev_s:
            return True
        try:
            prev = datetime.fromisoformat(prev_s.replace("Z", "+00:00"))
            cur = datetime.fromisoformat(notion_last_edited.replace("Z", "+00:00"))
        except ValueError:
            return True
        if prev.tzinfo is None:
            prev = prev.replace(tzinfo=timezone.utc)
        if cur.tzinfo is None:
            cur = cur.replace(tzinfo=timezone.utc)
        return cur > prev

    def to_dict(self) -> Dict[str, Any]:
        """Sérialise pour JSON."""
        return {
            "schema_version": self.schema_version,
            "entries": dict(self.entries),
            "last_full_sync_at": self.last_full_sync_at,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "GddNotionManifest":
        """Charge depuis un dict."""
        return cls(
            schema_version=int(data.get("schema_version", MANIFEST_SCHEMA_VERSION)),
            entries=dict(data.get("entries") or {}),
            last_full_sync_at=data.get("last_full_sync_at"),
        )


def load_manifest(path: Path) -> GddNotionManifest:
    """Charge le manifeste depuis le disque."""
    raw = read_json_file(path, default={})
    if not isinstance(raw, dict):
        return GddNotionManifest()
    return GddNotionManifest.from_dict(raw)


def save_manifest(path: Path, manifest: GddNotionManifest) -> None:
    """Persiste le manifeste (écriture atomique)."""
    write_json_atomic(path, manifest.to_dict())


def filter_stale_page_ids(
    pages: List[Mapping[str, Any]],
    manifest: GddNotionManifest,
    *,
    force_full: bool,
) -> Tuple[List[str], List[Mapping[str, Any]]]:
    """Sépare les pages à recharger selon le manifeste.

    Args:
        pages: Résultats Notion (champ id, last_edited_time).
        manifest: Manifeste courant.
        force_full: Si True, toutes les pages sont considérées stale.

    Returns:
        (ids_à_traiter, pages_correspondantes dans l'ordre des ids)
    """
    stale_ids: List[str] = []
    stale_pages: List[Mapping[str, Any]] = []
    for p in pages:
        pid = p.get("id")
        if not pid:
            continue
        edited = p.get("last_edited_time") or ""
        if force_full or manifest.is_stale(pid, edited):
            stale_ids.append(pid)
            stale_pages.append(p)
    return stale_ids, stale_pages

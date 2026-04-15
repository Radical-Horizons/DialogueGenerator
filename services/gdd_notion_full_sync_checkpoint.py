"""Checkpoint disque pour sync complète GDD Notion (reprise après coupure)."""
from __future__ import annotations

import hashlib
import json
import logging
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from services.gdd_notion_sync_utils import normalize_notion_id

from services.gdd_notion_atomic_io import read_json_file, write_json_atomic
from services.gdd_notion_manifest import GddNotionManifest, save_manifest

logger = logging.getLogger(__name__)

CHECKPOINT_SCHEMA_VERSION = 1

CHECKPOINT_FILENAME = "full_sync_checkpoint.json"
MANIFEST_SIDECAR_FILENAME = "full_sync_checkpoint.manifest.json"


def checkpoint_paths(sync_dir: Path) -> Tuple[Path, Path]:
    """Chemins checkpoint JSON et sidecar manifeste."""
    base = sync_dir.resolve()
    return (
        base / CHECKPOINT_FILENAME,
        base / MANIFEST_SIDECAR_FILENAME,
    )


def checkpoint_json_path(sync_dir: Path) -> Path:
    """Chemin du fichier JSON checkpoint (même sans fichier manifeste)."""
    return checkpoint_paths(sync_dir)[0]


def list_staging_run_dirs(gdd_root: Path) -> List[Path]:
    """Liste les répertoires immédiats sous ``GDD_categories/.staging/``."""
    base = gdd_root.resolve() / ".staging"
    if not base.is_dir():
        return []
    return sorted((p for p in base.iterdir() if p.is_dir()), key=lambda p: p.name)


def prune_staging_runs_keep_only(gdd_root: Path, keep_name: Optional[str]) -> int:
    """Supprime les runs sous ``.staging/`` sauf ``keep_name`` (tous si ``keep_name`` est None).

    Returns:
        Nombre de répertoires supprimés.
    """
    removed = 0
    for p in list_staging_run_dirs(gdd_root):
        if keep_name and p.name == keep_name:
            continue
        try:
            shutil.rmtree(p)
            removed += 1
        except OSError as exc:
            logger.warning("Suppression staging orphelin %s impossible: %s", p, exc)
    return removed


def compute_sources_fingerprint(
    sources: Sequence[Mapping[str, Any]],
    included_categories: Sequence[str],
) -> str:
    """Empreinte stable des sources + filtres (invalidation si config change)."""
    norm_sources: List[Dict[str, Any]] = []
    for s in sources:
        if not isinstance(s, dict):
            continue
        ds_norm: List[str] = []
        raw_ds = s.get("notion_data_source_ids")
        if isinstance(raw_ds, list):
            for d in raw_ds:
                if isinstance(d, str) and d.strip():
                    try:
                        ds_norm.append(normalize_notion_id(d.strip()))
                    except ValueError:
                        pass
        ds_norm.sort()
        norm_sources.append(
            {
                "kind": s.get("kind"),
                "notion_id": str(s.get("notion_id", "")).strip(),
                "category_file": str(s.get("category_file", "")).strip(),
                "notion_data_source_ids": ds_norm,
            }
        )
    norm_sources.sort(key=lambda x: x.get("category_file", ""))
    inc = sorted({str(x).strip() for x in included_categories if str(x).strip()})
    payload = json.dumps(
        {"sources": norm_sources, "included": inc},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass
class FullSyncCheckpointState:
    """État sérialisé du checkpoint (hors manifeste volumineux)."""

    schema_version: int = CHECKPOINT_SCHEMA_VERSION
    staging_run_name: str = ""
    archive_rel: str = ""
    eligible_category_files: List[str] = field(default_factory=list)
    completed_category_files: List[str] = field(default_factory=list)
    sources_fingerprint: str = ""
    updated_entities: int = 0
    created_at: str = ""
    updated_at: str = ""
    #: True après une sync complète dont la promotion miroir a été refusée (erreurs partielles).
    mirror_promotion_pending: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "staging_run_name": self.staging_run_name,
            "archive_rel": self.archive_rel,
            "eligible_category_files": list(self.eligible_category_files),
            "completed_category_files": list(self.completed_category_files),
            "sources_fingerprint": self.sources_fingerprint,
            "updated_entities": self.updated_entities,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "mirror_promotion_pending": self.mirror_promotion_pending,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "FullSyncCheckpointState":
        return cls(
            schema_version=int(data.get("schema_version", CHECKPOINT_SCHEMA_VERSION)),
            staging_run_name=str(data.get("staging_run_name") or ""),
            archive_rel=str(data.get("archive_rel") or ""),
            eligible_category_files=[
                str(x) for x in (data.get("eligible_category_files") or []) if x
            ],
            completed_category_files=[
                str(x) for x in (data.get("completed_category_files") or []) if x
            ],
            sources_fingerprint=str(data.get("sources_fingerprint") or ""),
            updated_entities=int(data.get("updated_entities") or 0),
            created_at=str(data.get("created_at") or ""),
            updated_at=str(data.get("updated_at") or ""),
            mirror_promotion_pending=bool(data.get("mirror_promotion_pending", False)),
        )


def load_checkpoint_state(sync_dir: Path) -> Optional[FullSyncCheckpointState]:
    """Charge le checkpoint si présent et schema OK, sinon None."""
    ck_path, _ = checkpoint_paths(sync_dir)
    raw = read_json_file(ck_path, default=None)
    if not isinstance(raw, dict):
        return None
    try:
        st = FullSyncCheckpointState.from_dict(raw)
    except (TypeError, ValueError) as exc:
        logger.warning("Checkpoint invalide (structure): %s", exc)
        return None
    if st.schema_version != CHECKPOINT_SCHEMA_VERSION:
        logger.warning("Checkpoint schema_version incompatible: %s", st.schema_version)
        return None
    if not st.staging_run_name or not st.eligible_category_files:
        return None
    return st


def load_run_manifest(manifest_path: Path) -> GddNotionManifest:
    """Charge le manifeste de run depuis le sidecar, ou manifeste vide."""
    if not manifest_path.exists():
        return GddNotionManifest()
    raw = read_json_file(manifest_path, default={})
    if not isinstance(raw, dict):
        return GddNotionManifest()
    return GddNotionManifest.from_dict(raw)


def save_run_manifest(manifest_path: Path, manifest: GddNotionManifest) -> None:
    """Persiste le manifeste de run (sidecar)."""
    write_json_atomic(manifest_path, manifest.to_dict())


def save_checkpoint(
    sync_dir: Path,
    state: FullSyncCheckpointState,
    run_manifest: GddNotionManifest,
) -> None:
    """Écrit checkpoint + sidecar manifeste (atomique)."""
    now = datetime.now(timezone.utc).isoformat()
    if not state.created_at:
        state.created_at = now
    state.updated_at = now
    ck_path, sidecar = checkpoint_paths(sync_dir)
    save_run_manifest(sidecar, run_manifest)
    write_json_atomic(ck_path, state.to_dict())


def clear_checkpoint_files(sync_dir: Path) -> None:
    """Supprime checkpoint et sidecar s'ils existent."""
    ck_path, sidecar = checkpoint_paths(sync_dir)
    for p in (ck_path, sidecar):
        try:
            if p.exists():
                p.unlink()
        except OSError as exc:
            logger.warning("Suppression checkpoint %s impossible: %s", p, exc)


def validate_checkpoint_for_resume(
    gdd_root: Path,
    sync_dir: Path,
    *,
    eligible_category_files: Sequence[str],
    sources_fingerprint: str,
) -> Tuple[bool, str]:
    """Vérifie qu'on peut reprendre depuis le disque.

    Returns:
        (ok, message) — message explique l'échec si ok False.
    """
    state = load_checkpoint_state(sync_dir)
    if state is None:
        return False, "Aucun checkpoint de sync complète valide."

    if state.sources_fingerprint != sources_fingerprint:
        return False, "Configuration des sources modifiée depuis le checkpoint."

    exp = list(eligible_category_files)
    if exp != state.eligible_category_files:
        return (
            False,
            "Liste ou ordre des sources ne correspond plus au checkpoint.",
        )

    staging = (gdd_root.resolve() / ".staging" / state.staging_run_name).resolve()
    gdd = gdd_root.resolve()
    try:
        if not staging.is_relative_to(gdd):
            return False, "Chemin staging invalide."
    except AttributeError:
        if not str(staging).startswith(str(gdd)):
            return False, "Chemin staging invalide."
    if not staging.is_dir():
        return False, "Dossier staging du checkpoint introuvable."

    return True, ""


def staging_run_path(gdd_root: Path, staging_run_name: str) -> Path:
    """Chemin absolu du run staging."""
    return (gdd_root.resolve() / ".staging" / staging_run_name).resolve()


def remove_staging_run_by_name(gdd_root: Path, staging_run_name: str) -> None:
    """Supprime ``.staging/<name>`` si présent."""
    p = staging_run_path(gdd_root, staging_run_name)
    if p.is_dir():
        try:
            shutil.rmtree(p)
        except OSError as exc:
            logger.warning("Suppression staging %s impossible: %s", p, exc)


def promote_run_manifest_to_production(
    manifest_prod_path: Path,
    run_manifest: GddNotionManifest,
) -> None:
    """Copie le manifeste de run vers le fichier manifeste production."""
    save_manifest(manifest_prod_path, run_manifest)


def abandon_checkpoint_on_disk(gdd_root: Path, sync_dir: Path) -> None:
    """Supprime checkpoint, sidecar et tout ``.staging/`` (un seul run incomplet autorisé)."""
    state = load_checkpoint_state(sync_dir)
    if state is not None and state.staging_run_name:
        remove_staging_run_by_name(gdd_root, state.staging_run_name)
    clear_checkpoint_files(sync_dir)
    prune_staging_runs_keep_only(gdd_root, None)

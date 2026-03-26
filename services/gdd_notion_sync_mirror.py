"""Archive locale, staging et promotion pour sync GDD « miroir » (Notion = vérité)."""
from __future__ import annotations

import logging
import re
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional, Set

from services.gdd_notion_sync_utils import category_stem_to_list_category_key

logger = logging.getLogger(__name__)

GDD_RESERVED_TOP_LEVEL: frozenset[str] = frozenset({".archive", ".staging"})

_ARCHIVE_ID_RE = re.compile(r"^(\d{8}T\d{6}Z)_[0-9a-f]{8}$")


@dataclass(frozen=True)
class GddArchiveInfo:
    """Métadonnées d'un snapshot sous ``GDD_categories/.archive/``."""

    id: str
    created_at: datetime

    @property
    def created_at_iso(self) -> str:
        """Horodatage UTC ISO 8601 (avec offset Z)."""
        if self.created_at.tzinfo is None:
            dt = self.created_at.replace(tzinfo=timezone.utc)
        else:
            dt = self.created_at.astimezone(timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")


def unique_run_dir_name() -> str:
    """Nom de sous-répertoire unique (triable par préfixe date)."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{ts}_{uuid.uuid4().hex[:8]}"


def archive_gdd_snapshot(gdd_root: Path) -> Path:
    """Copie tout le contenu utile de ``gdd_root`` vers ``.archive/<run>/``.

    Exclut ``.archive`` et ``.staging`` à la racine (pas de récursion infinie).

    Args:
        gdd_root: Répertoire ``GDD_categories``.

    Returns:
        Chemin du dossier d'archive créé (ex. ``.../.archive/20260326T..._abc``).

    Raises:
        OSError: Échec copie / création répertoires.
    """
    gdd_root = gdd_root.resolve()
    gdd_root.mkdir(parents=True, exist_ok=True)
    archive_base = gdd_root / ".archive"
    archive_base.mkdir(exist_ok=True)
    dest = archive_base / unique_run_dir_name()
    dest.mkdir(parents=False)
    for child in gdd_root.iterdir():
        if child.name in GDD_RESERVED_TOP_LEVEL:
            continue
        target = dest / child.name
        if child.is_dir():
            shutil.copytree(child, target)
        else:
            shutil.copy2(child, target)
    logger.info("Snapshot GDD archivé: %s", dest)
    return dest


def prune_archives(gdd_root: Path, keep: int) -> None:
    """Garde au plus ``keep`` sous-dossiers dans ``.archive/`` (supprime les plus anciens).

    Args:
        gdd_root: Racine ``GDD_categories``.
        keep: Nombre minimum 1.
    """
    base = gdd_root.resolve() / ".archive"
    if not base.is_dir():
        return
    k = max(1, int(keep))
    dirs = sorted(p for p in base.iterdir() if p.is_dir())
    while len(dirs) > k:
        oldest = dirs.pop(0)
        try:
            shutil.rmtree(oldest)
            logger.info("Archive ancienne supprimée (rétention): %s", oldest.name)
        except OSError as exc:
            logger.warning("Suppression archive %s impossible: %s", oldest, exc)


def list_gdd_archives(gdd_root: Path, *, limit: int) -> List[GddArchiveInfo]:
    """Liste les snapshots valides sous ``.archive/``, du plus récent au plus ancien.

    Args:
        gdd_root: Racine ``GDD_categories``.
        limit: Nombre maximum d'entrées (minimum 1).

    Returns:
        Liste triée par nom de dossier décroissant (préfixe date UTC triable).
    """
    base = gdd_root.resolve() / ".archive"
    if not base.is_dir():
        return []
    n = max(1, int(limit))
    candidates: List[tuple[str, datetime]] = []
    for child in base.iterdir():
        if not child.is_dir():
            continue
        m = _ARCHIVE_ID_RE.fullmatch(child.name)
        if not m:
            continue
        try:
            parsed = datetime.strptime(m.group(1), "%Y%m%dT%H%M%SZ").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            continue
        candidates.append((child.name, parsed))
    candidates.sort(key=lambda x: x[0], reverse=True)
    return [GddArchiveInfo(id=name, created_at=dt) for name, dt in candidates[:n]]


def resolve_archive_dir(gdd_root: Path, archive_id: str) -> Path:
    """Résout un identifiant d'archive vers un répertoire sous ``.archive/``.

    Args:
        gdd_root: Racine ``GDD_categories``.
        archive_id: Nom du dossier (ex. ``20260326T120000Z_a1b2c3d4``).

    Returns:
        Chemin résolu du snapshot.

    Raises:
        ValueError: Identifiant invalide, traversal, ou dossier absent.
    """
    aid = (archive_id or "").strip()
    if not aid or "/" in aid or "\\" in aid or ".." in aid:
        raise ValueError("Identifiant d'archive invalide")
    if not _ARCHIVE_ID_RE.fullmatch(aid):
        raise ValueError("Identifiant d'archive invalide")
    gdd = gdd_root.resolve()
    archive_base = (gdd / ".archive").resolve()
    dest = (archive_base / aid).resolve()
    try:
        if not dest.is_relative_to(archive_base):
            raise ValueError("Chemin d'archive refusé")
    except AttributeError:
        # Python < 3.9 : repli startswith (Windows chemins normalisés)
        if not str(dest).startswith(str(archive_base)):
            raise ValueError("Chemin d'archive refusé") from None
    if dest == archive_base or not dest.is_dir():
        raise ValueError("Archive introuvable")
    return dest


def restore_gdd_from_archive(
    gdd_root: Path,
    archive_dir: Path,
    *,
    backup_current: bool,
    retention_count: Optional[int] = None,
) -> Optional[str]:
    """Rétablit le contenu racine GDD depuis un snapshot (hors ``.archive`` / ``.staging``).

    Copie le snapshot vers un run staging puis ``promote_staging_to_live`` pour chaque
    nom présent sur le live ou dans le snapshot (supprime les orphelins du live).

    Args:
        gdd_root: Racine ``GDD_categories``.
        archive_dir: Répertoire du snapshot (déjà validé).
        backup_current: Si True, archive l'état courant avant restauration.
        retention_count: Si fourni et ``backup_current``, applique ``prune_archives`` après.

    Returns:
        Chemin relatif du backup créé (sous ``.archive/``) si ``backup_current``, sinon None.

    Raises:
        OSError: Échec copie / promotion.
        ValueError: Archive hors périmètre (ne pas appeler sans ``resolve_archive_dir``).
    """
    gdd = gdd_root.resolve()
    snap = archive_dir.resolve()
    archive_base = (gdd / ".archive").resolve()
    try:
        if not snap.is_relative_to(archive_base):
            raise ValueError("Répertoire d'archive hors périmètre")
    except AttributeError:
        if not str(snap).startswith(str(archive_base)):
            raise ValueError("Répertoire d'archive hors périmètre") from None

    new_rel: Optional[str] = None
    if backup_current:
        arch_path = archive_gdd_snapshot(gdd)
        new_rel = str(arch_path.relative_to(gdd))
        if retention_count is not None:
            prune_archives(gdd, max(1, int(retention_count)))

    live_names = {
        c.name
        for c in gdd.iterdir()
        if c.name not in GDD_RESERVED_TOP_LEVEL
    }
    snap_names = {c.name for c in snap.iterdir()}
    targets: Set[Path] = {(gdd / n).resolve() for n in live_names | snap_names}

    staging_run = create_staging_run_dir(gdd)
    try:
        for child in snap.iterdir():
            dest = staging_run / child.name
            if child.is_dir():
                shutil.copytree(child, dest)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(child, dest)
        promote_staging_to_live(gdd, staging_run, targets)
    except OSError:
        cleanup_staging_only(staging_run)
        raise
    logger.info("GDD restauré depuis snapshot %s", snap.name)
    return new_rel


def collect_sync_targets(gdd_root: Path, category_files: Iterable[str]) -> Set[Path]:
    """Chemins absolus des cibles (fichier monolithe ou dossier shards) à remplacer au promote.

    Args:
        gdd_root: Racine ``GDD_categories``.
        category_files: Noms ``category_file`` des sources éligibles (dédupliqués).

    Returns:
        Ensemble de chemins résolus sous ``gdd_root``.
    """
    root = gdd_root.resolve()
    out: Set[Path] = set()
    seen: Set[str] = set()
    for cat_file in category_files:
        raw = str(cat_file or "").strip()
        if not raw or raw in seen:
            continue
        seen.add(raw)
        sk = category_stem_to_list_category_key(Path(raw).stem)
        if sk:
            out.add((root / sk).resolve())
        else:
            out.add((root / raw).resolve())
    return out


def partial_errors_block_mirror_promote(partial: List[str]) -> bool:
    """True si une erreur « bloquante » empêche la promotion miroir.

    Les avertissements du type page ignorée (vide) ne bloquent pas.

    Args:
        partial: Liste ``partial_errors`` agrégée pendant la sync.

    Returns:
        True si on ne doit pas promouvoir le staging vers le live.
    """
    for line in partial:
        if ": fetch —" in line or ": fetch -" in line:
            return True
        if ": écriture —" in line:
            return True
        # Même motif que le service : ``{cat_file} page {id}: …`` (erreur fetch page).
        if " page " in line and "ignorée" not in line:
            return True
    return False


def create_staging_run_dir(gdd_root: Path) -> Path:
    """Crée ``gdd_root/.staging/<run_id>/`` et retourne ce chemin."""
    gdd_root = gdd_root.resolve()
    run = gdd_root / ".staging" / unique_run_dir_name()
    run.mkdir(parents=True, exist_ok=True)
    return run


def remove_staging_run_dir(staging_run: Path) -> None:
    """Supprime un répertoire de run staging (ignore si absent)."""
    try:
        if staging_run.exists():
            shutil.rmtree(staging_run)
    except OSError as exc:
        logger.warning("Suppression staging %s: %s", staging_run, exc)


def promote_staging_to_live(
    gdd_root: Path,
    staging_run: Path,
    targets: Set[Path],
) -> None:
    """Pour chaque cible : supprime le live, déplace depuis le staging si présent.

    Args:
        gdd_root: Racine ``GDD_categories``.
        staging_run: Répertoire racine de ce run (contient ``personnages/``, ``*.json``, etc.).
        targets: Chemins absolus attendus sous ``gdd_root``.

    Raises:
        OSError: Échec suppression / déplacement.
    """
    gdd = gdd_root.resolve()
    stage_base = staging_run.resolve()
    for live in targets:
        live = live.resolve()
        if not str(live).startswith(str(gdd)):
            logger.warning("Cible hors gdd_root ignorée: %s", live)
            continue
        rel = live.relative_to(gdd)
        staged = stage_base / rel
        if live.exists():
            if live.is_dir():
                shutil.rmtree(live)
            else:
                live.unlink()
        if staged.exists():
            live.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(staged), str(live))
    remove_staging_run_dir(staging_run)


def cleanup_staging_only(staging_run: Path) -> None:
    """Supprime un run staging sans toucher au live (échec sync miroir)."""
    remove_staging_run_dir(staging_run)

"""Archive locale, staging et promotion pour sync GDD « miroir » (Notion = vérité)."""
from __future__ import annotations

import filecmp
import json
import logging
import re
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

from services.gdd_notion_sync_utils import (
    category_file_matches_included,
    category_stem_to_list_category_key,
)

logger = logging.getLogger(__name__)

GDD_RESERVED_TOP_LEVEL: frozenset[str] = frozenset({".archive", ".staging"})

_ARCHIVE_ID_RE = re.compile(r"^(\d{8}T\d{6}Z)_[0-9a-f]{8}$")


@dataclass(frozen=True)
class GddArchiveInfo:
    """Métadonnées d'un snapshot sous ``GDD_categories/.archive/``."""

    id: str
    created_at: datetime
    size_bytes: int = 0
    fiche_count: int = 0

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


@dataclass(frozen=True)
class GddArchiveDecision:
    """Résultat d'une demande de snapshot : nouveau dossier ou réutilisation du dernier."""

    archive_rel: str
    created_new: bool


def _mirror_tree_relative_files(base: Path, *, skip_reserved_top: bool) -> Dict[str, Path]:
    """Fichiers sous ``base`` avec clé chemin relatif POSIX (hors réserves si racine GDD)."""
    base = base.resolve()
    out: Dict[str, Path] = {}
    for child in base.iterdir():
        if skip_reserved_top and child.name in GDD_RESERVED_TOP_LEVEL:
            continue
        if child.is_file():
            out[child.name] = child
        elif child.is_dir():
            for p in child.rglob("*"):
                if p.is_file():
                    out[p.relative_to(base).as_posix()] = p
    return out


def gdd_live_matches_snapshot_dir(gdd_root: Path, snapshot_dir: Path) -> bool:
    """True si le contenu miroir du live (hors ``.archive`` / ``.staging``) est identique au snapshot.

    Comparaison par chemins relatifs et contenu binaire des fichiers.
    """
    gdd_root = gdd_root.resolve()
    snapshot_dir = snapshot_dir.resolve()
    live_map = _mirror_tree_relative_files(gdd_root, skip_reserved_top=True)
    snap_map = _mirror_tree_relative_files(snapshot_dir, skip_reserved_top=False)
    if set(live_map.keys()) != set(snap_map.keys()):
        return False
    for rel in live_map:
        a, b = live_map[rel], snap_map[rel]
        if not filecmp.cmp(a, b, shallow=False):
            return False
    return True


def archive_gdd_snapshot_if_delta(gdd_root: Path) -> GddArchiveDecision:
    """Archive le live sous ``.archive/<run>/`` seulement s'il diffère du dernier snapshot valide.

    Si le dernier snapshot a le même contenu fichier à fichier, réutilise son ``archive_rel``
    sans créer de dossier ni copier.
    """
    gdd_root = gdd_root.resolve()
    latest = list_gdd_archives(gdd_root, limit=1, include_empty=True)
    if latest:
        prev = gdd_root / ".archive" / latest[0].id
        if prev.is_dir() and gdd_live_matches_snapshot_dir(gdd_root, prev):
            logger.info(
                "Snapshot GDD omis (contenu identique au dernier: %s)", latest[0].id
            )
            return GddArchiveDecision(
                archive_rel=f".archive/{latest[0].id}", created_new=False
            )
    dest = archive_gdd_snapshot(gdd_root)
    return GddArchiveDecision(
        archive_rel=dest.relative_to(gdd_root).as_posix(),
        created_new=True,
    )


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


def _snapshot_total_size_bytes(snapshot_dir: Path) -> int:
    """Somme des tailles de tous les fichiers sous le snapshot (récursif)."""
    snapshot_dir = snapshot_dir.resolve()
    if not snapshot_dir.is_dir():
        return 0
    total = 0
    for p in snapshot_dir.rglob("*"):
        if not p.is_file():
            continue
        try:
            total += p.stat().st_size
        except OSError:
            continue
    return total


def _count_fiches_in_snapshot(snapshot_dir: Path) -> int:
    """Estime le nombre de fiches GDD dans un snapshot (shards + monolithes racine).

    - Chaque ``*.json`` sous un sous-dossier (ex. ``personnages/uuid.json``) compte pour une fiche.
    - Chaque ``*.json`` à la racine du snapshot : listes d'entités dans les clés connues du
      chargeur GDD, ou un seul enregistrement pour les catégories de type dict.

    Returns:
        Nombre estimé (0 si répertoire absent ou illisible).
    """
    from services.gdd_loader import GDDLoader

    snapshot_dir = snapshot_dir.resolve()
    if not snapshot_dir.is_dir():
        return 0
    list_keys = {
        cfg["key"]
        for cfg in GDDLoader.CATEGORIES_CONFIG.values()
        if cfg["type"] == list
    }
    dict_keys = {
        cfg["key"]
        for cfg in GDDLoader.CATEGORIES_CONFIG.values()
        if cfg["type"] == dict
    }
    total = 0
    for path in sorted(snapshot_dir.rglob("*.json")):
        rel = path.relative_to(snapshot_dir)
        parts = rel.parts
        if len(parts) >= 2:
            total += 1
            continue
        if len(parts) != 1:
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            continue
        if isinstance(raw, list):
            total += sum(1 for x in raw if isinstance(x, dict))
            continue
        if not isinstance(raw, dict):
            continue
        list_added = 0
        for k in list_keys:
            block = raw.get(k)
            if isinstance(block, list):
                list_added += sum(1 for x in block if isinstance(x, dict))
        if list_added:
            total += list_added
            continue
        for k in dict_keys:
            if k in raw:
                total += 1
                break
        else:
            if raw:
                total += 1
    return total


def list_gdd_archives(
    gdd_root: Path,
    *,
    limit: int,
    include_empty: bool = False,
) -> List[GddArchiveInfo]:
    """Liste les snapshots valides sous ``.archive/``, du plus récent au plus ancien.

    Si ``include_empty`` est faux (défaut, usage API / UI), les entrées avec
    ``fiche_count == 0`` sont ignorées : archives sans fiche GDD détectée.

    Si ``include_empty`` est vrai (sync, dédup de snapshot), tous les dossiers valides
    sont listés jusqu'à la limite.

    Args:
        gdd_root: Racine ``GDD_categories``.
        limit: Nombre maximum d'entrées (minimum 1).
        include_empty: Inclure les snapshots sans fiche (comparaison miroir / rétention).

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
    out: List[GddArchiveInfo] = []
    for name, dt in candidates:
        if include_empty and len(out) >= n:
            break
        snap = base / name
        size_b = 0
        fiches = 0
        if snap.is_dir():
            try:
                size_b = _snapshot_total_size_bytes(snap)
                fiches = _count_fiches_in_snapshot(snap)
            except OSError as exc:
                logger.warning("Stats snapshot GDD impossible (%s): %s", name, exc)
        if not include_empty and fiches == 0:
            continue
        out.append(
            GddArchiveInfo(
                id=name,
                created_at=dt,
                size_bytes=size_b,
                fiche_count=fiches,
            )
        )
        if include_empty:
            continue
        if len(out) >= n:
            break
    return out


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
        decision = archive_gdd_snapshot_if_delta(gdd)
        new_rel = decision.archive_rel
        if decision.created_new and retention_count is not None:
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


def resolve_gdd_live_path_for_category_file(gdd_root: Path, category_file: str) -> Path:
    """Chemin absolu live (fichier monolithe ou dossier shards) pour un ``category_file``."""
    raw = str(category_file or "").strip()
    root = gdd_root.resolve()
    sk = category_stem_to_list_category_key(Path(raw).stem)
    if sk:
        return (root / sk).resolve()
    return (root / raw).resolve()


def remove_excluded_database_sources_from_live(
    gdd_root: Path,
    sources: Iterable[Any],
    included_list: List[str],
) -> List[str]:
    """Supprime sous ``GDD_categories`` les cibles des bases ``database`` hors ``included_categories``.

    Sans effet si ``included_list`` est vide (périmètre = toutes les bases). Les sources
    ``page`` ne sont pas concernées. Utilisé après une sync complète miroir pour retirer
    du disque les JSON des bases décochées.

    Args:
        gdd_root: Racine ``GDD_categories``.
        sources: Liste ``settings['sources']``.
        included_list: Filtre non vide (sinon la fonction ne supprime rien).

    Returns:
        Chemins relatifs POSIX supprimés (pour journaux).
    """
    if not included_list or not any(str(x).strip() for x in included_list):
        return []
    removed_rel: List[str] = []
    gdd = gdd_root.resolve()
    for src in sources:
        if not isinstance(src, dict):
            continue
        kind = str(src.get("kind", "")).strip().lower()
        if kind != "database":
            continue
        cat_file = str(src.get("category_file", "")).strip()
        if not cat_file:
            continue
        if category_file_matches_included(cat_file, included_list):
            continue
        live = resolve_gdd_live_path_for_category_file(gdd, cat_file)
        if not str(live.resolve()).startswith(str(gdd)):
            continue
        if not live.exists():
            continue
        rel = live.relative_to(gdd).as_posix()
        try:
            if live.is_dir():
                shutil.rmtree(live)
            else:
                live.unlink()
            removed_rel.append(rel)
            logger.info("GDD live supprimé (base hors périmètre sync): %s", rel)
        except OSError as exc:
            logger.warning("Suppression live impossible %s: %s", live, exc)
    return removed_rel


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


def iter_blocking_partial_errors(partial: List[str]) -> List[str]:
    """Lignes de ``partial_errors`` qui bloquent la promotion miroir."""
    blocking: List[str] = []
    for line in partial:
        if ": fetch —" in line or ": fetch -" in line:
            blocking.append(line)
        elif ": écriture —" in line:
            blocking.append(line)
        elif " page " in line and "ignorée" not in line:
            blocking.append(line)
    return blocking


def is_transient_partial_error_line(line: str) -> bool:
    """Heuristique : erreur réseau / HTTP typiquement retentable côté Notion."""
    low = line.lower()
    markers = (
        "429",
        "500",
        "502",
        "503",
        "504",
        "bad gateway",
        "gateway timeout",
        "service unavailable",
        "too many requests",
        "timeout",
        "timed out",
        "connecterror",
        "connection reset",
        "connection aborted",
        "temporarily unavailable",
    )
    return any(m in low for m in markers)


def partial_errors_should_preserve_mirror_staging(partial: List[str]) -> bool:
    """True si le miroir est bloqué uniquement par des erreurs jugées transitoires.

    Dans ce cas on conserve ``.staging/`` et le checkpoint pour ``resume=true``.
    """
    if not partial_errors_block_mirror_promote(partial):
        return False
    blocking = iter_blocking_partial_errors(partial)
    if not blocking:
        return False
    return all(is_transient_partial_error_line(b) for b in blocking)


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
    *,
    allow_missing_staged: bool = False,
) -> None:
    """Pour chaque cible : supprime le live, déplace depuis le staging si présent.

    Args:
        gdd_root: Racine ``GDD_categories``.
        staging_run: Répertoire racine de ce run (contient ``personnages/``, ``*.json``, etc.).
        targets: Chemins absolus attendus sous ``gdd_root``.
        allow_missing_staged: Si True, une cible sans artefact dans le staging est ignorée
            (le fichier ou dossier live est conservé). Utile après une sync complète avec erreurs
            partielles lorsque l'utilisateur confirme l'application du miroir.

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
        if staged.exists():
            if live.exists():
                if live.is_dir():
                    shutil.rmtree(live)
                else:
                    live.unlink()
            live.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(staged), str(live))
        elif allow_missing_staged:
            logger.info(
                "Promotion miroir (reliquats): %s absent du staging — live inchangé.",
                rel,
            )
        else:
            if live.exists():
                if live.is_dir():
                    shutil.rmtree(live)
                else:
                    live.unlink()
    remove_staging_run_dir(staging_run)


def cleanup_staging_only(staging_run: Path) -> None:
    """Supprime un run staging sans toucher au live (échec sync miroir)."""
    remove_staging_run_dir(staging_run)

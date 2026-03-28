"""Orchestration synchronisation GDD depuis Notion (FR18)."""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Set, Tuple, Type

import httpx

from services.gdd_notion_atomic_io import read_json_file, write_json_atomic
from services.gdd_notion_manifest import (
    GddNotionManifest,
    filter_stale_page_ids,
    load_manifest,
    save_manifest,
)
from services.gdd_notion_sync_config_store import GddNotionSyncConfigStore
from services.gdd_notion_full_sync_checkpoint import (
    FullSyncCheckpointState,
    abandon_checkpoint_on_disk,
    checkpoint_json_path,
    checkpoint_paths,
    clear_checkpoint_files,
    compute_sources_fingerprint,
    list_staging_run_dirs,
    load_checkpoint_state,
    load_run_manifest,
    prune_staging_runs_keep_only,
    save_checkpoint,
    staging_run_path,
    validate_checkpoint_for_resume,
)
from services.gdd_notion_sync_log import log_sync_event
from services.gdd_notion_sync_mirror import (
    archive_gdd_snapshot_if_delta,
    cleanup_staging_only,
    collect_sync_targets,
    create_staging_run_dir,
    list_gdd_archives,
    partial_errors_block_mirror_promote,
    promote_staging_to_live,
    prune_archives,
    resolve_archive_dir,
    restore_gdd_from_archive,
)
from services.gdd_notion_sync_mapper import (
    database_id_is_compact_table_export,
    is_record_empty_for_sync,
    merge_records_by_nom,
    notion_page_to_compact_row_record,
    notion_page_to_gdd_record,
)
from services.gdd_notion_sync_retry import SyncBackoffPolicy, run_with_retries
from services.gdd_notion_sync_utils import (
    category_file_matches_included,
    category_stem_to_list_category_key,
    normalize_notion_id,
    redact_notion_token_from_text,
)
from services.notion_api_client import NotionAPIClient
from services.gdd_context_refresh import clear_gdd_runtime_caches

logger = logging.getLogger(__name__)


class GddNotionSyncUserCancelled(Exception):
    """Annulation utilisateur pendant une synchronisation (coopérative)."""


def _gdd_notion_sync_progress_inactive() -> Dict[str, Any]:
    """État par défaut : aucune sync en cours (réponse API stable)."""
    return {
        "active": False,
        "started_at": None,
        "force_full": None,
        "phase": "idle",
        "sources_total": 0,
        "sources_completed": 0,
        "current_source_index": 0,
        "current_category_file": "",
        "pages_total_known": 0,
        "pages_processed": 0,
        "pages_in_current_source": 0,
        "current_page_in_source": 0,
        "current_page_id_short": "",
        "message": "",
        "mirror_rebuild": None,
        "paused": False,
    }


# Erreurs attendues côté Notion / IO : pas de catch ``Exception`` fourre-tout.
_SYNC_RECOVERABLE: Tuple[Type[BaseException], ...] = (
    httpx.HTTPError,
    httpx.RequestError,
    json.JSONDecodeError,
    OSError,
    UnicodeDecodeError,
    ValueError,
    TypeError,
    KeyError,
)


def _is_transient_http_error(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TimeoutException):
        return True
    if isinstance(exc, httpx.ConnectError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 502, 503, 504)
    return False


@dataclass
class GddNotionSyncResult:
    """Résultat agrégé d'une passe de synchronisation."""

    success: bool
    message: str
    updated_entities: int = 0
    partial_errors: List[str] = field(default_factory=list)
    last_archive_relative: Optional[str] = None
    mirror_rebuild_used: bool = False


class GddNotionSyncService:
    """Service principal : config, manifeste, écriture atomique vers GDD_categories."""

    def __init__(
        self,
        config_store: GddNotionSyncConfigStore,
        manifest_path: Path,
        gdd_categories_path: Path,
        status_path: Path,
        client_factory: Optional[Callable[[str], NotionAPIClient]] = None,
    ) -> None:
        self._store = config_store
        self._manifest_path = manifest_path
        self._gdd_categories_path = gdd_categories_path
        self._status_path = status_path
        self._sync_checkpoint_dir = status_path.parent
        self._client_factory = client_factory or (lambda key: NotionAPIClient(api_key=key))
        self._run_lock = asyncio.Lock()
        self._sync_progress: Dict[str, Any] = _gdd_notion_sync_progress_inactive()
        self._sync_unpaused = asyncio.Event()
        self._sync_unpaused.set()
        self._sync_cancel_requested = False
        self._active_mirror_staging: Optional[Path] = None

    def is_auto_sync_enabled(self) -> bool:
        """True si la sync périodique est activée dans settings.json."""
        return bool(self._store.load_settings().get("auto_sync_enabled"))

    def poll_interval_seconds(self) -> int:
        """Intervalle entre deux réveils du planificateur (minimum 60 s)."""
        minutes = int(self._store.load_settings().get("sync_interval_minutes") or 60)
        return max(60, minutes * 60)

    def get_public_config_dict(self) -> Dict[str, Any]:
        """Vue configuration pour l'API (aucun secret)."""
        return self._store.public_settings_view()

    def update_config(
        self,
        *,
        sync_interval_minutes: Optional[int] = None,
        auto_sync_enabled: Optional[bool] = None,
        sources: Optional[List[Dict[str, Any]]] = None,
        included_categories: Optional[List[str]] = None,
        mirror_rebuild_on_full_sync: Optional[bool] = None,
        archive_retention_count: Optional[int] = None,
        notion_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Fusionne les champs fournis et persiste (valide sources si fournies)."""
        current = self._store.load_settings()
        if sync_interval_minutes is not None:
            current["sync_interval_minutes"] = int(sync_interval_minutes)
        if auto_sync_enabled is not None:
            current["auto_sync_enabled"] = bool(auto_sync_enabled)
        if sources is not None:
            self._store.validate_sources(sources)
            current["sources"] = list(sources)
        if included_categories is not None:
            current["included_categories"] = list(included_categories)
        if mirror_rebuild_on_full_sync is not None:
            current["mirror_rebuild_on_full_sync"] = bool(mirror_rebuild_on_full_sync)
        if archive_retention_count is not None:
            current["archive_retention_count"] = max(1, int(archive_retention_count))
        if notion_token is not None and notion_token.strip():
            self._store.write_token(notion_token.strip())
        self._store.save_settings(current)
        return self._store.public_settings_view()

    def _write_status(self, payload: Dict[str, Any]) -> None:
        self._status_path.parent.mkdir(parents=True, exist_ok=True)
        write_json_atomic(self._status_path, payload)

    def read_status(self) -> Dict[str, Any]:
        """Lit le dernier statut persisté (aucun secret)."""
        default: Dict[str, Any] = {
            "last_started_at": None,
            "last_finished_at": None,
            "last_success": None,
            "message": "",
            "updated_entities": 0,
            "partial_errors": [],
            "last_archive_relative": None,
            "last_mirror_rebuild_used": None,
        }
        data = read_json_file(self._status_path, default=default)
        return data if isinstance(data, dict) else default

    def read_sync_progress(self) -> Dict[str, Any]:
        """Lit la progression d'une sync en cours (polling UI).

        Returns:
            Dictionnaire sérialisable ; ``active`` False si aucune sync n'est en cours.
        """
        return dict(self._sync_progress)

    def _sync_progress_clear(self) -> None:
        """Réinitialise la progression (fin de sync ou avant un nouvel essai)."""
        self._sync_progress = _gdd_notion_sync_progress_inactive()

    def _sync_progress_update(self, **kwargs: Any) -> None:
        """Fusionne des champs dans l'état de progression (thread asyncio unique)."""
        self._sync_progress.update(kwargs)

    def reset_sync_control(self) -> None:
        """Réinitialise pause / annulation avant un nouveau run."""
        self._sync_cancel_requested = False
        self._sync_unpaused.set()

    async def _cooperative_sync_point(self) -> None:
        """Point de contrôle : annulation ou attente si pause."""
        if self._sync_cancel_requested:
            raise GddNotionSyncUserCancelled()
        await self._sync_unpaused.wait()

    def request_sync_pause(self) -> bool:
        """Met la sync en pause si une sync est active. Retourne False sinon."""
        if not bool(self._sync_progress.get("active")):
            return False
        self._sync_unpaused.clear()
        self._sync_progress_update(phase="paused", paused=True, message="En pause…")
        return True

    def request_sync_unpause(self) -> bool:
        """Reprend après pause si une sync est active."""
        if not bool(self._sync_progress.get("active")):
            return False
        self._sync_unpaused.set()
        self._sync_progress_update(
            phase="running",
            paused=False,
            message="Synchronisation en cours…",
        )
        return True

    def request_sync_cancel(self) -> bool:
        """Demande l'annulation coopérative (débloque aussi une pause)."""
        if not bool(self._sync_progress.get("active")):
            return False
        self._sync_cancel_requested = True
        self._sync_unpaused.set()
        return True

    def abandon_full_sync_checkpoint(self) -> Dict[str, Any]:
        """Supprime checkpoint + staging référencé (sans lancer de sync)."""
        abandon_checkpoint_on_disk(self._gdd_categories_path, self._sync_checkpoint_dir)
        return {"ok": True, "message": "Checkpoint et staging associé supprimés."}

    def describe_full_sync_checkpoint(self) -> Dict[str, Any]:
        """Vue UI : reprise possible ou raison du refus."""
        settings = self._store.load_settings()
        sources = settings.get("sources") or []
        included_list = [
            str(x).strip()
            for x in (settings.get("included_categories") or [])
            if isinstance(x, str) and str(x).strip()
        ]
        partial: List[str] = []
        eligible = self._collect_eligible_sources(
            sources, included_list, partial, request_id=None
        )
        eligible_cf = [e[2] for e in eligible]
        fp = compute_sources_fingerprint(sources, included_list)
        ck_file = checkpoint_json_path(self._sync_checkpoint_dir)
        ck_file_exists = ck_file.is_file()
        staging_dirs = list_staging_run_dirs(self._gdd_categories_path)
        orphan_staging_runs = len(staging_dirs)
        st = load_checkpoint_state(self._sync_checkpoint_dir)
        base: Dict[str, Any] = {
            "resumable": False,
            "checkpoint_status": "none",
            "checkpoint_file_present": ck_file_exists,
            "orphan_staging_runs": orphan_staging_runs,
            "message": "",
            "staging_run_name": st.staging_run_name if st else "",
            "archive_rel": st.archive_rel if st else "",
            "sources_total": len(eligible_cf),
            "sources_completed": len(st.completed_category_files) if st else 0,
            "completed_category_files": list(st.completed_category_files) if st else [],
            "eligible_category_files": eligible_cf,
        }
        if st is None:
            if ck_file_exists:
                base["checkpoint_status"] = "invalid_file"
                base["message"] = (
                    "Fichier checkpoint présent mais illisible ou incomplet. "
                    "Abandonnez le checkpoint ou lancez « Tout recommencer »."
                )
            else:
                base["checkpoint_status"] = "none"
                base["message"] = (
                    "Aucune sync complète à reprendre (pas encore démarrée, terminée, "
                    "ou annulée — l’annulation supprime le checkpoint)."
                )
                if orphan_staging_runs > 0:
                    base["message"] += (
                        f" {orphan_staging_runs} dossier(s) sous .staging/ seront "
                        "supprimés au prochain abandon ou au démarrage d’une nouvelle sync complète."
                    )
            return base
        ok, msg = validate_checkpoint_for_resume(
            self._gdd_categories_path,
            self._sync_checkpoint_dir,
            eligible_category_files=eligible_cf,
            sources_fingerprint=fp,
        )
        if not ok:
            base["checkpoint_status"] = "stale"
            base["message"] = msg
            return base
        base["resumable"] = True
        base["checkpoint_status"] = "resumable"
        base["message"] = "Reprise possible — utilisez le bouton Reprendre ou Sync complète ci-dessous."
        base["sources_completed"] = len(st.completed_category_files)
        return base

    @staticmethod
    def _append_entity_history(
        cat_file: str,
        shard_list_key: Optional[str],
        use_shards: bool,
        written_page_records: List[Tuple[str, Dict[str, Any]]],
    ) -> None:
        """Enregistre un snapshot par entité après écriture disque (Story 3.9)."""
        from core.context.context_builder import PROJECT_ROOT_DIR
        from services.gdd_entity_history import record_entity_change

        stem = (
            shard_list_key
            if use_shards and shard_list_key
            else Path(cat_file).stem
        )
        for _pid, rec_out in written_page_records:
            nom = str(rec_out.get("Nom") or "").strip() or "unknown"
            try:
                record_entity_change(
                    PROJECT_ROOT_DIR,
                    stem,
                    nom,
                    dict(rec_out),
                    source="notion_sync",
                )
            except OSError as exc:
                logger.warning(
                    "Historique entité GDD ignoré (%s / %s): %s",
                    stem,
                    nom,
                    exc,
                )

    @staticmethod
    def _collect_eligible_sources(
        sources: List[Any],
        included_list: List[str],
        partial_out: List[str],
        request_id: Optional[str],
    ) -> List[Tuple[Any, str, str]]:
        """Liste les sources à traiter (kind, notion_id, category_file)."""
        eligible: List[Tuple[Any, str, str]] = []
        for src in sources:
            if not isinstance(src, dict):
                continue
            kind = src.get("kind")
            nid = str(src.get("notion_id", "")).strip()
            cat_file = str(src.get("category_file", "")).strip()
            if not nid or not cat_file:
                partial_out.append("Source ignorée (notion_id ou category_file vide)")
                continue
            if not category_file_matches_included(cat_file, included_list):
                log_sync_event(
                    f"{cat_file} exclu du périmètre (included_categories)",
                    request_id=request_id,
                )
                continue
            eligible.append((kind, nid, cat_file))
        return eligible

    @staticmethod
    def _notion_id_short(page_id: Any) -> str:
        """Suffixe court d'un id Notion pour l'affichage progression (sans secrets)."""
        raw = str(page_id or "").replace("-", "").lower()
        if len(raw) >= 8:
            return raw[-8:]
        s = str(page_id or "").strip()
        return (s[:12] + "…") if len(s) > 12 else (s or "?")

    def list_gdd_archive_entries(self, *, limit: int = 20) -> List[Dict[str, str]]:
        """Liste les derniers snapshots locaux (``.archive/``), du plus récent au plus ancien.

        Args:
            limit: Nombre maximum d'entrées.

        Returns:
            Liste de dicts ``id``, ``created_at`` (ISO UTC).
        """
        infos = list_gdd_archives(self._gdd_categories_path, limit=limit)
        return [{"id": i.id, "created_at": i.created_at_iso} for i in infos]

    def restore_gdd_archive(
        self,
        archive_id: str,
        *,
        backup_current: bool = True,
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Restaure le périmètre GDD depuis un snapshot ``.archive/<id>``.

        Réinitialise le manifeste Notion (sync incrémentale repart de zéro côté entrées).

        Args:
            archive_id: Nom du dossier snapshot.
            backup_current: Archiver l'état courant avant d'écraser.
            request_id: Identifiant de requête pour les logs.

        Returns:
            Dict avec clés ``ok``, ``message``, ``new_backup_id`` (dossier créé si backup).

        Raises:
            ValueError: Identifiant invalide ou archive introuvable.
            OSError: Échec copie / promotion disque.
        """
        adir = resolve_archive_dir(self._gdd_categories_path, archive_id)
        settings = self._store.load_settings()
        retention = max(1, int(settings.get("archive_retention_count") or 10))
        new_rel = restore_gdd_from_archive(
            self._gdd_categories_path,
            adir,
            backup_current=backup_current,
            retention_count=retention if backup_current else None,
        )
        save_manifest(self._manifest_path, GddNotionManifest())
        clear_gdd_runtime_caches()
        log_sync_event(
            f"GDD restauré depuis archive {archive_id}",
            request_id=request_id,
        )
        new_backup_name: Optional[str] = None
        if new_rel:
            new_backup_name = Path(new_rel).name
        return {
            "ok": True,
            "message": (
                "Restauration effectuée. Manifeste Notion réinitialisé ; "
                "prochaine sync incrémentale rechargera selon Notion."
            ),
            "new_backup_id": new_backup_name,
        }

    async def test_connection(self, request_id: Optional[str] = None) -> Dict[str, Any]:
        """Vérifie le token via l'API Notion (users/me).

        Returns:
            dict avec ok, message, et métadonnées non sensibles si ok.
        """
        token = self._store.read_token()
        if not token:
            return {
                "ok": False,
                "message": "Token Notion absent : configurez notion_token.secret ou NOTION_API_KEY.",
            }
        try:
            client = self._client_factory(token)
            me = await client.verify_credentials()
            log_sync_event("Test connexion Notion réussi", request_id=request_id)
            return {
                "ok": True,
                "message": "Connexion Notion OK",
                "bot_id": me.get("id"),
                "bot_type": me.get("type"),
            }
        except _SYNC_RECOVERABLE as exc:
            msg = redact_notion_token_from_text(str(exc))
            logger.warning("Test connexion Notion échoué: %s", msg)
            return {"ok": False, "message": f"Échec connexion Notion — {msg}"}

    async def run_sync(
        self,
        *,
        force_full: bool = False,
        mirror_rebuild: bool = False,
        request_id: Optional[str] = None,
        resume: bool = False,
        fresh: bool = False,
    ) -> GddNotionSyncResult:
        """Exécute une synchronisation (manuelle ou planifiée)."""
        async with self._run_lock:
            return await self._run_sync_locked(
                force_full=force_full,
                mirror_rebuild=mirror_rebuild,
                request_id=request_id,
                resume=resume,
                fresh=fresh,
            )

    async def _run_sync_locked(
        self,
        *,
        force_full: bool,
        mirror_rebuild: bool,
        request_id: Optional[str],
        resume: bool,
        fresh: bool,
    ) -> GddNotionSyncResult:
        started = datetime.now(timezone.utc).isoformat()
        self._write_status(
            {
                "last_started_at": started,
                "last_finished_at": None,
                "last_success": None,
                "message": "Synchronisation en cours…",
                "updated_entities": 0,
                "partial_errors": [],
            }
        )
        token = self._store.read_token()
        if not token:
            res = GddNotionSyncResult(
                success=False,
                message="Sync Notion échouée — token non configuré",
            )
            self._finalize_status(started, res)
            self._sync_progress_clear()
            return res

        self.reset_sync_control()
        self._active_mirror_staging = None

        policy = SyncBackoffPolicy()

        async def _do() -> GddNotionSyncResult:
            return await self._sync_body(
                token,
                force_full=force_full,
                mirror_rebuild=mirror_rebuild,
                request_id=request_id,
                resume=resume,
                fresh=fresh,
            )

        result = GddNotionSyncResult(success=False, message="")
        try:
            result = await run_with_retries(
                _do,
                policy=policy,
                max_attempts=5,
                is_transient=_is_transient_http_error,
            )
        except GddNotionSyncUserCancelled:
            if self._active_mirror_staging is not None:
                cleanup_staging_only(self._active_mirror_staging)
                self._active_mirror_staging = None
            abandon_checkpoint_on_disk(
                self._gdd_categories_path, self._sync_checkpoint_dir
            )
            result = GddNotionSyncResult(
                success=False,
                message="Synchronisation annulée.",
            )
        except _SYNC_RECOVERABLE as exc:
            msg = redact_notion_token_from_text(str(exc))
            result = GddNotionSyncResult(
                success=False,
                message=f"Sync Notion échouée — {msg}",
            )
        except Exception as exc:
            logger.exception("Sync GDD Notion: erreur inattendue après retries")
            msg = redact_notion_token_from_text(str(exc))
            result = GddNotionSyncResult(
                success=False,
                message=f"Sync Notion échouée — {msg}",
            )
        finally:
            self._sync_progress_clear()
        self._finalize_status(started, result)
        return result

    def _finalize_status(self, started: str, result: GddNotionSyncResult) -> None:
        finished = datetime.now(timezone.utc).isoformat()
        self._write_status(
            {
                "last_started_at": started,
                "last_finished_at": finished,
                "last_success": result.success,
                "message": result.message,
                "updated_entities": result.updated_entities,
                "partial_errors": result.partial_errors[:50],
                "last_archive_relative": result.last_archive_relative,
                "last_mirror_rebuild_used": result.mirror_rebuild_used,
            }
        )

    async def _sync_body(
        self,
        token: str,
        *,
        force_full: bool,
        mirror_rebuild: bool,
        request_id: Optional[str],
        resume: bool = False,
        fresh: bool = False,
    ) -> GddNotionSyncResult:
        settings = self._store.load_settings()
        sources = settings.get("sources") or []
        if not sources:
            return GddNotionSyncResult(
                success=False,
                message="Aucune source Notion configurée (sources[] vide).",
            )

        included_list = [
            str(x).strip()
            for x in (settings.get("included_categories") or [])
            if isinstance(x, str) and str(x).strip()
        ]
        category_files_from_sources: List[str] = []
        for src in sources:
            if not isinstance(src, dict):
                continue
            cat_file = str(src.get("category_file", "")).strip()
            nid = str(src.get("notion_id", "")).strip()
            if nid and cat_file:
                category_files_from_sources.append(cat_file)
        if included_list and category_files_from_sources:
            if not any(
                category_file_matches_included(cf, included_list)
                for cf in category_files_from_sources
            ):
                return GddNotionSyncResult(
                    success=False,
                    message=(
                        "included_categories ne correspond à aucun category_file "
                        "des sources configurées."
                    ),
                )

        fingerprint = compute_sources_fingerprint(sources, included_list)
        partial: List[str] = []
        eligible = self._collect_eligible_sources(
            sources, included_list, partial, request_id
        )
        eligible_cf = [e[2] for e in eligible]

        mirror_ok = bool(force_full) and len(eligible) > 0
        want_resume = bool(resume) and mirror_ok
        want_fresh = bool(fresh) and mirror_ok
        if want_fresh:
            want_resume = False

        if mirror_rebuild:
            logger.debug(
                "Paramètre mirror_rebuild déprécié : ignoré (sync complète = miroir automatique)."
            )

        client = self._client_factory(token)
        updated = 0
        manifest: GddNotionManifest
        cp_state: Optional[FullSyncCheckpointState] = None
        out_root = self._gdd_categories_path
        staging_run: Optional[Path] = None
        archive_rel: Optional[str] = None
        sync_targets: Set[Path] = set()
        defer_manifest_persist = mirror_ok

        if mirror_ok:
            if want_fresh or not want_resume:
                abandon_checkpoint_on_disk(
                    self._gdd_categories_path, self._sync_checkpoint_dir
                )
            if want_resume:
                ok_resume, vmsg = validate_checkpoint_for_resume(
                    self._gdd_categories_path,
                    self._sync_checkpoint_dir,
                    eligible_category_files=eligible_cf,
                    sources_fingerprint=fingerprint,
                )
                if not ok_resume:
                    return GddNotionSyncResult(
                        success=False,
                        message=f"Reprise impossible — {vmsg}",
                        partial_errors=partial,
                    )
                st_chk = load_checkpoint_state(self._sync_checkpoint_dir)
                if st_chk is None:
                    return GddNotionSyncResult(
                        success=False,
                        message="Reprise impossible — checkpoint introuvable.",
                        partial_errors=partial,
                    )
                _, manifest_sidecar = checkpoint_paths(self._sync_checkpoint_dir)
                manifest = load_run_manifest(manifest_sidecar)
                staging_run = staging_run_path(
                    self._gdd_categories_path, st_chk.staging_run_name
                )
                if not staging_run.is_dir():
                    return GddNotionSyncResult(
                        success=False,
                        message="Reprise impossible — dossier staging introuvable.",
                        partial_errors=partial,
                    )
                prune_staging_runs_keep_only(
                    self._gdd_categories_path, st_chk.staging_run_name
                )
                self._active_mirror_staging = staging_run
                out_root = staging_run
                archive_rel = st_chk.archive_rel
                sync_targets = collect_sync_targets(
                    self._gdd_categories_path, eligible_cf
                )
                updated = st_chk.updated_entities
                cp_state = st_chk
                log_sync_event(
                    (
                        "Reprise sync complète "
                        f"({len(st_chk.completed_category_files)}/{len(eligible_cf)} sources)"
                    ),
                    request_id=request_id,
                )
            else:
                manifest = load_manifest(self._manifest_path)
                self._sync_progress_update(
                    phase="archiving",
                    message="Archivage de l'état GDD actuel…",
                )
                arch_decision = archive_gdd_snapshot_if_delta(self._gdd_categories_path)
                archive_rel = arch_decision.archive_rel
                retention = int(settings.get("archive_retention_count") or 10)
                if arch_decision.created_new:
                    prune_archives(self._gdd_categories_path, max(1, retention))
                staging_run = create_staging_run_dir(self._gdd_categories_path)
                self._active_mirror_staging = staging_run
                out_root = staging_run
                sync_targets = collect_sync_targets(
                    self._gdd_categories_path, eligible_cf
                )
                cp_state = FullSyncCheckpointState(
                    staging_run_name=staging_run.name,
                    archive_rel=archive_rel,
                    eligible_category_files=list(eligible_cf),
                    completed_category_files=[],
                    sources_fingerprint=fingerprint,
                    updated_entities=0,
                )
                save_checkpoint(self._sync_checkpoint_dir, cp_state, manifest)
        else:
            manifest = load_manifest(self._manifest_path)

        started_progress = datetime.now(timezone.utc).isoformat()
        self._sync_progress_update(
            active=True,
            started_at=started_progress,
            force_full=force_full,
            mirror_rebuild=mirror_ok,
            phase="running",
            sources_total=len(eligible),
            sources_completed=0,
            current_source_index=0,
            current_category_file="",
            pages_total_known=0,
            pages_processed=0,
            pages_in_current_source=0,
            current_page_in_source=0,
            current_page_id_short="",
            message="Synchronisation en cours…",
            paused=False,
        )

        pages_total_known = 0
        pages_processed_count = 0

        def _checkpoint_save_after_source(cat_done: str) -> None:
            if not mirror_ok or cp_state is None:
                return
            if (
                cat_done
                and cat_done not in cp_state.completed_category_files
            ):
                cp_state.completed_category_files.append(cat_done)
            cp_state.updated_entities = updated
            save_checkpoint(self._sync_checkpoint_dir, cp_state, manifest)

        completed_membership: Set[str] = set()
        if cp_state is not None:
            completed_membership = set(cp_state.completed_category_files)

        for i, (kind, nid, cat_file) in enumerate(eligible, start=1):
            await self._cooperative_sync_point()
            self._sync_progress_update(
                current_source_index=i,
                current_category_file=cat_file,
                sources_completed=i - 1,
                message=f"Source {i}/{len(eligible)} — {cat_file}",
            )
            if cat_file in completed_membership:
                log_sync_event(
                    f"Reprise: source déjà traitée — {cat_file}",
                    request_id=request_id,
                )
                self._sync_progress_update(sources_completed=i)
                continue
            try:
                pages = await self._fetch_pages(client, kind, nid)
            except _SYNC_RECOVERABLE as exc:
                partial.append(
                    f"{cat_file}: fetch — {redact_notion_token_from_text(str(exc))}"
                )
                self._sync_progress_update(sources_completed=i)
                continue

            await self._cooperative_sync_point()
            _, stale_pages = filter_stale_page_ids(
                list(pages), manifest, force_full=force_full
            )
            if not stale_pages:
                log_sync_event(
                    f"Rien à mettre à jour pour {cat_file} (manifest à jour)",
                    request_id=request_id,
                )
                self._sync_progress_update(sources_completed=i)
                _checkpoint_save_after_source(cat_file)
                continue

            pages_total_known += len(stale_pages)
            self._sync_progress_update(
                pages_total_known=pages_total_known,
                pages_in_current_source=len(stale_pages),
                current_page_in_source=0,
                current_page_id_short="",
                message=f"Pages — {cat_file} ({len(stale_pages)} à traiter)",
            )

            shard_list_key = category_stem_to_list_category_key(Path(cat_file).stem)
            use_shards = shard_list_key is not None
            out_path: Optional[Path] = None
            existing: List[Dict[str, Any]] = []
            if not use_shards:
                out_path = out_root / cat_file
                existing_raw = read_json_file(out_path, default=[])
                existing = (
                    existing_raw if isinstance(existing_raw, list) else []
                )

            try:
                norm_source_id = normalize_notion_id(nid)
            except ValueError:
                norm_source_id = ""
            compact_table = (
                kind == "database"
                and bool(norm_source_id)
                and database_id_is_compact_table_export(norm_source_id)
            )

            written_page_records: List[Tuple[str, Dict[str, Any]]] = []
            manifest_touched = False
            for page_num, p in enumerate(stale_pages, start=1):
                await self._cooperative_sync_point()
                pid = p.get("id")
                self._sync_progress_update(
                    current_page_in_source=page_num,
                    current_page_id_short=self._notion_id_short(pid),
                )
                try:
                    full_page = await client.get_page(pid)
                    if compact_table:
                        rec = notion_page_to_compact_row_record(full_page)
                    else:
                        body = await client.get_page_content(pid)
                        rec = notion_page_to_gdd_record(full_page, body)
                    edited = p.get("last_edited_time") or ""
                    if is_record_empty_for_sync(rec):
                        if edited:
                            manifest.set_edited(pid, edited)
                            manifest_touched = True
                        partial.append(
                            f"{cat_file} page {pid}: ignorée (corps et colonnes vides)"
                        )
                    else:
                        rec_out = dict(rec)
                        pid_str = str(pid or "").strip()
                        if pid_str:
                            try:
                                nid_norm = normalize_notion_id(pid_str)
                                rec_out["notion_page_id"] = nid_norm
                            except ValueError:
                                rec_out["notion_page_id"] = pid_str
                        written_page_records.append((pid_str, rec_out))
                        if edited:
                            manifest.set_edited(pid, edited)
                            manifest_touched = True
                        updated += 1
                except _SYNC_RECOVERABLE as exc:
                    partial.append(
                        f"{cat_file} page {pid}: {redact_notion_token_from_text(str(exc))}"
                    )
                finally:
                    pages_processed_count += 1
                    self._sync_progress_update(pages_processed=pages_processed_count)

            if manifest_touched and not defer_manifest_persist:
                save_manifest(self._manifest_path, manifest)
            if not written_page_records:
                self._sync_progress_update(sources_completed=i)
                _checkpoint_save_after_source(cat_file)
                continue

            try:
                if use_shards and shard_list_key is not None:
                    shard_dir = out_root / shard_list_key
                    shard_dir.mkdir(parents=True, exist_ok=True)
                    for pid_str, rec_out in written_page_records:
                        try:
                            nid_shard = normalize_notion_id(pid_str)
                            shard_name = f"{nid_shard}.json"
                        except ValueError:
                            safe = "".join(
                                c for c in pid_str if c.isalnum() or c in "-_"
                            )[:72] or "page"
                            shard_name = f"{safe}.json"
                        write_json_atomic(shard_dir / shard_name, rec_out)
                else:
                    if out_path is None:
                        partial.append(f"{cat_file}: écriture — chemin monolithe indéfini")
                        self._sync_progress_update(sources_completed=i)
                        continue
                    new_recs_only = [r for _pid, r in written_page_records]
                    merged = merge_records_by_nom(existing, new_recs_only)
                    write_json_atomic(out_path, merged)
                self._append_entity_history(
                    cat_file, shard_list_key, use_shards, written_page_records
                )
            except _SYNC_RECOVERABLE as exc:
                partial.append(f"{cat_file}: écriture — {exc}")
                self._sync_progress_update(sources_completed=i)
                continue

            if not defer_manifest_persist:
                save_manifest(self._manifest_path, manifest)
            log_sync_event(
                f"Écrit {cat_file}: {len(written_page_records)} entité(s) traitée(s)",
                request_id=request_id,
            )
            self._sync_progress_update(sources_completed=i)
            _checkpoint_save_after_source(cat_file)

        self._sync_progress_update(
            phase="finalizing",
            message="Finalisation (cache GDD, manifeste)…",
            sources_completed=len(eligible),
        )

        if mirror_ok and staging_run is not None:
            if partial_errors_block_mirror_promote(partial):
                cleanup_staging_only(staging_run)
                clear_checkpoint_files(self._sync_checkpoint_dir)
                msg = (
                    f"Miroir non appliqué : erreurs bloquantes ({len(partial)}). "
                    f"État GDD inchangé. Snapshot : {archive_rel or '?'}"
                )
                clear_gdd_runtime_caches()
                self._active_mirror_staging = None
                return GddNotionSyncResult(
                    success=False,
                    message=msg,
                    updated_entities=updated,
                    partial_errors=partial,
                    last_archive_relative=archive_rel,
                    mirror_rebuild_used=True,
                )
            self._sync_progress_update(
                phase="promoting",
                message="Promotion du miroir vers GDD_categories…",
            )
            if force_full:
                manifest.last_full_sync_at = datetime.now(timezone.utc).isoformat()
            save_manifest(self._manifest_path, manifest)
            promote_staging_to_live(
                self._gdd_categories_path, staging_run, sync_targets
            )
            clear_checkpoint_files(self._sync_checkpoint_dir)
            staging_run = None
            self._active_mirror_staging = None
        else:
            if force_full:
                manifest.last_full_sync_at = datetime.now(timezone.utc).isoformat()
                save_manifest(self._manifest_path, manifest)

        clear_gdd_runtime_caches()

        success = updated > 0 or not partial
        msg = (
            f"{updated} entité(s) mise(s) à jour"
            if updated
            else "Aucune mise à jour"
        )
        if partial:
            msg += f" — {len(partial)} avertissement(s)"
        if mirror_ok and success:
            msg += f" — miroir appliqué (archive : {archive_rel})"
        return GddNotionSyncResult(
            success=success,
            message=msg,
            updated_entities=updated,
            partial_errors=partial,
            last_archive_relative=archive_rel if mirror_ok else None,
            mirror_rebuild_used=mirror_ok,
        )

    async def _fetch_pages(
        self,
        client: NotionAPIClient,
        kind: str,
        notion_id: str,
    ) -> List[Mapping[str, Any]]:
        if kind == "page":
            page = await client.get_page(notion_id)
            return [page]
        return await client.query_database(notion_id)

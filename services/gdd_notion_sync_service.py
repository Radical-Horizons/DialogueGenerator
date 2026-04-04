"""Orchestration synchronisation GDD depuis Notion (FR18)."""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import (
    Any,
    Awaitable,
    Callable,
    Dict,
    List,
    Mapping,
    Optional,
    Set,
    Tuple,
    Type,
    TypeVar,
)

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
    partial_errors_should_preserve_mirror_staging,
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
    notion_page_to_gdd_record_merge_body_and_properties,
)
from services.gdd_notion_sync_retry import (
    SyncBackoffPolicy,
    is_transient_notion_http_error,
    run_with_retries,
)
from services.gdd_notion_sync_utils import (
    agent_debug_log_d9fa38,
    category_file_matches_included,
    category_stem_to_list_category_key,
    normalize_notion_id,
    redact_notion_token_from_text,
)
from services.notion_api_client import NotionAPIClient
from services.gdd_context_refresh import clear_gdd_runtime_caches

logger = logging.getLogger(__name__)

_TNotionRead = TypeVar("_TNotionRead")


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


def _format_partial_error_detail(exc: BaseException) -> str:
    """Détail d'erreur pour ``partial_errors`` (code HTTP explicite si applicable)."""
    base = redact_notion_token_from_text(str(exc))
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code} — {base}"
    return base


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
        *,
        after_gdd_disk_mutation: Optional[Callable[[], None]] = None,
    ) -> None:
        self._store = config_store
        self._manifest_path = manifest_path
        self._gdd_categories_path = gdd_categories_path
        self._status_path = status_path
        self._sync_checkpoint_dir = status_path.parent
        self._client_factory = client_factory or (lambda key: NotionAPIClient(api_key=key))
        self._after_gdd_disk_mutation = after_gdd_disk_mutation
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

    def _clear_gdd_file_cache_and_notify_context(self) -> None:
        """Vide le cache fichier GDD puis recharge le ContextBuilder si hook configuré (Story 3.9)."""
        clear_gdd_runtime_caches()
        hook = self._after_gdd_disk_mutation
        if hook is None:
            return
        try:
            hook()
        except Exception as exc:
            logger.warning(
                "after_gdd_disk_mutation a échoué (fichiers GDD déjà à jour sur disque): %s",
                exc,
                exc_info=True,
            )

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
    def _data_source_ids_from_settings_source(
        src: Mapping[str, Any],
    ) -> Optional[List[str]]:
        """Liste optionnelle d’UUID data source Notion (forcer la vue interrogée)."""
        raw = src.get("notion_data_source_ids")
        if not isinstance(raw, list) or not raw:
            return None
        out: List[str] = []
        for x in raw:
            if isinstance(x, str) and x.strip():
                out.append(x.strip())
        return out or None

    @staticmethod
    def _collect_eligible_sources(
        sources: List[Any],
        included_list: List[str],
        partial_out: List[str],
        request_id: Optional[str],
    ) -> List[Tuple[Any, str, str, Optional[List[str]]]]:
        """Liste les sources à traiter (kind, notion_id, category_file, data_source_ids).

        Si ``included_categories`` est vide : toutes les bases et toutes les fiches
        (``page``). Sinon : **uniquement** les bases qui matchent le filtre — les
        fiches sont ignorées sur ce run (sync ciblée rapide, sans parcourir toutes
        les pages du hub).
        """
        eligible: List[Tuple[Any, str, str, Optional[List[str]]]] = []
        restrict_to_databases_only = bool(included_list)
        for src in sources:
            if not isinstance(src, dict):
                continue
            kind = src.get("kind")
            nid = str(src.get("notion_id", "")).strip()
            cat_file = str(src.get("category_file", "")).strip()
            ds_ids = GddNotionSyncService._data_source_ids_from_settings_source(
                src
            )
            if not nid or not cat_file:
                partial_out.append("Source ignorée (notion_id ou category_file vide)")
                continue
            kind_str = str(kind or "").strip().lower()
            if kind_str == "page":
                if restrict_to_databases_only:
                    log_sync_event(
                        f"{cat_file} ignoré (périmètre restreint aux bases listées)",
                        request_id=request_id,
                    )
                    continue
                eligible.append((kind, nid, cat_file, None))
                continue
            if not category_file_matches_included(cat_file, included_list):
                log_sync_event(
                    f"{cat_file} exclu du périmètre (included_categories)",
                    request_id=request_id,
                )
                continue
            eligible.append((kind, nid, cat_file, ds_ids))
        return eligible

    @staticmethod
    def _notion_id_short(page_id: Any) -> str:
        """Suffixe court d'un id Notion pour l'affichage progression (sans secrets)."""
        raw = str(page_id or "").replace("-", "").lower()
        if len(raw) >= 8:
            return raw[-8:]
        s = str(page_id or "").strip()
        return (s[:12] + "…") if len(s) > 12 else (s or "?")

    def list_gdd_archive_entries(self, *, limit: int = 20) -> List[Dict[str, Any]]:
        """Liste les derniers snapshots locaux (``.archive/``), du plus récent au plus ancien.

        Args:
            limit: Nombre maximum d'entrées.

        Returns:
            Liste de dicts ``id``, ``created_at`` (ISO UTC), ``size_bytes``, ``fiche_count``.
        """
        infos = list_gdd_archives(self._gdd_categories_path, limit=limit)
        return [
            {
                "id": i.id,
                "created_at": i.created_at_iso,
                "size_bytes": i.size_bytes,
                "fiche_count": i.fiche_count,
            }
            for i in infos
        ]

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
        self._clear_gdd_file_cache_and_notify_context()
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

    async def preview_database_first_row(
        self,
        *,
        category_file: str,
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Récupère la première ligne d’une base Notion (même pipeline que la sync) pour diagnostic UI.

        Args:
            category_file: ``category_file`` de la source ``kind=database`` dans settings.
            request_id: Identifiant de requête pour logs.

        Returns:
            Dict sérialisable (ok, métadonnées base, enregistrement mappé ou message d’erreur).
        """
        cat = str(category_file or "").strip()
        if not cat:
            return {"ok": False, "message": "category_file requis"}
        settings = self._store.load_settings()
        sources = settings.get("sources") or []
        src: Optional[Dict[str, Any]] = None
        for s in sources:
            if not isinstance(s, dict):
                continue
            if str(s.get("kind", "")).lower() != "database":
                continue
            if str(s.get("category_file", "")).strip() == cat:
                src = s
                break
        if src is None:
            return {
                "ok": False,
                "message": f"Aucune source database avec category_file={cat!r}",
            }
        nid = str(src.get("notion_id", "")).strip()
        if not nid:
            return {"ok": False, "message": "notion_id manquant pour cette source"}
        token = self._store.read_token()
        if not token:
            return {
                "ok": False,
                "message": "Token Notion absent : configurez le token avant le test.",
            }
        ds_ids = GddNotionSyncService._data_source_ids_from_settings_source(src)
        client = self._client_factory(token)
        db_meta = await client._retrieve_database_for_data_sources(nid)
        data_sources_count = 0
        data_source_entries: List[Dict[str, str]] = []
        if isinstance(db_meta, dict):
            raw_ds = db_meta.get("data_sources")
            if isinstance(raw_ds, list):
                data_sources_count = len(raw_ds)
                for item in raw_ds:
                    if isinstance(item, Mapping):
                        iid = str(item.get("id") or "").strip()
                        name = str(item.get("name") or "").strip()
                        if iid:
                            data_source_entries.append({"id": iid, "name": name})
        try:
            pages = await client.query_database(nid, data_source_ids=ds_ids)
        except Exception as exc:
            detail = redact_notion_token_from_text(str(exc))
            log_sync_event(
                f"preview-database-row échec query {cat}: {detail[:500]}",
                request_id=request_id,
            )
            return {
                "ok": False,
                "message": f"Échec requête Notion (liste des lignes) — {detail}",
                "category_file": cat,
                "notion_database_id": nid,
                "data_sources_count": data_sources_count,
                "data_source_entries": data_source_entries,
            }
        if not pages:
            return {
                "ok": True,
                "message": "Base accessible mais 0 ligne retournée par Notion.",
                "category_file": cat,
                "notion_database_id": nid,
                "data_sources_count": data_sources_count,
                "data_source_entries": data_source_entries,
                "query_total_rows": 0,
                "first_page_id": "",
                "property_keys_from_query_row": [],
                "property_keys_from_get_page": [],
                "mapped_record": None,
                "compact_table": False,
            }
        p0 = pages[0]
        pid = p0.get("id") if isinstance(p0, dict) else None
        if not pid:
            return {
                "ok": False,
                "message": "Première entrée sans id de page",
                "category_file": cat,
                "notion_database_id": nid,
            }
        try:
            norm_source_id = normalize_notion_id(nid)
        except ValueError:
            norm_source_id = ""
        compact_table = bool(norm_source_id) and database_id_is_compact_table_export(
            norm_source_id
        )
        pq = p0.get("properties") if isinstance(p0, dict) else {}
        q_keys = sorted(pq.keys()) if isinstance(pq, dict) else []
        full_page = await client.get_page(str(pid))
        pf = full_page.get("properties") if isinstance(full_page, dict) else {}
        gp_keys = sorted(pf.keys()) if isinstance(pf, dict) else []
        if compact_table:
            rec = notion_page_to_compact_row_record(full_page)
        else:
            body = await client.get_page_content(str(pid))
            rec = notion_page_to_gdd_record_merge_body_and_properties(full_page, body)
        return {
            "ok": True,
            "message": "OK — première ligne mappée comme en sync.",
            "category_file": cat,
            "notion_database_id": nid,
            "data_sources_count": data_sources_count,
            "data_source_entries": data_source_entries,
            "query_total_rows": len(pages),
            "first_page_id": str(pid),
            "property_keys_from_query_row": q_keys,
            "property_keys_from_get_page": gp_keys,
            "mapped_record": rec,
            "compact_table": compact_table,
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
                retry_policy=policy,
                resume=resume,
                fresh=fresh,
            )

        result = GddNotionSyncResult(success=False, message="")
        try:
            result = await run_with_retries(
                _do,
                policy=policy,
                max_attempts=5,
                is_transient=is_transient_notion_http_error,
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

    async def _notion_read_with_retries(
        self,
        op: Callable[[], Awaitable[_TNotionRead]],
        *,
        retry_policy: SyncBackoffPolicy,
        max_attempts: int = 5,
    ) -> _TNotionRead:
        """Lecture Notion (page / liste pages / corps) avec backoff sur erreurs transitoires."""
        return await run_with_retries(
            op,
            policy=retry_policy,
            max_attempts=max_attempts,
            is_transient=is_transient_notion_http_error,
        )

    async def _sync_body(
        self,
        token: str,
        *,
        force_full: bool,
        mirror_rebuild: bool,
        request_id: Optional[str],
        retry_policy: SyncBackoffPolicy,
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
        database_category_files: List[str] = []
        for src in sources:
            if not isinstance(src, dict):
                continue
            cat_file = str(src.get("category_file", "")).strip()
            nid = str(src.get("notion_id", "")).strip()
            kind_str = str(src.get("kind", "")).strip().lower()
            if nid and cat_file and kind_str == "database":
                database_category_files.append(cat_file)
        if included_list and database_category_files:
            if not any(
                category_file_matches_included(cf, included_list)
                for cf in database_category_files
            ):
                return GddNotionSyncResult(
                    success=False,
                    message=(
                        "included_categories ne correspond à aucune base (database) "
                        "parmi les sources configurées."
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

        for i, (kind, nid, cat_file, ds_ids) in enumerate(eligible, start=1):
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

                async def _load_pages() -> List[Mapping[str, Any]]:
                    return await self._fetch_pages(client, kind, nid, ds_ids)

                pages = await self._notion_read_with_retries(
                    _load_pages, retry_policy=retry_policy
                )
                # region agent log
                if str(kind).lower() == "database":
                    agent_debug_log_d9fa38(
                        "E",
                        "gdd_notion_sync_service.run_sync",
                        "pages fetched for database source",
                        {
                            "category_file": cat_file,
                            "notion_id_prefix": (str(nid).replace("-", "")[:8]),
                            "pages_count": len(pages),
                        },
                    )
                # endregion agent log
            except _SYNC_RECOVERABLE as exc:
                partial.append(f"{cat_file}: fetch — {_format_partial_error_detail(exc)}")
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

                    async def _read_meta() -> Dict[str, Any]:
                        return await client.get_page(pid)

                    full_page = await self._notion_read_with_retries(
                        _read_meta, retry_policy=retry_policy
                    )
                    # region agent log
                    if (
                        str(kind).lower() == "database"
                        and page_num == 1
                        and isinstance(p, dict)
                        and isinstance(full_page, dict)
                    ):
                        pq = p.get("properties")
                        pf = full_page.get("properties")
                        agent_debug_log_d9fa38(
                            "C",
                            "gdd_notion_sync_service.run_sync",
                            "first database row property key counts",
                            {
                                "category_file": cat_file,
                                "query_properties_keys": (
                                    len(pq) if isinstance(pq, dict) else -1
                                ),
                                "get_page_properties_keys": (
                                    len(pf) if isinstance(pf, dict) else -1
                                ),
                                "compact_table": compact_table,
                            },
                        )
                    # endregion agent log
                    if compact_table:
                        rec = notion_page_to_compact_row_record(full_page)
                    else:

                        async def _read_body() -> str:
                            return await client.get_page_content(pid)

                        body = await self._notion_read_with_retries(
                            _read_body, retry_policy=retry_policy
                        )
                        rec = notion_page_to_gdd_record_merge_body_and_properties(
                            full_page, body
                        )
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
                        f"{cat_file} page {pid}: {_format_partial_error_detail(exc)}"
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
                partial.append(f"{cat_file}: écriture — {_format_partial_error_detail(exc)}")
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
                preserve = partial_errors_should_preserve_mirror_staging(partial)
                if preserve and cp_state is not None:
                    save_checkpoint(
                        self._sync_checkpoint_dir, cp_state, manifest
                    )
                    log_sync_event(
                        "Miroir non promu (erreurs transitoires) — "
                        "staging et checkpoint conservés pour reprise.",
                        request_id=request_id,
                    )
                    msg = (
                        f"Miroir non appliqué : erreurs bloquantes ({len(partial)}). "
                        f"État GDD inchangé. Snapshot : {archive_rel or '?'}. "
                        "Reprise possible — relancez une sync complète avec Reprendre."
                    )
                    self._clear_gdd_file_cache_and_notify_context()
                    self._active_mirror_staging = None
                    return GddNotionSyncResult(
                        success=False,
                        message=msg,
                        updated_entities=updated,
                        partial_errors=partial,
                        last_archive_relative=archive_rel,
                        mirror_rebuild_used=True,
                    )
                cleanup_staging_only(staging_run)
                clear_checkpoint_files(self._sync_checkpoint_dir)
                msg = (
                    f"Miroir non appliqué : erreurs bloquantes ({len(partial)}). "
                    f"État GDD inchangé. Snapshot : {archive_rel or '?'}"
                )
                self._clear_gdd_file_cache_and_notify_context()
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

        self._clear_gdd_file_cache_and_notify_context()

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
        data_source_ids: Optional[List[str]] = None,
    ) -> List[Mapping[str, Any]]:
        if kind == "page":
            page = await client.get_page(notion_id)
            return [page]
        return await client.query_database(
            notion_id, data_source_ids=data_source_ids
        )

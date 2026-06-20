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
    promote_staging_to_live,
    prune_archives,
    remove_excluded_database_sources_from_live,
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

# Lignes (ordre retour API ``query_database``) pour détecter une base sans corps de page.
NOTION_DATABASE_BODY_PROBE_ROW_COUNT = 3


def _notion_api_error_message_for_partial_errors(response: httpx.Response) -> str:
    """Extrait ``message`` (et éventuellement ``code``) du corps JSON d'erreur Notion.

    Args:
        response: Réponse HTTP Notion (4xx typiquement).

    Returns:
        Chaîne courte pour affichage opérateur, ou vide si parsing impossible.
    """
    try:
        data = response.json()
    except (ValueError, TypeError):
        return ""
    if not isinstance(data, dict) or data.get("object") != "error":
        return ""
    msg = data.get("message")
    code = data.get("code")
    parts: List[str] = []
    if isinstance(code, str) and code.strip():
        parts.append(code.strip())
    if isinstance(msg, str) and msg.strip():
        parts.append(msg.strip())
    if not parts:
        return ""
    return redact_notion_token_from_text(" — ".join(parts))


def _format_partial_error_detail(exc: BaseException) -> str:
    """Détail d'erreur pour ``partial_errors`` (code HTTP explicite si applicable)."""
    base = redact_notion_token_from_text(str(exc))
    if isinstance(exc, httpx.HTTPStatusError):
        notion_detail = _notion_api_error_message_for_partial_errors(exc.response)
        if notion_detail:
            return (
                f"HTTP {exc.response.status_code} — Notion API: {notion_detail} — {base}"
            )
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
    #: True si le staging complet est prêt mais la promotion a été reportée (erreurs partielles).
    mirror_promotion_pending: bool = False


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
            "mirror_promotion_pending": False,
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
            "mirror_promotion_pending": bool(st.mirror_promotion_pending) if st else False,
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
        if st.mirror_promotion_pending:
            base["message"] = (
                "Promotion miroir en attente (erreurs partielles sur le dernier run). "
                "Appliquez le staging confirmé, reprenez pour retenter Notion, ou abandonnez."
            )
        else:
            base["message"] = (
                "Reprise possible — utilisez le bouton Reprendre ou Sync complète ci-dessous."
            )
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
            try:
                from services.gdd_context_precompile import (
                    get_or_create_precompile_context_builder,
                    precompile_entity,
                )

                cb = get_or_create_precompile_context_builder()
                precompile_entity(cb, category_stem=stem, record=dict(rec_out))
            except Exception as exc:
                logger.warning(
                    "Précompilation contexte ignorée (%s / %s): %s",
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
        *,
        scope_category_files: Optional[Set[str]] = None,
    ) -> List[Tuple[Any, str, str, Optional[List[str]]]]:
        """Liste les sources à traiter (kind, notion_id, category_file, data_source_ids).

        Si ``included_categories`` est vide : toutes les bases et toutes les fiches
        (``page``). Sinon : **uniquement** les bases qui matchent le filtre — les
        fiches sont ignorées sur ce run (sync ciblée rapide, sans parcourir toutes
        les pages du hub).

        Si ``scope_category_files`` est fourni (noms exacts ``category_file``) :
        uniquement ces bases pour **ce run** ; les fiches ``page`` sont ignorées.
        """
        eligible: List[Tuple[Any, str, str, Optional[List[str]]]] = []
        restrict_to_databases_only = bool(included_list) or bool(scope_category_files)
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
                    reason = (
                        "sync ciblée (category_file=…)"
                        if scope_category_files
                        else "périmètre restreint aux bases listées"
                    )
                    log_sync_event(
                        f"{cat_file} ignoré ({reason})",
                        request_id=request_id,
                    )
                    continue
                eligible.append((kind, nid, cat_file, None))
                continue
            if scope_category_files is not None:
                if cat_file not in scope_category_files:
                    continue
            elif not category_file_matches_included(cat_file, included_list):
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

    async def sync_entity_by_name(
        self,
        *,
        name: str,
        category_file: str = "Personnages.json",
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Synchronise une seule entité GDD depuis Notion (résolution fuzzy du nom)."""
        async with self._run_lock:
            return await self._sync_entity_by_name_locked(
                name=name,
                category_file=category_file,
                request_id=request_id,
            )

    async def _sync_entity_by_name_locked(
        self,
        *,
        name: str,
        category_file: str,
        request_id: Optional[str],
    ) -> Dict[str, Any]:
        from services.gdd_notion_entity_sync import resolve_entity_page

        query = (name or "").strip()
        cat_file = (category_file or "").strip()
        if not query:
            return {
                "success": False,
                "message": "Le paramètre name est requis.",
                "query_name": query,
                "resolved_name": None,
                "notion_page_id": None,
                "gdd_relative_path": None,
                "last_edited_time": None,
            }
        if not cat_file:
            return {
                "success": False,
                "message": "Le paramètre category_file est requis.",
                "query_name": query,
                "resolved_name": None,
                "notion_page_id": None,
                "gdd_relative_path": None,
                "last_edited_time": None,
            }

        token = self._store.read_token()
        if not token:
            return {
                "success": False,
                "message": "Token Notion absent : configurez notion_token.secret ou NOTION_API_KEY.",
                "query_name": query,
                "resolved_name": None,
                "notion_page_id": None,
                "gdd_relative_path": None,
                "last_edited_time": None,
            }

        settings = self._store.load_settings()
        sources = settings.get("sources") or []
        source: Optional[Dict[str, Any]] = None
        for src in sources:
            if not isinstance(src, dict):
                continue
            if str(src.get("category_file", "")).strip() != cat_file:
                continue
            if str(src.get("kind", "")).strip().lower() != "database":
                continue
            source = src
            break
        if source is None:
            return {
                "success": False,
                "message": f"Aucune source Notion database pour category_file={cat_file!r}.",
                "query_name": query,
                "resolved_name": None,
                "notion_page_id": None,
                "gdd_relative_path": None,
                "last_edited_time": None,
            }

        resolution = resolve_entity_page(
            self._gdd_categories_path,
            cat_file,
            query,
        )
        client = self._client_factory(token)
        retry_policy = SyncBackoffPolicy()
        notion_id = str(source.get("notion_id", "")).strip()
        ds_ids = self._data_source_ids_from_settings_source(source)

        if not resolution.notion_page_id:
            try:

                async def _load_pages() -> List[Mapping[str, Any]]:
                    return await self._fetch_pages(client, "database", notion_id, ds_ids)

                pages = await self._notion_read_with_retries(
                    _load_pages, retry_policy=retry_policy
                )
            except _SYNC_RECOVERABLE as exc:
                msg = redact_notion_token_from_text(str(exc))
                return {
                    "success": False,
                    "message": f"Impossible de lister Notion pour {cat_file}: {msg}",
                    "query_name": query,
                    "resolved_name": resolution.resolved_name,
                    "notion_page_id": None,
                    "gdd_relative_path": None,
                    "last_edited_time": None,
                }
            resolution = resolve_entity_page(
                self._gdd_categories_path,
                cat_file,
                query,
                notion_pages=list(pages),
            )

        if not resolution.notion_page_id:
            return {
                "success": False,
                "message": f"Aucune fiche trouvée pour {query!r} dans {cat_file}.",
                "query_name": query,
                "resolved_name": resolution.resolved_name,
                "notion_page_id": None,
                "gdd_relative_path": None,
                "last_edited_time": None,
            }

        page_id = resolution.notion_page_id
        full_page: Dict[str, Any]
        rec_out: Dict[str, Any]
        try:

            async def _read_meta() -> Dict[str, Any]:
                return await client.get_page(page_id)

            full_page = await self._notion_read_with_retries(
                _read_meta, retry_policy=retry_policy
            )
            try:
                norm_source_id = normalize_notion_id(notion_id)
            except ValueError:
                norm_source_id = ""
            compact_table = database_id_is_compact_table_export(norm_source_id)
            if compact_table:
                rec_out = notion_page_to_compact_row_record(full_page)
            else:

                async def _read_body() -> str:
                    return await client.get_page_content(page_id)

                body = await self._notion_read_with_retries(
                    _read_body, retry_policy=retry_policy
                )
                rec_out = notion_page_to_gdd_record_merge_body_and_properties(
                    full_page, body
                )
            pid_str = str(page_id or "").strip()
            if pid_str:
                try:
                    rec_out["notion_page_id"] = normalize_notion_id(pid_str)
                except ValueError:
                    rec_out["notion_page_id"] = pid_str
        except _SYNC_RECOVERABLE as exc:
            msg = redact_notion_token_from_text(str(exc))
            return {
                "success": False,
                "message": f"Échec lecture Notion pour {page_id}: {msg}",
                "query_name": query,
                "resolved_name": resolution.resolved_name,
                "notion_page_id": page_id,
                "gdd_relative_path": resolution.gdd_relative_path,
                "last_edited_time": None,
            }

        if is_record_empty_for_sync(rec_out):
            return {
                "success": False,
                "message": "Fiche Notion vide (corps et colonnes absents).",
                "query_name": query,
                "resolved_name": str(rec_out.get("Nom") or resolution.resolved_name),
                "notion_page_id": page_id,
                "gdd_relative_path": resolution.gdd_relative_path,
                "last_edited_time": full_page.get("last_edited_time"),
            }

        shard_list_key = category_stem_to_list_category_key(Path(cat_file).stem)
        use_shards = shard_list_key is not None
        out_root = self._gdd_categories_path
        gdd_rel = resolution.gdd_relative_path
        pid_str = str(page_id or "").strip()
        try:
            if use_shards and shard_list_key is not None:
                shard_dir = out_root / shard_list_key
                shard_dir.mkdir(parents=True, exist_ok=True)
                try:
                    nid_shard = normalize_notion_id(pid_str)
                    shard_name = f"{nid_shard}.json"
                except ValueError:
                    safe = "".join(c for c in pid_str if c.isalnum() or c in "-_")[:72] or "page"
                    shard_name = f"{safe}.json"
                shard_path = shard_dir / shard_name
                write_json_atomic(shard_path, rec_out)
                gdd_rel = f"{shard_list_key}/{shard_name}"
            else:
                out_path = out_root / cat_file
                existing_raw = read_json_file(out_path, default=[])
                existing = existing_raw if isinstance(existing_raw, list) else []
                merged = merge_records_by_nom(existing, [rec_out])
                write_json_atomic(out_path, merged)
                gdd_rel = cat_file
        except _SYNC_RECOVERABLE as exc:
            msg = redact_notion_token_from_text(str(exc))
            return {
                "success": False,
                "message": f"Échec écriture disque: {msg}",
                "query_name": query,
                "resolved_name": str(rec_out.get("Nom") or resolution.resolved_name),
                "notion_page_id": page_id,
                "gdd_relative_path": gdd_rel,
                "last_edited_time": full_page.get("last_edited_time"),
            }

        manifest = load_manifest(self._manifest_path)
        edited = str(full_page.get("last_edited_time") or "")
        if edited:
            manifest.set_edited(page_id, edited)
            save_manifest(self._manifest_path, manifest)

        self._append_entity_history(
            cat_file,
            shard_list_key,
            use_shards,
            [(pid_str, rec_out)],
        )
        self._clear_gdd_file_cache_and_notify_context()
        canonical = str(rec_out.get("Nom") or resolution.resolved_name or query)
        log_sync_event(
            f"Sync entité {cat_file}: {canonical} ({page_id})",
            request_id=request_id,
        )
        return {
            "success": True,
            "message": f"{canonical} synchronisé depuis Notion.",
            "query_name": query,
            "resolved_name": canonical,
            "notion_page_id": page_id,
            "gdd_relative_path": gdd_rel,
            "last_edited_time": full_page.get("last_edited_time"),
        }

    async def run_sync(
        self,
        *,
        force_full: bool = False,
        mirror_rebuild: bool = False,
        request_id: Optional[str] = None,
        resume: bool = False,
        fresh: bool = False,
        run_scope_category_files: Optional[Tuple[str, ...]] = None,
        apply_staging_despite_errors: bool = False,
    ) -> GddNotionSyncResult:
        """Exécute une synchronisation (manuelle ou planifiée)."""
        async with self._run_lock:
            return await self._run_sync_locked(
                force_full=force_full,
                mirror_rebuild=mirror_rebuild,
                request_id=request_id,
                resume=resume,
                fresh=fresh,
                run_scope_category_files=run_scope_category_files,
                apply_staging_despite_errors=apply_staging_despite_errors,
            )

    async def _run_sync_locked(
        self,
        *,
        force_full: bool,
        mirror_rebuild: bool,
        request_id: Optional[str],
        resume: bool,
        fresh: bool,
        run_scope_category_files: Optional[Tuple[str, ...]] = None,
        apply_staging_despite_errors: bool = False,
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
                "mirror_promotion_pending": False,
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
                run_scope_category_files=run_scope_category_files,
                apply_staging_despite_errors=apply_staging_despite_errors,
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
                "mirror_promotion_pending": result.mirror_promotion_pending,
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

    async def _probe_database_body_sample(
        self,
        client: NotionAPIClient,
        pages: List[Mapping[str, Any]],
        *,
        category_file: str,
        retry_policy: SyncBackoffPolicy,
        request_id: Optional[str],
    ) -> Tuple[Dict[str, str], bool]:
        """Échantillonne les premières lignes d'une base pour détecter l'absence de corps de page.

        Les ``n`` premières lignes sont lues une fois et mises en cache (souvent vides pour
        des stubs). Si l'échantillon est entièrement vide, un événement de log est émis ;
        les lignes dont l'identifiant n'est **pas** dans le cache sont quand même lues via
        ``get_page_content`` (les lignes suivantes peuvent avoir un corps non vide).

        Returns:
            Tuple ``(cache page_id -> corps déjà lu, probed_sample_all_empty)``.

            ``probed_sample_all_empty`` signale que les ``n`` premières lignes n'ont aucun
            corps : utile pour les logs uniquement. **Ne doit pas** empêcher
            ``get_page_content`` pour les IDs absents du cache (lignes non échantillonnées
            peuvent avoir un corps non vide).
        """
        cache: Dict[str, str] = {}
        n = NOTION_DATABASE_BODY_PROBE_ROW_COUNT
        if len(pages) < n:
            return cache, False
        ordered_ids: List[str] = []
        for p in pages[:n]:
            await self._cooperative_sync_point()
            pid = p.get("id")
            if not pid:
                return cache, False
            pid_key = str(pid).strip()
            if not pid_key:
                return cache, False

            async def _read_body() -> str:
                return await client.get_page_content(pid_key)

            body = await self._notion_read_with_retries(
                _read_body, retry_policy=retry_policy
            )
            text = body if isinstance(body, str) else ""
            cache[pid_key] = text
            ordered_ids.append(pid_key)
        if len(ordered_ids) < n:
            return cache, False
        if any(cache[k].strip() for k in ordered_ids):
            return cache, False
        log_sync_event(
            (
                f"{category_file} : les {n} premières lignes n'ont pas de corps de page "
                f"(normal pour certaines bases) — lecture du corps conservée pour les lignes "
                f"hors échantillon ; titre et colonnes inchangés."
            ),
            request_id=request_id,
        )
        return cache, True

    async def _apply_staging_despite_errors(
        self,
        *,
        sources: List[Any],
        included_list: List[str],
        eligible_cf: List[str],
        fingerprint: str,
        force_full: bool,
        run_scope_category_files: Optional[Tuple[str, ...]],
        resume: bool,
        fresh: bool,
        request_id: Optional[str],
    ) -> GddNotionSyncResult:
        """Applique le staging conservé après erreurs partielles (confirmation utilisateur)."""
        if not force_full:
            return GddNotionSyncResult(
                success=False,
                message="apply_staging_despite_errors=true nécessite full=true (sync complète).",
            )
        if run_scope_category_files:
            return GddNotionSyncResult(
                success=False,
                message=(
                    "apply_staging_despite_errors est incompatible avec le paramètre "
                    "category_file (périmètre restreint)."
                ),
            )
        if resume or fresh:
            return GddNotionSyncResult(
                success=False,
                message=(
                    "apply_staging_despite_errors est incompatible avec resume et fresh."
                ),
            )
        ok_resume, vmsg = validate_checkpoint_for_resume(
            self._gdd_categories_path,
            self._sync_checkpoint_dir,
            eligible_category_files=eligible_cf,
            sources_fingerprint=fingerprint,
        )
        if not ok_resume:
            return GddNotionSyncResult(
                success=False,
                message=f"Application du miroir impossible — {vmsg}",
            )
        st_chk = load_checkpoint_state(self._sync_checkpoint_dir)
        if st_chk is None or not st_chk.mirror_promotion_pending:
            return GddNotionSyncResult(
                success=False,
                message=(
                    "Aucune promotion miroir en attente. Si une sync complète s'est arrêtée "
                    "sur des erreurs, son checkpoint doit encore être valide ; sinon relancez "
                    "une sync complète ou utilisez « Reprendre » pour une sync inachevée."
                ),
            )
        staging_apply = staging_run_path(
            self._gdd_categories_path, st_chk.staging_run_name
        )
        if not staging_apply.is_dir():
            return GddNotionSyncResult(
                success=False,
                message="Application du miroir impossible — dossier staging introuvable.",
            )
        _, manifest_sidecar = checkpoint_paths(self._sync_checkpoint_dir)
        manifest_run = load_run_manifest(manifest_sidecar)
        sync_targets_apply = collect_sync_targets(
            self._gdd_categories_path, eligible_cf
        )
        self._sync_progress_update(
            active=True,
            started_at=datetime.now(timezone.utc).isoformat(),
            force_full=True,
            mirror_rebuild=True,
            phase="promoting",
            sources_total=len(eligible_cf),
            sources_completed=len(eligible_cf),
            current_source_index=len(eligible_cf),
            current_category_file="",
            pages_total_known=0,
            pages_processed=0,
            pages_in_current_source=0,
            current_page_in_source=0,
            current_page_id_short="",
            message="Promotion du staging (confirmation erreurs partielles)…",
            paused=False,
        )
        manifest_run.last_full_sync_at = datetime.now(timezone.utc).isoformat()
        save_manifest(self._manifest_path, manifest_run)
        promote_staging_to_live(
            self._gdd_categories_path,
            staging_apply,
            sync_targets_apply,
            allow_missing_staged=True,
        )
        prune_included: List[str] = list(included_list)
        removed_live = remove_excluded_database_sources_from_live(
            self._gdd_categories_path,
            sources,
            prune_included,
        )
        for rel in removed_live:
            log_sync_event(
                f"Périmètre restreint : supprimé du disque local — {rel}",
                request_id=request_id,
            )
        clear_checkpoint_files(self._sync_checkpoint_dir)
        prune_staging_runs_keep_only(self._gdd_categories_path, None)
        log_sync_event(
            "Miroir appliqué après confirmation utilisateur (reliquats ignorés).",
            request_id=request_id,
        )
        self._clear_gdd_file_cache_and_notify_context()
        if self._after_gdd_disk_mutation is not None:
            self._after_gdd_disk_mutation()
        self._sync_progress_clear()
        return GddNotionSyncResult(
            success=True,
            message=(
                "Miroir appliqué avec reliquats : les bases sans artefact dans le staging "
                "n'ont pas été modifiées sur disque. Vérifiez les erreurs du dernier run "
                "dans le statut ou les logs."
            ),
            updated_entities=int(st_chk.updated_entities),
            partial_errors=[],
            last_archive_relative=st_chk.archive_rel or None,
            mirror_rebuild_used=True,
            mirror_promotion_pending=False,
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
        run_scope_category_files: Optional[Tuple[str, ...]] = None,
        apply_staging_despite_errors: bool = False,
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
        scope_set: Optional[Set[str]] = None
        if run_scope_category_files:
            scope_set = {
                str(x).strip()
                for x in run_scope_category_files
                if isinstance(x, str) and str(x).strip()
            }
            if not scope_set:
                scope_set = None
            else:
                known_db = set(database_category_files)
                unknown = sorted(scope_set - known_db)
                if unknown:
                    return GddNotionSyncResult(
                        success=False,
                        message=(
                            "category_file inconnu ou absent des sources database : "
                            + ", ".join(unknown)
                        ),
                    )
        if (
            scope_set is None
            and included_list
            and database_category_files
        ):
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
            sources,
            included_list,
            partial,
            request_id,
            scope_category_files=scope_set,
        )
        eligible_cf = [e[2] for e in eligible]
        if not eligible:
            return GddNotionSyncResult(
                success=False,
                message=(
                    "Aucune source Notion éligible pour ce run "
                    "(category_file / included_categories / sources)."
                ),
            )
        if scope_set:
            log_sync_event(
                f"Périmètre run restreint aux bases : {', '.join(sorted(scope_set))}",
                request_id=request_id,
            )

        if apply_staging_despite_errors:
            return await self._apply_staging_despite_errors(
                sources=sources,
                included_list=included_list,
                eligible_cf=eligible_cf,
                fingerprint=fingerprint,
                force_full=force_full,
                run_scope_category_files=run_scope_category_files,
                resume=resume,
                fresh=fresh,
                request_id=request_id,
            )

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
                    mirror_promotion_pending=False,
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

            body_cache: Dict[str, str] = {}
            probe_sample_all_empty = False
            if (
                not compact_table
                and str(kind or "").strip().lower() == "database"
                and stale_pages
            ):
                body_cache, probe_sample_all_empty = await self._probe_database_body_sample(
                    client,
                    list(pages),
                    category_file=cat_file,
                    retry_policy=retry_policy,
                    request_id=request_id,
                )
                if probe_sample_all_empty:
                    logger.debug(
                        "%s : échantillon Notion (%s premières lignes) sans corps ; "
                        "les autres lignes sont quand même lues si absentes du cache.",
                        cat_file,
                        NOTION_DATABASE_BODY_PROBE_ROW_COUNT,
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
                    if compact_table:
                        rec = notion_page_to_compact_row_record(full_page)
                    else:
                        pid_key = str(pid or "").strip()

                        async def _read_body() -> str:
                            return await client.get_page_content(pid_key)

                        if pid_key in body_cache:
                            body = body_cache[pid_key]
                        else:
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
                if cp_state is not None:
                    cp_state.mirror_promotion_pending = True
                    save_checkpoint(self._sync_checkpoint_dir, cp_state, manifest)
                log_sync_event(
                    "Miroir non promu (erreurs partielles bloquantes) — staging et "
                    "checkpoint conservés. Relancez avec apply_staging_despite_errors=true "
                    "pour appliquer le staging (reliquats ignorés), ou resume=true pour "
                    "retenter les sources Notion en échec.",
                    request_id=request_id,
                )
                msg = (
                    f"Miroir non appliqué automatiquement : {len(partial)} erreur(s) "
                    f"partielle(s). Le disque live GDD n'a pas été modifié. "
                    f"Snapshot : {archive_rel or '?'}. "
                    "Vous pouvez appliquer le miroir malgré tout (bases absentes du staging "
                    "restent inchangées), ou reprendre pour retenter Notion."
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
                    mirror_promotion_pending=True,
                )
            self._sync_progress_update(
                phase="promoting",
                message="Promotion du miroir vers GDD_categories…",
            )
            if force_full:
                manifest.last_full_sync_at = datetime.now(timezone.utc).isoformat()
            save_manifest(self._manifest_path, manifest)
            promote_staging_to_live(
                self._gdd_categories_path,
                staging_run,
                sync_targets,
                allow_missing_staged=False,
            )
            prune_included: List[str] = [] if scope_set else list(included_list)
            removed_live = remove_excluded_database_sources_from_live(
                self._gdd_categories_path,
                sources,
                prune_included,
            )
            for rel in removed_live:
                log_sync_event(
                    f"Périmètre restreint : supprimé du disque local — {rel}",
                    request_id=request_id,
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
            mirror_promotion_pending=False,
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

    def build_notebooklm_export_zip(self, *, max_files: int = 64) -> bytes:
        """Assemble un ZIP Markdown (NotebookLM) depuis le GDD local et la config sync.

        Utilise ``included_categories`` comme filtre de périmètre (même sémantique que la sync).

        Args:
            max_files: Nombre maximal de fichiers dans l’archive (1–128), README inclus.

        Returns:
            Contenu binaire du fichier ZIP.

        Raises:
            ValueError: Si ``max_files`` est hors bornes.
        """
        from services.gdd_notebooklm_export import build_gdd_notebooklm_zip_bytes

        if max_files < 1 or max_files > 128:
            raise ValueError("max_files doit être entre 1 et 128")
        settings = self._store.load_settings()
        project_root = self._gdd_categories_path.resolve().parent.parent
        return build_gdd_notebooklm_zip_bytes(
            gdd_root=self._gdd_categories_path,
            project_root=project_root,
            settings=settings,
            max_files=max_files,
        )

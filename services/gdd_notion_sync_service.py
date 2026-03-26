"""Orchestration synchronisation GDD depuis Notion (FR18)."""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple, Type

import httpx

from services.gdd_notion_atomic_io import read_json_file, write_json_atomic
from services.gdd_notion_manifest import (
    GddNotionManifest,
    filter_stale_page_ids,
    load_manifest,
    save_manifest,
)
from services.gdd_notion_sync_config_store import GddNotionSyncConfigStore
from services.gdd_notion_sync_log import log_sync_event
from services.gdd_notion_sync_mapper import merge_records_by_nom, notion_page_to_gdd_record
from services.gdd_notion_sync_retry import SyncBackoffPolicy, run_with_retries
from services.gdd_notion_sync_utils import (
    category_file_matches_included,
    redact_notion_token_from_text,
)
from services.notion_api_client import NotionAPIClient

logger = logging.getLogger(__name__)

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
        self._client_factory = client_factory or (lambda key: NotionAPIClient(api_key=key))
        self._run_lock = asyncio.Lock()

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
        }
        data = read_json_file(self._status_path, default=default)
        return data if isinstance(data, dict) else default

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
        request_id: Optional[str] = None,
    ) -> GddNotionSyncResult:
        """Exécute une synchronisation (manuelle ou planifiée)."""
        async with self._run_lock:
            return await self._run_sync_locked(
                force_full=force_full, request_id=request_id
            )

    async def _run_sync_locked(
        self,
        *,
        force_full: bool,
        request_id: Optional[str],
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
            return res

        policy = SyncBackoffPolicy()

        async def _do() -> GddNotionSyncResult:
            return await self._sync_body(
                token, force_full=force_full, request_id=request_id
            )

        try:
            result = await run_with_retries(
                _do,
                policy=policy,
                max_attempts=5,
                is_transient=_is_transient_http_error,
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
            }
        )

    async def _sync_body(
        self,
        token: str,
        *,
        force_full: bool,
        request_id: Optional[str],
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

        client = self._client_factory(token)
        manifest = load_manifest(self._manifest_path)
        partial: List[str] = []
        updated = 0

        for src in sources:
            if not isinstance(src, dict):
                continue
            kind = src.get("kind")
            nid = str(src.get("notion_id", "")).strip()
            cat_file = str(src.get("category_file", "")).strip()
            if not nid or not cat_file:
                partial.append("Source ignorée (notion_id ou category_file vide)")
                continue

            if not category_file_matches_included(cat_file, included_list):
                log_sync_event(
                    f"{cat_file} exclu du périmètre (included_categories)",
                    request_id=request_id,
                )
                continue

            try:
                pages = await self._fetch_pages(client, kind, nid)
            except _SYNC_RECOVERABLE as exc:
                partial.append(
                    f"{cat_file}: fetch — {redact_notion_token_from_text(str(exc))}"
                )
                continue

            _, stale_pages = filter_stale_page_ids(
                list(pages), manifest, force_full=force_full
            )
            if not stale_pages:
                log_sync_event(
                    f"Rien à mettre à jour pour {cat_file} (manifest à jour)",
                    request_id=request_id,
                )
                continue

            out_path = self._gdd_categories_path / cat_file
            existing_raw = read_json_file(out_path, default=[])
            existing: List[Dict[str, Any]] = (
                existing_raw if isinstance(existing_raw, list) else []
            )

            new_recs: List[Dict[str, Any]] = []
            for p in stale_pages:
                pid = p.get("id")
                try:
                    full_page = await client.get_page(pid)
                    body = await client.get_page_content(pid)
                    new_recs.append(notion_page_to_gdd_record(full_page, body))
                    edited = p.get("last_edited_time") or ""
                    if edited:
                        manifest.set_edited(pid, edited)
                    updated += 1
                except _SYNC_RECOVERABLE as exc:
                    partial.append(
                        f"{cat_file} page {pid}: {redact_notion_token_from_text(str(exc))}"
                    )

            if not new_recs:
                continue

            merged = merge_records_by_nom(existing, new_recs)
            try:
                write_json_atomic(out_path, merged)
            except _SYNC_RECOVERABLE as exc:
                partial.append(f"{cat_file}: écriture — {exc}")
                continue

            save_manifest(self._manifest_path, manifest)
            log_sync_event(
                f"Écrit {cat_file}: {len(new_recs)} entité(s) traitée(s)",
                request_id=request_id,
            )

        if force_full:
            manifest.last_full_sync_at = datetime.now(timezone.utc).isoformat()
            save_manifest(self._manifest_path, manifest)

        try:
            from api.utils.gdd_cache import get_gdd_cache

            get_gdd_cache().clear()
        except (ImportError, AttributeError, OSError) as exc:
            logger.debug(
                "Invalidation cache GDD ignorée après sync: %s",
                exc,
                exc_info=True,
            )

        success = updated > 0 or not partial
        msg = (
            f"{updated} entité(s) mise(s) à jour"
            if updated
            else "Aucune mise à jour"
        )
        if partial:
            msg += f" — {len(partial)} avertissement(s)"
        return GddNotionSyncResult(
            success=success,
            message=msg,
            updated_entities=updated,
            partial_errors=partial,
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

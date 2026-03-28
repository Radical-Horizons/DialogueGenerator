"""Endpoints REST sync GDD depuis Notion (FR18)."""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_gdd_notion_sync_service, get_request_id
from api.routers.auth import get_current_user
from api.schemas.gdd_notion_sync import (
    GddArchiveEntrySchema,
    GddArchiveRestoreRequest,
    GddArchiveRestoreResponse,
    GddArchivesListResponse,
    GddFullSyncCheckpointAbandonResponse,
    GddFullSyncCheckpointResponse,
    GddFullSyncPauseResponse,
    GddNotionConnectionTestResponse,
    GddNotionSyncConfigPublic,
    GddNotionSyncConfigResponse,
    GddNotionSyncConfigUpdate,
    GddNotionSyncProgressResponse,
    GddNotionSyncRunResponse,
    GddNotionSyncStatusResponse,
)
from services.gdd_notion_sync_service import GddNotionSyncService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gdd-notion-sync", tags=["GDD Notion Sync"])


@router.get("/config", response_model=GddNotionSyncConfigResponse)
async def get_gdd_notion_config(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
) -> GddNotionSyncConfigResponse:
    """Retourne la configuration sans secret."""
    view = svc.get_public_config_dict()
    return GddNotionSyncConfigResponse(
        config=GddNotionSyncConfigPublic.model_validate(view)
    )


@router.put("/config", response_model=GddNotionSyncConfigResponse)
async def put_gdd_notion_config(
    body: GddNotionSyncConfigUpdate,
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
) -> GddNotionSyncConfigResponse:
    """Met à jour la configuration (token optionnel, non renvoyé)."""
    src = [s.model_dump() for s in body.sources] if body.sources is not None else None
    view = svc.update_config(
        sync_interval_minutes=body.sync_interval_minutes,
        auto_sync_enabled=body.auto_sync_enabled,
        sources=src,
        included_categories=body.included_categories,
        mirror_rebuild_on_full_sync=body.mirror_rebuild_on_full_sync,
        archive_retention_count=body.archive_retention_count,
        notion_token=body.notion_token,
    )
    return GddNotionSyncConfigResponse(
        config=GddNotionSyncConfigPublic.model_validate(view)
    )


@router.post("/test-connection", response_model=GddNotionConnectionTestResponse)
async def test_gdd_notion_connection(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> GddNotionConnectionTestResponse:
    """Teste le token Notion (users/me)."""
    result = await svc.test_connection(request_id=request_id)
    return GddNotionConnectionTestResponse.model_validate(result)


@router.post("/sync", response_model=GddNotionSyncRunResponse)
async def run_gdd_notion_sync(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
    request_id: Annotated[str, Depends(get_request_id)],
    full: Annotated[bool, Query(description="Sync complète : ignore le manifeste, archive puis miroir Notion→disque")] = False,
    mirror_rebuild: Annotated[
        bool,
        Query(
            description="Déprécié, sans effet : la sync complète (full=true) applique toujours le miroir.",
        ),
    ] = False,
    resume: Annotated[
        bool,
        Query(
            description="Reprendre la dernière sync complète interrompue (full=true requis).",
        ),
    ] = False,
    fresh: Annotated[
        bool,
        Query(
            description="Abandonner le checkpoint et lancer une sync complète neuve (full=true requis).",
        ),
    ] = False,
) -> GddNotionSyncRunResponse:
    """Déclenche une synchronisation immédiate."""
    if resume and not full:
        raise HTTPException(
            status_code=400,
            detail="resume=true nécessite full=true (sync complète).",
        )
    if fresh and not full:
        raise HTTPException(
            status_code=400,
            detail="fresh=true nécessite full=true (sync complète).",
        )
    if resume and fresh:
        raise HTTPException(
            status_code=400,
            detail="resume et fresh sont mutuellement exclusifs.",
        )
    result = await svc.run_sync(
        force_full=full,
        mirror_rebuild=mirror_rebuild,
        request_id=request_id,
        resume=resume,
        fresh=fresh,
    )
    return GddNotionSyncRunResponse(
        success=result.success,
        message=result.message,
        updated_entities=result.updated_entities,
        partial_errors=result.partial_errors,
    )


@router.get(
    "/full-sync-checkpoint",
    response_model=GddFullSyncCheckpointResponse,
)
async def get_gdd_full_sync_checkpoint(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
) -> GddFullSyncCheckpointResponse:
    """Décrit si une reprise de sync complète est possible."""
    raw = svc.describe_full_sync_checkpoint()
    return GddFullSyncCheckpointResponse.model_validate(raw)


@router.delete(
    "/full-sync-checkpoint",
    response_model=GddFullSyncCheckpointAbandonResponse,
)
async def delete_gdd_full_sync_checkpoint(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
) -> GddFullSyncCheckpointAbandonResponse:
    """Supprime le checkpoint et le staging associé (sans lancer de sync)."""
    raw = svc.abandon_full_sync_checkpoint()
    return GddFullSyncCheckpointAbandonResponse.model_validate(raw)


@router.post(
    "/full-sync/pause",
    response_model=GddFullSyncPauseResponse,
)
async def pause_gdd_full_sync(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
) -> GddFullSyncPauseResponse:
    """Met en pause une synchronisation en cours (coopératif)."""
    ok = svc.request_sync_pause()
    msg = "Pause demandée." if ok else "Aucune synchronisation active."
    return GddFullSyncPauseResponse(ok=ok, message=msg)


@router.post(
    "/full-sync/unpause",
    response_model=GddFullSyncPauseResponse,
)
async def unpause_gdd_full_sync(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
) -> GddFullSyncPauseResponse:
    """Reprend après une pause."""
    ok = svc.request_sync_unpause()
    msg = "Reprise de la synchronisation." if ok else "Aucune synchronisation active."
    return GddFullSyncPauseResponse(ok=ok, message=msg)


@router.post(
    "/full-sync/cancel",
    response_model=GddFullSyncPauseResponse,
)
async def cancel_gdd_full_sync(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
) -> GddFullSyncPauseResponse:
    """Annule la synchronisation en cours (débloque aussi une pause)."""
    ok = svc.request_sync_cancel()
    msg = "Annulation demandée." if ok else "Aucune synchronisation active."
    return GddFullSyncPauseResponse(ok=ok, message=msg)


@router.get("/status", response_model=GddNotionSyncStatusResponse)
async def get_gdd_notion_status(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
) -> GddNotionSyncStatusResponse:
    """Lit le dernier statut de sync (persisté)."""
    st = svc.read_status()
    return GddNotionSyncStatusResponse.model_validate(st)


@router.get("/sync-progress", response_model=GddNotionSyncProgressResponse)
async def get_gdd_notion_sync_progress(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
) -> GddNotionSyncProgressResponse:
    """Lit la progression d'une synchronisation en cours (polling)."""
    raw = svc.read_sync_progress()
    return GddNotionSyncProgressResponse.model_validate(raw)


@router.get("/archives", response_model=GddArchivesListResponse)
async def list_gdd_notion_archives(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
    limit: Annotated[int, Query(ge=1, le=100, description="Nombre max de snapshots")] = 20,
) -> GddArchivesListResponse:
    """Liste les derniers snapshots locaux (``.archive/``)."""
    rows = svc.list_gdd_archive_entries(limit=limit)
    return GddArchivesListResponse(
        archives=[GddArchiveEntrySchema.model_validate(r) for r in rows]
    )


@router.post(
    "/archives/{archive_id}/restore",
    response_model=GddArchiveRestoreResponse,
)
async def restore_gdd_notion_archive(
    archive_id: str,
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
    request_id: Annotated[str, Depends(get_request_id)],
    body: GddArchiveRestoreRequest | None = None,
) -> GddArchiveRestoreResponse:
    """Restaure le GDD local depuis un snapshot ``.archive/<archive_id>``."""
    backup = True if body is None else body.backup_current
    try:
        result = svc.restore_gdd_archive(
            archive_id,
            backup_current=backup,
            request_id=request_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        logger.warning("Restauration archive GDD échouée: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Échec restauration — {exc}",
        ) from exc
    return GddArchiveRestoreResponse.model_validate(result)

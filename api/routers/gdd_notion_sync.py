"""Endpoints REST sync GDD depuis Notion (FR18)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from api.dependencies import get_gdd_notion_sync_service, get_request_id
from api.routers.auth import get_current_user
from api.schemas.gdd_notion_sync import (
    GddNotionConnectionTestResponse,
    GddNotionSyncConfigPublic,
    GddNotionSyncConfigResponse,
    GddNotionSyncConfigUpdate,
    GddNotionSyncRunResponse,
    GddNotionSyncStatusResponse,
)
from services.gdd_notion_sync_service import GddNotionSyncService

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
    full: Annotated[bool, Query(description="Re-sync complet (ignore manifeste)")] = False,
) -> GddNotionSyncRunResponse:
    """Déclenche une synchronisation immédiate."""
    result = await svc.run_sync(force_full=full, request_id=request_id)
    return GddNotionSyncRunResponse(
        success=result.success,
        message=result.message,
        updated_entities=result.updated_entities,
        partial_errors=result.partial_errors,
    )


@router.get("/status", response_model=GddNotionSyncStatusResponse)
async def get_gdd_notion_status(
    _user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[GddNotionSyncService, Depends(get_gdd_notion_sync_service)],
) -> GddNotionSyncStatusResponse:
    """Lit le dernier statut de sync (persisté)."""
    st = svc.read_status()
    return GddNotionSyncStatusResponse.model_validate(st)

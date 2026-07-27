"""Router contexte GDD — empreinte de contenu et historique des entités (détection de péremption).
"""
import logging
from typing import Annotated, Any, Dict, List, Optional
from fastapi import APIRouter, Depends, status
from api.routers.auth import get_current_user
from api.schemas.gdd_context_stale import (
    GddContentFingerprintRequest,
    GddContentFingerprintResponse,
    GddEntityHistoryResponse,
    GddEntityHistoryEventPublic,
)
from api.dependencies import get_context_builder, get_request_id
from api.exceptions import NotFoundException, ValidationException
from core.context.context_builder import ContextBuilder

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post(
    "/gdd-content-fingerprint",
    response_model=GddContentFingerprintResponse,
    status_code=status.HTTP_200_OK,
)
async def post_gdd_content_fingerprint(
    request_data: GddContentFingerprintRequest,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> GddContentFingerprintResponse:
    """Calcule l'empreinte du contenu GDD pour une sélection (Story 3.9, détection stale)."""
    from services.gdd_context_fingerprint import compute_gdd_content_fingerprint

    try:
        fp = compute_gdd_content_fingerprint(
            context_builder,
            request_data.context_selections,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
        )
    except Exception as exc:
        logger.warning(
            "post_gdd_content_fingerprint échoué (request_id=%s): %s",
            request_id,
            exc,
        )
        raise ValidationException(
            message="Impossible de calculer l'empreinte GDD pour cette sélection.",
            request_id=request_id,
        ) from exc
    return GddContentFingerprintResponse(fingerprint=fp)


@router.get(
    "/gdd-entity-history",
    response_model=GddEntityHistoryResponse,
    status_code=status.HTTP_200_OK,
)
async def get_gdd_entity_history(
    category: str,
    name: str,
    request_id: Annotated[str, Depends(get_request_id)],
    include_snapshots: bool = False,
) -> GddEntityHistoryResponse:
    """Timeline locale des modifications d'une entité GDD (alimentée par sync Notion)."""
    from core.context.context_builder import PROJECT_ROOT_DIR
    from services.gdd_category_entity_lookup import live_gdd_entity_exists
    from services.gdd_entity_history import diff_snapshots_json, load_entity_history

    cat = (category or "").strip()
    nom = (name or "").strip()
    if not cat or not nom:
        raise ValidationException(
            message="Paramètres category et name requis.",
            request_id=request_id,
        )

    raw = load_entity_history(PROJECT_ROOT_DIR, cat, nom)
    if not raw and not live_gdd_entity_exists(PROJECT_ROOT_DIR, cat, nom):
        raise NotFoundException(
            resource_type="Entité GDD",
            resource_id=f"{cat}/{nom}",
            request_id=request_id,
        )

    events_pub: List[GddEntityHistoryEventPublic] = []
    for i, e in enumerate(raw):
        if not isinstance(e, dict):
            continue
        snap: Optional[Dict[str, Any]] = None
        diff_prev: Optional[str] = None
        if include_snapshots:
            s = e.get("snapshot")
            if isinstance(s, dict):
                snap = s
            if i > 0 and isinstance(raw[i - 1], dict):
                ps = raw[i - 1].get("snapshot")
                if isinstance(ps, dict) and isinstance(snap, dict):
                    diff_prev = diff_snapshots_json(ps, snap)
        events_pub.append(
            GddEntityHistoryEventPublic(
                at=str(e.get("at", "")),
                source=str(e.get("source", "")),
                summary=str(e.get("summary", "")),
                snapshot=snap,
                diff_from_previous=diff_prev,
            )
        )

    diff_hint: Optional[str] = None
    prev_snap: Optional[Dict[str, Any]] = None
    cur_snap: Optional[Dict[str, Any]] = None
    if len(raw) >= 2:
        a = raw[-2]
        b = raw[-1]
        if isinstance(a, dict) and isinstance(b, dict):
            sa = a.get("snapshot")
            sb = b.get("snapshot")
            if isinstance(sa, dict) and isinstance(sb, dict):
                prev_snap = sa
                cur_snap = sb
                diff_hint = diff_snapshots_json(sa, sb)

    return GddEntityHistoryResponse(
        category=cat,
        name=nom,
        events=events_pub,
        diff_hint=diff_hint,
        previous_snapshot=prev_snap,
        current_snapshot=cur_snap,
    )

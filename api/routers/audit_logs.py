"""Router admin pour consulter et exporter les journaux d'audit (FR71)."""

from __future__ import annotations

import csv
import io
import json
from datetime import date
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from api.dependencies import get_audit_log_service, require_admin
from api.routers.auth import get_current_user_or_none
from api.schemas.audit_logs import AuditLogEntryResponse, AuditLogListResponse
from services.audit_log_service import AuditLogService
from services.repositories.sqlite.audit_logs_repository import AuditLogEntry

router = APIRouter()


async def _require_admin_user(
    current_user: Annotated[
        Optional[dict[str, object]],
        Depends(get_current_user_or_none),
    ],
) -> dict[str, object]:
    """Résout et vérifie l'administrateur de la requête."""
    return require_admin(current_user)


def _parse_metadata(raw: str) -> dict[str, Any]:
    """Désérialise le JSON metadata stocké, avec repli sûr."""
    try:
        parsed = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _to_response(entry: AuditLogEntry) -> AuditLogEntryResponse:
    """Mappe une entrée repository vers le schéma HTTP."""
    return AuditLogEntryResponse(
        id=entry.id,
        created_at=entry.created_at,
        actor_user_id=entry.actor_user_id,
        actor_username=entry.actor_username,
        action=entry.action,
        target_type=entry.target_type,
        target_id=entry.target_id,
        metadata=_parse_metadata(entry.metadata),
    )


def _date_to_iso(value: Optional[date]) -> Optional[str]:
    """Convertit une date de filtre en chaîne ISO (jour)."""
    return value.isoformat() if value is not None else None


def _csv_safe(value: object) -> str:
    """Neutralise les cellules CSV pouvant déclencher des formules tableur."""
    text = "" if value is None else str(value)
    if text[:1] in {"=", "+", "-", "@"}:
        return f"'{text}"
    return text


@router.get(
    "/audit-logs",
    response_model=AuditLogListResponse,
    status_code=status.HTTP_200_OK,
)
async def list_audit_logs(
    _admin_user: Annotated[dict[str, object], Depends(_require_admin_user)],
    audit_service: Annotated[AuditLogService, Depends(get_audit_log_service)],
    user_id: Optional[str] = Query(default=None, description="Filtrer par actor_user_id"),
    username: Optional[str] = Query(default=None, description="Filtrer par actor_username"),
    action: Optional[str] = Query(default=None, description="Filtrer par action exacte"),
    start_date: Optional[date] = Query(default=None, description="Début inclus (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(default=None, description="Fin inclusive (YYYY-MM-DD)"),
    page: int = Query(default=1, ge=1, description="Numéro de page"),
    page_size: int = Query(default=50, ge=1, le=200, description="Taille de page"),
) -> AuditLogListResponse:
    """Liste paginée des entrées d'audit (admin uniquement)."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="start_date must be <= end_date",
        )
    result = audit_service.list_logs(
        user_id=user_id,
        username=username,
        action=action,
        start_date=_date_to_iso(start_date),
        end_date=_date_to_iso(end_date),
        page=page,
        page_size=page_size,
    )
    return AuditLogListResponse(
        items=[_to_response(item) for item in result.items],
        total=result.total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/audit-logs/export",
    status_code=status.HTTP_200_OK,
)
async def export_audit_logs(
    _admin_user: Annotated[dict[str, object], Depends(_require_admin_user)],
    audit_service: Annotated[AuditLogService, Depends(get_audit_log_service)],
    format: str = Query(default="json", pattern="^(json|csv)$"),
    user_id: Optional[str] = Query(default=None),
    username: Optional[str] = Query(default=None),
    action: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
) -> Response:
    """Exporte les audits filtrés en JSON ou CSV (admin uniquement)."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="start_date must be <= end_date",
        )
    result = audit_service.export_logs(
        user_id=user_id,
        username=username,
        action=action,
        start_date=_date_to_iso(start_date),
        end_date=_date_to_iso(end_date),
    )
    truncated = result.total > len(result.items)
    common_headers = {
        "X-Audit-Export-Total": str(result.total),
        "X-Audit-Export-Returned": str(len(result.items)),
        "X-Audit-Export-Truncated": "true" if truncated else "false",
    }
    if format == "csv":
        buffer = io.StringIO()
        writer = csv.DictWriter(
            buffer,
            fieldnames=[
                "id",
                "created_at",
                "actor_user_id",
                "actor_username",
                "action",
                "target_type",
                "target_id",
                "metadata",
            ],
        )
        writer.writeheader()
        for entry in result.items:
            writer.writerow(
                {
                    "id": _csv_safe(entry.id),
                    "created_at": _csv_safe(entry.created_at),
                    "actor_user_id": _csv_safe(entry.actor_user_id or ""),
                    "actor_username": _csv_safe(entry.actor_username),
                    "action": _csv_safe(entry.action),
                    "target_type": _csv_safe(entry.target_type),
                    "target_id": _csv_safe(entry.target_id),
                    "metadata": _csv_safe(entry.metadata),
                }
            )
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={
                **common_headers,
                "Content-Disposition": 'attachment; filename="audit-logs.csv"',
            },
        )

    payload = [_to_response(entry).model_dump() for entry in result.items]
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={
            **common_headers,
            "Content-Disposition": 'attachment; filename="audit-logs.json"',
        },
    )

"""Router API logs d'export Unity (Story 5.6 / FR54)."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, Query, status

from api.dependencies import get_export_log_service, get_request_id
from api.exceptions import InternalServerException
from api.routers.auth import get_current_user
from api.schemas.export_log import ExportLogEntryResponse, ExportLogsResponse
from services.export_log_service import ExportLogService, ExportStatus

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get(
    "/logs",
    response_model=ExportLogsResponse,
    status_code=status.HTTP_200_OK,
)
async def get_export_logs(
    export_log_service: Annotated[ExportLogService, Depends(get_export_log_service)],
    request_id: Annotated[str, Depends(get_request_id)],
    start_date: Optional[date] = Query(
        default=None,
        description="Date de début inclusive (défaut : 30 jours avant end_date).",
    ),
    end_date: Optional[date] = Query(
        default=None,
        description="Date de fin inclusive (défaut : aujourd'hui).",
    ),
    status_filter: Optional[Literal["success", "failure"]] = Query(
        default=None,
        alias="status",
        description="Filtrer par statut export (omit = tous).",
    ),
) -> ExportLogsResponse:
    """Liste chronologique des logs export (plus récent en premier)."""
    try:
        resolved_end = end_date or date.today()
        resolved_start = start_date or (resolved_end - timedelta(days=30))
        result = export_log_service.list_exports(
            start_date=resolved_start,
            end_date=resolved_end,
            status=status_filter,
        )
        return ExportLogsResponse(
            entries=[ExportLogEntryResponse(**e) for e in result.entries],
            total_count=result.total_count,
            success_count=result.success_count,
            failure_count=result.failure_count,
        )
    except Exception as exc:
        logger.exception("Erreur GET export logs (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la récupération des logs d'export",
            request_id=request_id,
        )

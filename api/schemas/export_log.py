"""Schémas Pydantic pour les logs d'export Unity (Story 5.6 / FR54)."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ExportLogEntryResponse(BaseModel):
    """Entrée de log export persistée."""

    id: str
    timestamp: str
    dialogue_id: str
    filename: str
    export_status: Literal["success", "failure"]
    validation_status: Literal["valid", "invalid", "skipped"]
    cost_eur: Optional[float] = None
    file_size_bytes: Optional[int] = None
    errors: List[str] = Field(default_factory=list)
    warnings_gdd: List[Dict[str, Any]] = Field(default_factory=list)
    source: Literal["graph", "library", "batch", "unity_export"]


class ExportLogsResponse(BaseModel):
    """Réponse GET /exports/logs."""

    entries: List[ExportLogEntryResponse]
    total_count: int
    success_count: int
    failure_count: int

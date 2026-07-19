"""Schémas Pydantic pour les journaux d'audit (FR71)."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class AuditLogEntryResponse(BaseModel):
    """Entrée d'audit exposée à l'API."""

    id: str
    created_at: str
    actor_user_id: Optional[str] = None
    actor_username: str
    action: str
    target_type: str
    target_id: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AuditLogListResponse(BaseModel):
    """Réponse paginée de la liste d'audit."""

    items: list[AuditLogEntryResponse]
    total: int
    page: int
    page_size: int

"""Schémas Pydantic pour la validation batch FR87."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class BatchValidationIssueResponse(BaseModel):
    """Issue de validation agrégée."""

    type: str
    message: str
    severity: Literal["error", "warning"]
    source: Literal["graph", "schema", "lore"]
    node_id: Optional[str] = None


class BatchValidationItemResponse(BaseModel):
    """Résultat pour un dialogue."""

    document_id: str
    status: Literal["valid", "invalid", "skipped", "cancelled", "denied"]
    issues: List[BatchValidationIssueResponse] = Field(default_factory=list)
    validated_at: str = ""


class BatchValidateRequest(BaseModel):
    """Requête sync (N < 20)."""

    document_ids: List[str] = Field(..., min_length=1, max_length=19)


class BatchValidateResponse(BaseModel):
    """Rapport sync complet."""

    items: List[BatchValidationItemResponse]
    cancelled: bool = False
    started_at: str
    finished_at: str
    valid_count: int
    invalid_count: int
    skipped_count: int


class BatchValidateJobRequest(BaseModel):
    """Requête job async (N ≥ 20)."""

    document_ids: List[str] = Field(..., min_length=20, max_length=500)


class BatchValidateJobCreateResponse(BaseModel):
    """Création de job."""

    job_id: str
    status: str
    total: int


class BatchValidateJobStatusResponse(BaseModel):
    """État d'un job de validation batch."""

    job_id: str
    status: Literal["queued", "running", "completed", "cancelled", "error"]
    current: int = 0
    total: int = 0
    cancelled: bool = False
    error: Optional[str] = None
    report: Optional[BatchValidateResponse] = None

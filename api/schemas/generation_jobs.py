"""Schémas pour les jobs de génération avec SSE streaming."""

from typing import Literal, Optional
from pydantic import BaseModel, Field

from api.schemas.dialogue import GenerateUnityDialogueRequest


class GenerationJobCreate(GenerateUnityDialogueRequest):
    """Paramètres de création de job : même contrat que la génération Unity directe."""

    pass


class GenerationJobResponse(BaseModel):
    """Réponse après création d'un job de génération."""

    job_id: str = Field(description="UUID du job créé")
    stream_url: str = Field(description="URL de l'EventSource SSE pour ce job")
    status: Literal["queued", "running"] = "queued"


class GenerationJobStatus(BaseModel):
    """Statut d'un job de génération."""

    job_id: str
    status: Literal["queued", "running", "completed", "error", "cancelled"]
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: str
    updated_at: str

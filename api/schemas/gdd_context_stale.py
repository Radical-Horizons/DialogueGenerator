"""Schémas API — empreinte GDD et historique d'entité (Story 3.9)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class GddContentFingerprintRequest(BaseModel):
    """Corps pour calculer l'empreinte du contenu GDD d'une sélection."""

    context_selections: Dict[str, Any] = Field(
        default_factory=dict,
        description="Sélections de contexte (même forme que generate-node / estimate-tokens)",
    )
    field_configs: Optional[Dict[str, List[str]]] = Field(
        None,
        description="Champs par type d'élément (optionnel, défauts ContextBuilder si absent)",
    )
    organization_mode: str = Field("narrative", description="Mode d'organisation du contexte")


class GddContentFingerprintResponse(BaseModel):
    """Réponse : empreinte SHA-256 du JSON de contexte structuré."""

    fingerprint: str = Field(..., description="Empreinte hex SHA-256")


class GddEntityHistoryEventPublic(BaseModel):
    """Événement d'historique ; snapshots optionnels selon la requête."""

    at: str
    source: str
    summary: str
    snapshot: Optional[Dict[str, Any]] = Field(
        None,
        description="Snapshot GDD à cette entrée si include_snapshots=true",
    )
    diff_from_previous: Optional[str] = Field(
        None,
        description="Diff texte vs l'entrée précédente (si include_snapshots et index > 0)",
    )


class GddEntityHistoryResponse(BaseModel):
    """Historique et diff MVP entre deux derniers snapshots."""

    category: str
    name: str
    events: List[GddEntityHistoryEventPublic]
    diff_hint: Optional[str] = Field(None, description="Texte de diff simplifié si ≥2 snapshots")
    previous_snapshot: Optional[Dict[str, Any]] = None
    current_snapshot: Optional[Dict[str, Any]] = None

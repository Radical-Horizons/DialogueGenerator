"""Schémas Pydantic pour la sync GDD Notion (FR18)."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class GddNotionSourceSchema(BaseModel):
    """Source Notion (page ou base) mappée vers un fichier catégorie GDD."""

    notion_id: str = Field(..., description="UUID page ou base Notion")
    kind: Literal["database", "page"] = Field(..., description='Type de source Notion')
    category_file: str = Field(
        ...,
        description="Nom de fichier cible (ex. personnages.json)",
    )


class GddNotionSyncConfigPublic(BaseModel):
    """Configuration exposée au client (sans secret)."""

    schema_version: int = 1
    sync_interval_minutes: int = 60
    auto_sync_enabled: bool = False
    sources: List[GddNotionSourceSchema] = Field(default_factory=list)
    included_categories: List[str] = Field(default_factory=list)
    token_configured: bool = False


class GddNotionSyncConfigUpdate(BaseModel):
    """Mise à jour partielle de la configuration."""

    sync_interval_minutes: Optional[int] = None
    auto_sync_enabled: Optional[bool] = None
    sources: Optional[List[GddNotionSourceSchema]] = None
    included_categories: Optional[List[str]] = None
    notion_token: Optional[str] = Field(
        default=None,
        description="Si fourni, remplace le token fichier (jamais renvoyé ensuite)",
    )


class GddNotionConnectionTestResponse(BaseModel):
    """Résultat du test de connexion Notion."""

    ok: bool
    message: str
    bot_id: Optional[str] = None
    bot_type: Optional[str] = None


class GddNotionSyncRunResponse(BaseModel):
    """Réponse après déclenchement sync manuelle."""

    success: bool
    message: str
    updated_entities: int = 0
    partial_errors: List[str] = Field(default_factory=list)


class GddNotionSyncStatusResponse(BaseModel):
    """Statut persisté de la dernière synchronisation."""

    last_started_at: Optional[str] = None
    last_finished_at: Optional[str] = None
    last_success: Optional[bool] = None
    message: str = ""
    updated_entities: int = 0
    partial_errors: List[str] = Field(default_factory=list)


class GddNotionSyncConfigResponse(BaseModel):
    """Config publique pour GET."""

    config: GddNotionSyncConfigPublic

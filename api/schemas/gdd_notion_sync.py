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
    mirror_rebuild_on_full_sync: bool = Field(
        default=False,
        description="Déprécié : ignoré par le serveur (sync complète = miroir automatique).",
    )
    archive_retention_count: int = 10
    token_configured: bool = False


class GddNotionSyncConfigUpdate(BaseModel):
    """Mise à jour partielle de la configuration."""

    sync_interval_minutes: Optional[int] = None
    auto_sync_enabled: Optional[bool] = None
    sources: Optional[List[GddNotionSourceSchema]] = None
    included_categories: Optional[List[str]] = None
    mirror_rebuild_on_full_sync: Optional[bool] = Field(
        default=None,
        description="Déprécié : sans effet sur le comportement (conservé pour compat. JSON).",
    )
    archive_retention_count: Optional[int] = Field(
        default=None,
        ge=1,
        description="Nombre max de snapshots sous .archive/ (les plus anciens supprimés).",
    )
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
    last_archive_relative: Optional[str] = None
    last_mirror_rebuild_used: Optional[bool] = None


class GddNotionSyncProgressResponse(BaseModel):
    """Progression live d'une sync en cours (polling UI)."""

    active: bool = False
    started_at: Optional[str] = None
    force_full: Optional[bool] = None
    mirror_rebuild: Optional[bool] = None
    phase: str = "idle"
    sources_total: int = 0
    sources_completed: int = 0
    current_source_index: int = 0
    current_category_file: str = ""
    pages_total_known: int = 0
    pages_processed: int = 0
    pages_in_current_source: int = 0
    current_page_in_source: int = 0
    current_page_id_short: str = ""
    message: str = ""
    paused: bool = False


class GddFullSyncCheckpointResponse(BaseModel):
    """État du checkpoint sync complète (reprise possible ou non)."""

    resumable: bool = False
    checkpoint_status: str = Field(
        default="none",
        description="none | resumable | stale | invalid_file",
    )
    checkpoint_file_present: bool = False
    orphan_staging_runs: int = 0
    message: str = ""
    staging_run_name: str = ""
    archive_rel: str = ""
    sources_total: int = 0
    sources_completed: int = 0
    completed_category_files: List[str] = Field(default_factory=list)
    eligible_category_files: List[str] = Field(default_factory=list)


class GddFullSyncCheckpointAbandonResponse(BaseModel):
    """Résultat de l'abandon du checkpoint."""

    ok: bool = True
    message: str = ""


class GddFullSyncPauseResponse(BaseModel):
    """Résultat pause / reprise coopérative."""

    ok: bool = False
    message: str = ""


class GddNotionSyncConfigResponse(BaseModel):
    """Config publique pour GET."""

    config: GddNotionSyncConfigPublic


class GddArchiveEntrySchema(BaseModel):
    """Une entrée d'historique sous ``GDD_categories/.archive/``."""

    id: str = Field(..., description="Nom du dossier snapshot")
    created_at: str = Field(..., description="Horodatage UTC ISO (préfixe du run)")


class GddArchivesListResponse(BaseModel):
    """Liste des snapshots disponibles."""

    archives: List[GddArchiveEntrySchema] = Field(default_factory=list)


class GddArchiveRestoreRequest(BaseModel):
    """Corps optionnel pour la restauration."""

    backup_current: bool = Field(
        default=True,
        description="Archiver l'état GDD actuel dans .archive/ avant d'appliquer le snapshot.",
    )


class GddArchiveRestoreResponse(BaseModel):
    """Résultat d'une restauration réussie."""

    ok: bool = True
    message: str
    new_backup_id: Optional[str] = Field(
        default=None,
        description="Nom du dossier de sauvegarde créé si backup_current était true",
    )

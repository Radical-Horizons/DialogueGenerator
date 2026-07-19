"""Service métier pour journaliser les mutations sensibles (append-only)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import uuid4

from services.repositories.sqlite.audit_logs_repository import (
    AuditLogEntry,
    AuditLogListResult,
    AuditLogsRepository,
)

logger = logging.getLogger(__name__)


class AuditLogService:
    """Écrit et consulte les entrées ``audit_logs`` (best-effort à l'écriture)."""

    def __init__(self, repository: AuditLogsRepository) -> None:
        """Initialise le service avec le repository injecté."""
        self._repository = repository

    def log_action(
        self,
        *,
        action: str,
        target_type: str,
        target_id: str,
        actor: Mapping[str, object] | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> AuditLogEntry | None:
        """Persiste une entrée d'audit après une mutation réussie.

        Les échecs d'écriture sont loggés et n'interrompent pas le flux métier.

        Args:
            action: Identifiant stable (ex. ``user.created``).
            target_type: Type de cible (``user``, ``dialogue``, ``share``).
            target_id: Identifiant de la cible.
            actor: Utilisateur à l'origine de l'action, le cas échéant.
            metadata: Contexte JSON sérialisable.

        Returns:
            Entrée créée, ou ``None`` si l'écriture a échoué.
        """
        actor_user_id: str | None = None
        actor_username = "system"
        if actor is not None:
            raw_id = actor.get("id")
            if raw_id is not None and str(raw_id).strip():
                actor_user_id = str(raw_id).strip()
            raw_username = actor.get("username")
            if raw_username is not None and str(raw_username).strip():
                actor_username = str(raw_username).strip()

        created_at = datetime.now(timezone.utc).isoformat()
        try:
            payload = json.dumps(dict(metadata or {}), ensure_ascii=False)
        except (TypeError, ValueError):
            payload = "{}"
            logger.warning(
                "Métadonnées d'audit non sérialisables pour action=%s",
                action,
            )

        try:
            return self._repository.insert(
                entry_id=str(uuid4()),
                created_at=created_at,
                actor_user_id=actor_user_id,
                actor_username=actor_username,
                action=action,
                target_type=target_type,
                target_id=target_id,
                metadata=payload,
            )
        except Exception:
            logger.exception(
                "Échec best-effort d'écriture audit action=%s target=%s/%s",
                action,
                target_type,
                target_id,
            )
            return None

    def list_logs(
        self,
        *,
        user_id: str | None = None,
        username: str | None = None,
        action: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> AuditLogListResult:
        """Liste paginée des audits pour l'administration."""
        safe_page = max(1, page)
        safe_size = max(1, min(page_size, 200))
        offset = (safe_page - 1) * safe_size
        return self._repository.list_filtered(
            user_id=user_id,
            username=username,
            action=action,
            start_date=start_date,
            end_date=end_date,
            offset=offset,
            limit=safe_size,
        )

    def export_logs(
        self,
        *,
        user_id: str | None = None,
        username: str | None = None,
        action: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        max_rows: int = 10_000,
    ) -> AuditLogListResult:
        """Retourne les entrées filtrées pour export CSV/JSON (éventuellement tronquées)."""
        return self._repository.list_filtered_all(
            user_id=user_id,
            username=username,
            action=action,
            start_date=start_date,
            end_date=end_date,
            max_rows=max_rows,
        )

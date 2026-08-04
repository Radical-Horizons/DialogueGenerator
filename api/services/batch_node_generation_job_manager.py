"""Gestionnaire en mémoire des jobs de génération batch multi-parents FR88."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Optional

logger = logging.getLogger(__name__)


class BatchNodeGenerationJobManager:
    """Jobs de génération batch stockés en mémoire processus."""

    def __init__(self, ttl_seconds: int = 3600) -> None:
        """Initialise le magasin de jobs."""
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._ttl_seconds = ttl_seconds
        self._tasks: Dict[str, asyncio.Task[Any]] = {}

    def create_job(self, parent_ids: list[str], owner_username: str) -> str:
        """Crée un job queued et retourne son identifiant."""
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        self._jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "parent_ids": list(parent_ids),
            "owner_username": owner_username,
            "current": 0,
            "total": len(parent_ids),
            "detail": "",
            "cancelled": False,
            "error": None,
            "report": None,
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(seconds=self._ttl_seconds)).isoformat(),
        }
        return job_id

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Retourne le job s'il existe et n'est pas expiré."""
        job = self._jobs.get(job_id)
        if not job:
            return None
        expires = datetime.fromisoformat(job["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            self._jobs.pop(job_id, None)
            self._tasks.pop(job_id, None)
            return None
        return job

    def set_progress(self, job_id: str, current: int, detail: str = "") -> None:
        """Met à jour la progression courante."""
        job = self._jobs.get(job_id)
        if job:
            job["current"] = current
            job["detail"] = detail
            job["status"] = "running"

    def cancel_job(self, job_id: str) -> bool:
        """Demande l'annulation d'un job."""
        job = self._jobs.get(job_id)
        if not job:
            return False
        job["cancelled"] = True
        if job["status"] in ("queued", "running"):
            job["status"] = "cancelled"
        return True

    def is_cancelled(self, job_id: str) -> bool:
        """Indique si une annulation a été demandée."""
        job = self._jobs.get(job_id)
        return bool(job and job.get("cancelled"))

    def complete(
        self,
        job_id: str,
        *,
        status: Literal["completed", "cancelled", "error"],
        report: Optional[dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        """Finalise un job."""
        job = self._jobs.get(job_id)
        if not job:
            return
        if job.get("cancelled") and status == "completed":
            status = "cancelled"
        job["status"] = status
        if report is not None:
            job["report"] = report
        if error is not None:
            job["error"] = error

    def register_task(self, job_id: str, task: asyncio.Task[Any]) -> None:
        """Associe la tâche asyncio au job."""
        self._tasks[job_id] = task

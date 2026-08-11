"""Base commune des gestionnaires de jobs batch en mémoire (FR87/FR88).

Store TTL + cleanup périodique + annulation partagés entre
``BatchValidationJobManager`` et ``BatchNodeGenerationJobManager``, qui ne
diffèrent que par la forme du payload initial et de ``set_progress``.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Optional

logger = logging.getLogger(__name__)


class InMemoryBatchJobManager:
    """Jobs batch stockés en mémoire processus, avec TTL et cleanup périodique."""

    def __init__(
        self,
        ttl_seconds: int = 3600,
        cleanup_interval_seconds: int = 300,
    ) -> None:
        """Initialise le magasin de jobs."""
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._ttl_seconds = ttl_seconds
        self._cleanup_interval_seconds = cleanup_interval_seconds
        self._tasks: Dict[str, "asyncio.Task[Any]"] = {}
        self._cleanup_task: Optional["asyncio.Task[Any]"] = None

    def _new_job_id(self) -> str:
        """Génère un identifiant de job unique."""
        return str(uuid.uuid4())

    def _register(self, job_id: str, payload: Dict[str, Any]) -> None:
        """Enregistre un job ``queued`` à partir des champs spécifiques à la sous-classe."""
        now = datetime.now(timezone.utc)
        payload.update(
            {
                "job_id": job_id,
                "status": "queued",
                "current": 0,
                "cancelled": False,
                "error": None,
                "report": None,
                "created_at": now.isoformat(),
                "expires_at": (now + timedelta(seconds=self._ttl_seconds)).isoformat(),
            }
        )
        self._jobs[job_id] = payload

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Retourne le job s'il existe et n'est pas expiré."""
        job = self._jobs.get(job_id)
        if not job:
            return None
        expires = datetime.fromisoformat(job["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            self._remove_job(job_id)
            return None
        return job

    def _remove_job(self, job_id: str) -> None:
        """Retire un job et sa tâche asyncio associée."""
        self._jobs.pop(job_id, None)
        self._tasks.pop(job_id, None)

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

    def register_task(self, job_id: str, task: "asyncio.Task[Any]") -> None:
        """Associe la tâche asyncio au job."""
        self._tasks[job_id] = task

    async def start_cleanup_task(self) -> None:
        """Démarre la tâche de nettoyage périodique des jobs expirés.

        Sans ce sweep, un job jamais re-pollé après complétion (onglet fermé,
        réseau coupé) fuit en mémoire indéfiniment : ``get_job`` ne purge que
        paresseusement, à la demande.
        """
        if self._cleanup_task is not None:
            logger.warning("%s: cleanup task déjà démarrée", type(self).__name__)
            return
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("%s: cleanup task démarrée", type(self).__name__)

    async def stop_cleanup_task(self) -> None:
        """Arrête la tâche de nettoyage."""
        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None
            logger.info("%s: cleanup task arrêtée", type(self).__name__)

    async def _cleanup_loop(self) -> None:
        """Boucle de nettoyage des jobs expirés."""
        while True:
            try:
                await asyncio.sleep(self._cleanup_interval_seconds)
                self._cleanup_expired_jobs()
            except asyncio.CancelledError:
                break
            except Exception as exc:  # noqa: BLE001
                logger.error("%s: erreur boucle cleanup: %s", type(self).__name__, exc)

    def _cleanup_expired_jobs(self) -> None:
        """Supprime les jobs dont le TTL est dépassé."""
        now = datetime.now(timezone.utc)
        expired: list[str] = []
        for job_id, job in self._jobs.items():
            try:
                expires_at = datetime.fromisoformat(job["expires_at"])
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if expires_at < now:
                    expired.append(job_id)
            except (ValueError, TypeError, KeyError):
                expired.append(job_id)
        for job_id in expired:
            self._remove_job(job_id)
        if expired:
            logger.info(
                "%s: %d job(s) expiré(s) nettoyé(s)", type(self).__name__, len(expired)
            )

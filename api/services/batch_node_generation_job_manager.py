"""Gestionnaire en mémoire des jobs de génération batch multi-parents FR88."""

from __future__ import annotations

from api.services.in_memory_batch_job_manager import InMemoryBatchJobManager


class BatchNodeGenerationJobManager(InMemoryBatchJobManager):
    """Jobs de génération batch stockés en mémoire processus."""

    def create_job(self, parent_ids: list[str], owner_username: str) -> str:
        """Crée un job queued et retourne son identifiant."""
        job_id = self._new_job_id()
        self._register(
            job_id,
            {
                "parent_ids": list(parent_ids),
                "owner_username": owner_username,
                "total": len(parent_ids),
                "detail": "",
            },
        )
        return job_id

    def set_progress(self, job_id: str, current: int, detail: str = "") -> None:
        """Met à jour la progression courante."""
        job = self._jobs.get(job_id)
        if job:
            job["current"] = current
            job["detail"] = detail
            job["status"] = "running"

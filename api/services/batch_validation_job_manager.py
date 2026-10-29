"""Gestionnaire en mémoire des jobs de validation batch FR87."""

from __future__ import annotations

from api.services.in_memory_batch_job_manager import InMemoryBatchJobManager


class BatchValidationJobManager(InMemoryBatchJobManager):
    """Jobs de validation batch stockés en mémoire processus."""

    def create_job(self, document_ids: list[str], owner_username: str) -> str:
        """Crée un job queued et retourne son identifiant."""
        job_id = self._new_job_id()
        self._register(
            job_id,
            {
                "document_ids": list(document_ids),
                "owner_username": owner_username,
                "total": len(document_ids),
            },
        )
        return job_id

    def set_progress(self, job_id: str, current: int) -> None:
        """Met à jour la progression courante."""
        job = self._jobs.get(job_id)
        if job:
            job["current"] = current
            job["status"] = "running"

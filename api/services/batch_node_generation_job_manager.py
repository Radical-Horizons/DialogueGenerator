"""Gestionnaire des jobs de génération batch multi-parents FR88."""

from __future__ import annotations

from api.services.in_memory_batch_job_manager import InMemoryBatchJobManager


class BatchNodeGenerationJobManager(InMemoryBatchJobManager):
    """Jobs de génération batch, persistés quand ``storage_path`` est fourni."""

    def create_job(self, parent_ids: list[str], owner_username: str) -> str:
        """Crée un job queued et retourne son identifiant."""
        job_id = self._new_job_id()
        self._register(
            job_id,
            {
                "parent_ids": list(parent_ids),
                "item_ids": list(parent_ids),
                "owner_username": owner_username,
                "total": len(parent_ids),
                "detail": "",
            },
        )
        return job_id

    def prepare_resume(self, job_id: str, item_ids: list[str]) -> None:
        """Reprise : la liste des parents suit celle du lot reposté."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job["parent_ids"] = list(item_ids)
            super().prepare_resume(job_id, item_ids)

    def set_progress(self, job_id: str, current: int, detail: str = "") -> None:
        """Met à jour la progression courante."""
        job = self._jobs.get(job_id)
        if job:
            job["current"] = current
            job["detail"] = detail
            self._mark_running(job)

"""Gestionnaire en mémoire des jobs A/B templates (Story 6.7)."""

from __future__ import annotations

from api.services.in_memory_batch_job_manager import InMemoryBatchJobManager


class TemplateABTestJobManager(InMemoryBatchJobManager):
    """Jobs A/B stockés en mémoire processus, alignés sur le test_id disque."""

    def create_job(self, test_id: str, total: int = 0) -> str:
        """Enregistre un job queued pour un test déjà identifié.

        Args:
            test_id: Identifiant UUID du test (dossier ``data/ab-tests/``).
            total: Nombre d'étapes (N × 2).

        Returns:
            Le même ``test_id``.
        """
        self._register(test_id, {"total": total, "detail": ""})
        return test_id

    def set_progress(self, job_id: str, current: int, total: int, detail: str = "") -> None:
        """Met à jour la progression courante."""
        job = self._jobs.get(job_id)
        if job:
            job["current"] = current
            job["total"] = total
            job["detail"] = detail
            job["status"] = "running"

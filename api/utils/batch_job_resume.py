"""Résolution du job à reprendre pour les lots FR87/FR88."""

from __future__ import annotations

from typing import Optional

from api.exceptions import APIException, NotFoundException
from api.services.in_memory_batch_job_manager import (
    ACTIVE_STATUSES,
    InMemoryBatchJobManager,
)
from api.utils.job_ownership import job_owner_key


def resolve_resume_job_id(
    job_manager: InMemoryBatchJobManager,
    *,
    resume_job_id: Optional[str],
    item_ids: list[str],
    current_user: dict[str, object],
    resource_type: str,
    request_id: Optional[str],
) -> Optional[str]:
    """Job existant à reprendre, ou ``None`` pour un nouveau job.

    Un ``resume_job_id`` explicite doit appartenir à l'appelant (404 sinon,
    comme un id inconnu : pas d'oracle d'existence) et ne pas tourner encore.
    Sans id, un job interrompu du même propriétaire sur exactement le même lot
    est repris d'office : reposter le lot après un redémarrage ne paie pas
    deux fois les items déjà traités.
    """
    owner = job_owner_key(current_user)
    if not resume_job_id:
        return job_manager.find_resumable_job(owner, item_ids)

    job = job_manager.get_job(resume_job_id)
    if job is None or (
        job.get("owner_username") != owner and current_user.get("role") != "admin"
    ):
        raise NotFoundException(
            resource_type=resource_type,
            resource_id=resume_job_id,
            request_id=request_id,
        )
    if job.get("status") in ACTIVE_STATUSES:
        raise APIException(
            status_code=409,
            code="JOB_ALREADY_RUNNING",
            message="Ce lot est déjà en cours de traitement",
            details={"job_id": resume_job_id},
            request_id=request_id,
        )
    return resume_job_id

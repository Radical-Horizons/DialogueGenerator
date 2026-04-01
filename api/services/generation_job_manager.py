"""Gestionnaire d'état des jobs de génération en cours."""
import uuid
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, Literal
import logging

logger = logging.getLogger(__name__)


class GenerationJobManager:
    """Gestionnaire en mémoire des jobs de génération avec TTL et cleanup automatique."""
    
    def __init__(self, ttl_seconds: int = 3600):
        """
        Args:
            ttl_seconds: Durée de vie d'un job en secondes (default: 1h)
        """
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._ttl_seconds = ttl_seconds
        self._cleanup_task: Optional[asyncio.Task] = None
        self._tasks: Dict[str, asyncio.Task] = {}
        self._stream_claim_locks: Dict[str, asyncio.Lock] = {}
    
    def create_job(self, params: dict, owner_username: str) -> str:
        """
        Crée un nouveau job de génération.

        Args:
            params: Paramètres de génération (sera passé au service).
            owner_username: Identifiant stable du créateur (username JWT ``sub`` ou équivalent).

        Returns:
            job_id: UUID du job créé
        """
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        self._jobs[job_id] = {
            'job_id': job_id,
            'status': 'queued',
            'params': params,
            'owner_username': owner_username,
            'result': None,
            'error': None,
            'cancelled': False,
            'done_event': asyncio.Event(),
            'created_at': now.isoformat(),
            'updated_at': now.isoformat(),
            'expires_at': (now + timedelta(seconds=self._ttl_seconds)).isoformat(),
        }
        
        logger.info(f"Job {job_id} created", extra={'job_id': job_id})
        return job_id
    
    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Récupère les infos d'un job."""
        job = self._jobs.get(job_id)
        if job and self._is_expired(job):
            self._remove_job(job_id)
            return None
        return job
    
    def update_status(
        self,
        job_id: str,
        status: Literal["queued", "running", "completed", "error", "cancelled"],
        result: Optional[dict] = None,
        error: Optional[str] = None
    ) -> None:
        """Met à jour le statut d'un job."""
        job = self._jobs.get(job_id)
        if not job:
            logger.warning(f"Attempted to update non-existent job {job_id}")
            return
        
        job['status'] = status
        job['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        if result is not None:
            job['result'] = result
        if error is not None:
            job['error'] = error
        
        if status in ('completed', 'error', 'cancelled'):
            done_event = job.get('done_event')
            if isinstance(done_event, asyncio.Event):
                done_event.set()
        
        logger.info(f"Job {job_id} status updated to {status}", extra={'job_id': job_id, 'status': status})
    
    def cancel_job(self, job_id: str) -> bool:
        """
        Marque un job comme annulé.
        
        Returns:
            True si le job a été annulé, False sinon (job inexistant ou déjà terminé)
        """
        job = self._jobs.get(job_id)
        if not job:
            logger.warning(f"Attempted to cancel non-existent job {job_id}")
            return False
        
        if job['status'] in ('completed', 'error', 'cancelled'):
            logger.info(f"Job {job_id} already finished, cannot cancel")
            return False
        
        # Calculer durée de génération (fix: gestion erreur format date - Issue #7)
        try:
            created_at = datetime.fromisoformat(job['created_at'])
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid date format for job {job_id}: {job.get('created_at')}, using current time", extra={'job_id': job_id})
            created_at = datetime.now(timezone.utc)
        
        now = datetime.now(timezone.utc)
        duration_seconds = (now - created_at).total_seconds()
        
        job['cancelled'] = True
        job['status'] = 'cancelled'
        job['updated_at'] = now.isoformat()
        
        task = self._tasks.get(job_id)
        if task and not task.done():
            task.cancel()
        
        # Log détaillé avec timestamp, durée et métadonnées
        logger.info(
            f"Génération annulée par utilisateur - job_id: {job_id}, durée: {duration_seconds:.2f}s, "
            f"timestamp: {now.isoformat()}",
            extra={
                'job_id': job_id,
                'duration_seconds': duration_seconds,
                'timestamp': now.isoformat(),
                'status': 'cancelled'
            }
        )
        done_event = job.get("done_event")
        if isinstance(done_event, asyncio.Event):
            done_event.set()
        return True
    
    def is_cancelled(self, job_id: str) -> bool:
        """Vérifie si un job a été annulé."""
        job = self._jobs.get(job_id)
        return job['cancelled'] if job else False
    
    def _is_expired(self, job: Dict[str, Any]) -> bool:
        """Vérifie si un job a expiré."""
        try:
            expires_at = datetime.fromisoformat(job['expires_at'])
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid expires_at format for job {job.get('job_id', 'unknown')}, considering expired")
            return True  # Considérer comme expiré si format invalide
        return datetime.now(timezone.utc) > expires_at
    
    def _remove_job(self, job_id: str) -> None:
        """Supprime un job (appelé par cleanup)."""
        if job_id in self._jobs:
            del self._jobs[job_id]
        if job_id in self._tasks:
            del self._tasks[job_id]
            logger.debug(f"Job {job_id} removed from memory")
    
    async def try_claim_stream_job(self, job_id: str) -> bool:
        """Réserve exclusivement le passage ``queued`` → ``running`` pour un flux SSE.

        Évite deux clients qui streament le même job en parallèle.

        Args:
            job_id: Identifiant du job.

        Returns:
            True si ce flux est devenu propriétaire (statut mis à ``running``).
        """
        lock = self._stream_claim_locks.setdefault(job_id, asyncio.Lock())
        async with lock:
            job = self._jobs.get(job_id)
            if not job or self._is_expired(job):
                return False
            if job.get("status") != "queued":
                return False
            job["status"] = "running"
            job["updated_at"] = datetime.now(timezone.utc).isoformat()
            logger.info(
                "Job stream claim: queued→running",
                extra={"job_id": job_id, "status": "running"},
            )
            return True

    def register_task(self, job_id: str, task: asyncio.Task) -> None:
        """Enregistre la tâche de génération pour permettre l'annulation."""
        self._tasks[job_id] = task
    
    def unregister_task(self, job_id: str) -> None:
        """Supprime la référence à la tâche de génération."""
        # Fix: Vérification déjà présente, mais ajout d'un log si job_id n'existe pas (Issue #9)
        if job_id in self._tasks:
            del self._tasks[job_id]
        else:
            logger.debug(f"Attempted to unregister non-existent task for job {job_id}")
    
    async def wait_for_completion(self, job_id: str, timeout_seconds: int = 10) -> bool:
        """Attend la fin d'un job (completed/error/cancelled) avec timeout."""
        job = self._jobs.get(job_id)
        if not job:
            return False
        
        done_event = job.get('done_event')
        if not isinstance(done_event, asyncio.Event):
            return False
        
        try:
            await asyncio.wait_for(done_event.wait(), timeout=timeout_seconds)
            return True
        except asyncio.TimeoutError:
            return False
    
    async def start_cleanup_task(self) -> None:
        """Démarre la tâche de nettoyage périodique des jobs expirés."""
        if self._cleanup_task is not None:
            logger.warning("Cleanup task already running")
            return
        
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("Cleanup task started")
    
    async def stop_cleanup_task(self) -> None:
        """Arrête la tâche de nettoyage."""
        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None
            logger.info("Cleanup task stopped")
    
    async def _cleanup_loop(self) -> None:
        """Boucle de nettoyage des jobs expirés (toutes les 5 minutes)."""
        while True:
            try:
                await asyncio.sleep(300)  # 5 minutes
                await self._cleanup_expired_jobs()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
    
    async def _cleanup_expired_jobs(self) -> None:
        """Supprime les jobs expirés."""
        now = datetime.now(timezone.utc)
        expired_jobs = []
        for job_id, job in self._jobs.items():
            try:
                expires_at = datetime.fromisoformat(job['expires_at'])
                if expires_at < now:
                    expired_jobs.append(job_id)
            except (ValueError, TypeError):
                # Format invalide, considérer comme expiré
                expired_jobs.append(job_id)
        
        for job_id in expired_jobs:
            self._remove_job(job_id)
        
        if expired_jobs:
            logger.info(f"Cleaned up {len(expired_jobs)} expired jobs")


# Instance globale (singleton)
_job_manager: Optional[GenerationJobManager] = None


def get_job_manager() -> GenerationJobManager:
    """Récupère l'instance singleton du job manager."""
    global _job_manager
    if _job_manager is None:
        _job_manager = GenerationJobManager()
    return _job_manager

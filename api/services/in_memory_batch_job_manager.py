"""Base commune des gestionnaires de jobs batch (FR87/FR88).

Store TTL + cleanup périodique + annulation partagés entre
``BatchValidationJobManager`` et ``BatchNodeGenerationJobManager``, qui ne
diffèrent que par la forme du payload initial et de ``set_progress``.

Avec ``storage_path``, l'état survit à un redémarrage du process : il est
réécrit atomiquement (fichier JSON, même procédé que les autres états locaux
sous ``data/``) à chaque transition de statut et à chaque point de reprise par
item. Un job ``queued``/``running`` relu au démarrage devient ``interrupted`` :
il n'est jamais relancé seul, une reprise engage une dépense LLM que seul
l'utilisateur décide. Sans ``storage_path`` (A/B templates, tests), le
comportement reste purement en mémoire.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Literal, Optional

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_BATCH_JOBS_DIR = _PROJECT_ROOT / "data" / "batch_jobs"

ACTIVE_STATUSES = ("queued", "running")
RESUMABLE_STATUSES = ("interrupted", "cancelled", "error")


def batch_jobs_dir() -> Path:
    """Dossier des états de jobs batch persistés (redirigé par les tests)."""
    return _BATCH_JOBS_DIR


class InMemoryBatchJobManager:
    """Jobs batch avec TTL, cleanup périodique et persistance disque optionnelle."""

    def __init__(
        self,
        ttl_seconds: int = 3600,
        cleanup_interval_seconds: int = 300,
        storage_path: Optional[Path] = None,
    ) -> None:
        """Initialise le magasin de jobs et relit l'état persisté s'il existe."""
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._ttl_seconds = ttl_seconds
        self._cleanup_interval_seconds = cleanup_interval_seconds
        self._tasks: Dict[str, "asyncio.Task[Any]"] = {}
        self._cleanup_task: Optional["asyncio.Task[Any]"] = None
        self._storage_path = storage_path
        # La validation batch tourne dans un thread (``asyncio.to_thread``).
        self._lock = threading.RLock()
        if storage_path is not None:
            self._load()

    def _new_job_id(self) -> str:
        """Génère un identifiant de job unique."""
        return str(uuid.uuid4())

    def _expires_at(self) -> str:
        """Échéance TTL à partir de maintenant."""
        return (
            datetime.now(timezone.utc) + timedelta(seconds=self._ttl_seconds)
        ).isoformat()

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
                "items": {},
                "created_at": now.isoformat(),
                "expires_at": self._expires_at(),
            }
        )
        with self._lock:
            self._jobs[job_id] = payload
            self._persist()

    # --- persistance -------------------------------------------------------

    def _load(self) -> None:
        """Relit l'état disque ; un job actif au redémarrage devient ``interrupted``."""
        path = self._storage_path
        if path is None or not path.exists():
            return
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            logger.error("%s: état illisible %s: %s", type(self).__name__, path, exc)
            return
        if not isinstance(raw, dict):
            return
        interrupted = 0
        for job_id, job in raw.items():
            if not isinstance(job, dict):
                continue
            if job.get("status") in ACTIVE_STATUSES:
                job["status"] = "interrupted"
                job["detail"] = "Interrompu par un redémarrage du serveur"
                interrupted += 1
            self._jobs[str(job_id)] = job
        self._cleanup_expired_jobs()
        self._persist()
        if interrupted:
            logger.warning(
                "%s: %d job(s) interrompu(s) par le redémarrage",
                type(self).__name__,
                interrupted,
            )

    def _persist(self) -> None:
        """Écrit l'état complet de façon atomique (no-op sans ``storage_path``)."""
        path = self._storage_path
        if path is None:
            return
        with self._lock:
            try:
                data = json.dumps(self._jobs, ensure_ascii=False, default=str)
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = path.with_suffix(path.suffix + ".tmp")
                temporary.write_text(data, encoding="utf-8")
                os.replace(temporary, path)
            except OSError as exc:
                logger.error(
                    "%s: écriture de l'état impossible %s: %s",
                    type(self).__name__,
                    path,
                    exc,
                )

    # --- cycle de vie ------------------------------------------------------

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
        with self._lock:
            self._jobs.pop(job_id, None)
            self._tasks.pop(job_id, None)
            self._persist()

    def cancel_job(self, job_id: str) -> bool:
        """Demande l'annulation d'un job."""
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            job["cancelled"] = True
            if job["status"] in ACTIVE_STATUSES:
                job["status"] = "cancelled"
            self._persist()
        return True

    def is_cancelled(self, job_id: str) -> bool:
        """Indique si une annulation a été demandée."""
        job = self._jobs.get(job_id)
        return bool(job and job.get("cancelled"))

    def _mark_running(self, job: Dict[str, Any]) -> None:
        """Passe un job en ``running`` ; ne persiste qu'à la transition."""
        if job.get("status") != "running":
            job["status"] = "running"
            self._persist()

    def record_item(self, job_id: str, item_id: str, item: Dict[str, Any]) -> None:
        """Point de reprise : résultat d'un item terminé, persisté aussitôt."""
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.setdefault("items", {})[item_id] = item
            self._persist()

    def checkpointed_items(self, job_id: str) -> Dict[str, Dict[str, Any]]:
        """Résultats par item déjà enregistrés pour ce job."""
        job = self._jobs.get(job_id)
        return dict((job or {}).get("items") or {})

    def find_resumable_job(
        self, owner_username: str, item_ids: Iterable[str]
    ) -> Optional[str]:
        """Job interrompu du même propriétaire portant exactement les mêmes items.

        Permet à un client qui reposte le même lot après un redémarrage de
        retomber sur son job au lieu d'en recréer un (et de repayer).
        """
        wanted = set(item_ids)
        for job_id, job in list(self._jobs.items()):
            if job.get("status") != "interrupted":
                continue
            if job.get("owner_username") != owner_username:
                continue
            if set(job.get("item_ids") or []) == wanted and self.get_job(job_id):
                return job_id
        return None

    def prepare_resume(self, job_id: str, item_ids: list[str]) -> None:
        """Remet un job terminé/interrompu en file, en gardant ses points de reprise."""
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.update(
                {
                    "status": "queued",
                    "cancelled": False,
                    "error": None,
                    "report": None,
                    "current": 0,
                    "detail": "",
                    "item_ids": list(item_ids),
                    "total": len(item_ids),
                    "expires_at": self._expires_at(),
                }
            )
            self._persist()

    def complete(
        self,
        job_id: str,
        *,
        status: Literal["completed", "cancelled", "error"],
        report: Optional[dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        """Finalise un job."""
        with self._lock:
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
            self._persist()

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
        with self._lock:
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
                self._jobs.pop(job_id, None)
                self._tasks.pop(job_id, None)
            if expired:
                self._persist()
        if expired:
            logger.info(
                "%s: %d job(s) expiré(s) nettoyé(s)", type(self).__name__, len(expired)
            )

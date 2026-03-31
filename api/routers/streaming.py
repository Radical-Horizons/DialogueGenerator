"""Router pour le streaming SSE des générations de dialogues avec job flow.

Architecture :
    1. POST /generate/jobs → crée un job, retourne job_id + stream_url
    2. GET /generate/jobs/{job_id}/stream → EventSource SSE pour suivre la progression
    3. POST /generate/jobs/{job_id}/cancel → annule le job en cours

Format SSE strict :
    data: {"type": "chunk", "content": "..."}\n\n

Types d'événements :
    - chunk : Texte streaming (caractère par caractère)
    - metadata : Tokens, coût
    - step : Étape progression (Prompting → Generating → Validating → Complete)
    - complete : Fin de génération (+ résultat Unity JSON si configuré)
    - error : Erreur survenue
"""
import logging
import json
import asyncio
from typing import Annotated, AsyncGenerator, Dict, Any
from fastapi import APIRouter, Depends, Request, HTTPException

from api.routers.auth import get_current_user
from fastapi.responses import StreamingResponse
from api.schemas.generation_jobs import GenerationJobCreate, GenerationJobResponse, GenerationJobStatus
from api.services.generation_job_manager import get_job_manager
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator
from api.dependencies import get_unity_dialogue_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])

# Constante pour timeout d'annulation (10 secondes) - Story 0.8
CANCEL_TIMEOUT_SECONDS = 10


def _calculate_duration(job: Dict[str, Any]) -> float:
    """Calcule la durée d'un job en secondes.
    
    Helper function pour éviter duplication de code et gérer les erreurs de format de date.
    
    Args:
        job: Dictionnaire du job avec 'created_at'.
        
    Returns:
        Durée en secondes, ou 0.0 si format de date invalide.
    """
    from datetime import datetime, timezone
    
    try:
        created_at = datetime.fromisoformat(job['created_at'])
        now = datetime.now(timezone.utc)
        return (now - created_at).total_seconds()
    except (ValueError, TypeError, KeyError) as e:
        logger.warning(
            f"Invalid date format for job {job.get('job_id', 'unknown')}: {job.get('created_at')}, "
            f"using 0.0s duration",
            extra={'job_id': job.get('job_id'), 'error': str(e)}
        )
        return 0.0


async def stream_generation(job_id: str, orchestrator: UnityDialogueOrchestrator) -> AsyncGenerator[str, None]:
    """Générateur async pour streamer la génération Unity Dialogue.
    
    Pattern :
        - Yield des chunks SSE au format strict : `data: {...}\n\n`
        - Vérifie le flag cancelled à chaque étape
        - Envoie des événements step, metadata, complete, error
    
    Args:
        job_id: ID du job à streamer.
        orchestrator: Orchestrateur Unity injecté via dépendance.
        
    Yields:
        Chunks SSE au format `data: {...}\n\n`.
    """
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)
    
    if not job:
        yield f'data: {json.dumps({"type": "error", "message": "Job introuvable"})}\n\n'
        return
    
    from datetime import datetime, timezone
    
    st_initial = job.get("status")
    if st_initial == "completed":
        logger.warning(f"Job {job_id} déjà complété, arrêt du stream")
        yield f'data: {json.dumps({"type": "error", "message": "Job déjà complété"})}\n\n'
        return
    if st_initial in ("error", "cancelled"):
        yield (
            f'data: {json.dumps({"type": "error", "message": f"Job en état terminal: {st_initial}"})}\n\n'
        )
        return

    claimed = await job_manager.try_claim_stream_job(job_id)
    if not claimed:
        job_refresh = job_manager.get_job(job_id)
        st_now = job_refresh.get("status") if job_refresh else None
        if st_now == "running":
            msg = "Un flux SSE est déjà actif pour ce job"
        elif st_now == "completed":
            msg = "Job déjà complété"
        else:
            msg = "Impossible de démarrer le flux pour ce job"
        logger.warning(
            "Stream non réservé pour job %s (statut=%s)",
            job_id,
            st_now,
            extra={"job_id": job_id, "status": st_now},
        )
        yield f'data: {json.dumps({"type": "error", "message": msg})}\n\n'
        return

    try:
        current_task = asyncio.current_task()
        if current_task is not None:
            job_manager.register_task(job_id, current_task)
        
        # Construire request_data depuis job params
        from api.schemas.dialogue import GenerateUnityDialogueRequest
        
        # Construire request_data depuis job params
        request_data = GenerateUnityDialogueRequest(**job['params'])
        
        # Stocker l'étape actuelle pour les logs (initialiser à "queued" pour logs plus précis)
        current_step = "queued"
        
        # Streamer les événements
        async for event in orchestrator.generate_with_events(
            request_data,
            check_cancelled=lambda: job_manager.is_cancelled(job_id)
        ):
            # Convertir GenerationEvent en SSE
            if event.type == 'chunk':
                chunk_content = event.data.get("content", "")
                chunk_sequence = event.data.get("sequence", None)
                payload = {"type": "chunk", "content": chunk_content}
                if chunk_sequence is not None:
                    payload["sequence"] = chunk_sequence
                # Flush immédiat : yield avec format SSE strict
                # Le yield dans un async generator FastAPI envoie immédiatement
                yield f'data: {json.dumps(payload, ensure_ascii=False)}\n\n'
            elif event.type == 'step':
                current_step = event.data.get("step", "unknown")
                yield f'data: {json.dumps({"type": "step", "step": current_step})}\n\n'
            elif event.type == 'metadata':
                meta = {"type": "metadata", "tokens": event.data["tokens"], "cost": event.data["cost"]}
                if event.data.get("used_fallback"):
                    meta["used_fallback"] = True
                    meta["fallback_from"] = event.data.get("fallback_from", "")
                    meta["fallback_to"] = event.data.get("fallback_to", "")
                yield f'data: {json.dumps(meta)}\n\n'
            elif event.type == 'complete':
                # Stocker résultat dans job
                job_manager.update_status(job_id, "completed", result=event.data['result'])
                yield f'data: {json.dumps({"type": "complete", "result": event.data["result"]})}\n\n'
                
                # Log cleanup automatique après génération normale
                duration_seconds = _calculate_duration(job)
                now = datetime.now(timezone.utc)
                logger.info(
                    f"Génération terminée, cleanup automatique - job_id: {job_id}, durée: {duration_seconds:.2f}s, "
                    f"timestamp: {now.isoformat()}",
                    extra={
                        'job_id': job_id,
                        'duration_seconds': duration_seconds,
                        'timestamp': now.isoformat(),
                        'status': 'completed'
                    }
                )
                # IMPORTANT: Arrêter le stream après complete pour éviter les générations multiples
                # (Fonctionnalité de génération multiple désactivée - repoussée à la prochaine version)
                return
            elif event.type == 'error':
                error_code = event.data.get("code")
                if error_code == "cancelled" or job_manager.is_cancelled(job_id):
                    job_manager.update_status(job_id, "cancelled", error=event.data['message'])
                else:
                    job_manager.update_status(job_id, "error", error=event.data['message'])
                yield f'data: {json.dumps({"type": "error", "message": event.data["message"]})}\n\n'
                return
        
    except asyncio.CancelledError:
        # Calculer durée et métadonnées pour logs d'annulation
        duration_seconds = _calculate_duration(job)
        now = datetime.now(timezone.utc)
        
        job_manager.update_status(job_id, "cancelled", error="Génération annulée")
        
        # Log détaillé avec métadonnées
        logger.info(
            f"Génération annulée par utilisateur - job_id: {job_id}, durée: {duration_seconds:.2f}s, "
            f"étape: {current_step or 'unknown'}, timestamp: {now.isoformat()}",
            extra={
                'job_id': job_id,
                'duration_seconds': duration_seconds,
                'step': current_step or 'unknown',
                'timestamp': now.isoformat(),
                'status': 'cancelled'
            }
        )
        
        yield f'data: {json.dumps({"type": "error", "message": "Génération annulée", "code": "cancelled"})}\n\n'
        return
    except Exception as e:
        logger.exception(f"Error streaming job {job_id}: {e}")
        job_manager.update_status(job_id, "error", error=str(e))
        yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
    finally:
        # Vérifier que la tâche est enregistrée avant de la désenregistrer
        # La tâche peut ne pas être enregistrée si une exception se produit avant register_task()
        if job_id in job_manager._tasks:
            job_manager.unregister_task(job_id)


@router.post("/generate/jobs", response_model=GenerationJobResponse)
async def create_generation_job(
    job_data: GenerationJobCreate,
    request: Request,
) -> GenerationJobResponse:
    """Crée un nouveau job de génération Unity Dialogue.
    
    Args:
        job_data: Paramètres de génération (identiques à l'endpoint REST).
        request: Requête HTTP (pour construire l'URL de streaming).
        
    Returns:
        Job créé avec job_id et stream_url.
    """
    job_manager = get_job_manager()
    
    # Créer le job avec les paramètres
    job_id = job_manager.create_job(job_data.model_dump(mode='json'))
    
    # Construire l'URL de streaming
    base_url = str(request.base_url).rstrip('/')
    stream_url = f"{base_url}/api/v1/dialogues/generate/jobs/{job_id}/stream"
    
    logger.info(f"Created generation job {job_id}", extra={'job_id': job_id})
    
    return GenerationJobResponse(
        job_id=job_id,
        stream_url=stream_url,
        status="queued",
    )


def _get_stream_orchestrator(
    request: Request,
    job_id: str,
) -> UnityDialogueOrchestrator:
    """Fournit un orchestrateur Unity configuré pour le job SSE."""
    # Conserver le job_id comme request_id pour la traçabilité.
    return get_unity_dialogue_orchestrator(request=request, request_id=job_id)


@router.get("/generate/jobs/{job_id}/stream", response_class=StreamingResponse)
async def stream_job(
    job_id: str,
    orchestrator: Annotated[UnityDialogueOrchestrator, Depends(_get_stream_orchestrator)],
) -> StreamingResponse:
    """Endpoint SSE pour streamer la génération d'un job.
    
    Args:
        job_id: ID du job à streamer.
        
    Returns:
        StreamingResponse avec chunks SSE.
    """
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    return StreamingResponse(
        stream_generation(job_id, orchestrator),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Désactiver le buffering nginx
        },
    )


@router.post("/generate/jobs/{job_id}/cancel")
async def cancel_job(job_id: str) -> Dict[str, Any]:
    """Annule un job de génération en cours.
    
    Args:
        job_id: ID du job à annuler.
        
    Returns:
        Statut de l'annulation.
    """
    job_manager = get_job_manager()
    
    if not job_manager.get_job(job_id):
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    success = job_manager.cancel_job(job_id)
    
    if not success:
        return {
            "success": False,
            "message": "Job already finished or cancelled",
            "job_id": job_id,
        }
    
    # Attendre la fin (cleanup) avec timeout max 10s (Story 0.8 - AC #1)
    await job_manager.wait_for_completion(job_id, timeout_seconds=CANCEL_TIMEOUT_SECONDS)
    
    logger.info(f"Job {job_id} cancelled", extra={'job_id': job_id})
    
    return {
        "success": True,
        "message": "Job cancelled successfully",
        "job_id": job_id,
    }


@router.get("/generate/jobs/{job_id}", response_model=GenerationJobStatus)
async def get_job_status(job_id: str) -> GenerationJobStatus:
    """Récupère le statut d'un job.
    
    Args:
        job_id: ID du job.
        
    Returns:
        Statut du job.
    """
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    return GenerationJobStatus(
        job_id=job['job_id'],
        status=job['status'],
        result=job.get('result'),
        error=job.get('error'),
        created_at=job['created_at'],
        updated_at=job['updated_at'],
    )

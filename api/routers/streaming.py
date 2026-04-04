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
import os
from typing import Annotated, AsyncGenerator, Dict, Any, NamedTuple, Optional
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, Request, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.routers.auth import auth_service, get_current_user
from api.schemas.generation_jobs import GenerationJobCreate, GenerationJobResponse, GenerationJobStatus
from api.services.generation_job_manager import get_job_manager
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator
from api.dependencies import get_unity_dialogue_orchestrator
from api.exceptions import AuthenticationException
from api.config.security_config import get_security_config
from api.utils.sse_job_token import create_sse_job_token, verify_sse_job_token
from api.middleware.billable_user_context import push_billable_user_id, reset_billable_user_id
from api.utils.debug_agent_ndjson import write_agent_debug_log

logger = logging.getLogger(__name__)

_DEBUG_LOG = "debug-d08897.log"

router = APIRouter()

_bearer_optional = HTTPBearer(auto_error=False)


class SSEStreamAuth(NamedTuple):
    """Utilisateur authentifié pour le SSE et indicateur jeton job (évite IDOR Bearer)."""

    user: dict
    authenticated_via_sse_token: bool


def _security_skips_job_ownership() -> bool:
    """Dev local avec auth désactivée : pas de contrôle propriétaire (voir AGENTS.md)."""
    cfg = get_security_config()
    return bool(cfg.is_development and cfg.disable_auth)


def _job_owner_label(user: dict) -> str:
    """Clé alignée sur ``owner_username`` stocké à la création du job."""
    return str(user.get("username") or user.get("id") or "")


def _ensure_job_owned_by(job: Dict[str, Any], user: dict) -> None:
    """Vérifie que l'utilisateur est le propriétaire du job (routes REST)."""
    if _security_skips_job_ownership():
        return
    owner = job.get("owner_username")
    if owner is None:
        return
    if _job_owner_label(user) != owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé au propriétaire du job",
        )


def _ensure_stream_allowed_for_job(job: Dict[str, Any], stream_auth: SSEStreamAuth) -> None:
    """SSE : jeton ``sse_token`` OK ; Bearer exige même utilisateur que ``owner_username``."""
    if _security_skips_job_ownership():
        return
    if stream_auth.authenticated_via_sse_token:
        return
    owner = job.get("owner_username")
    if owner is None:
        return
    if _job_owner_label(stream_auth.user) != owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé au propriétaire du job",
        )


async def authenticate_sse_stream(
    job_id: str,
    request: Request,
    sse_token: Optional[str] = Query(
        None,
        description="Jeton JWT court (émis à la création du job) pour EventSource sans header Authorization.",
    ),
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(_bearer_optional),
    ] = None,
) -> SSEStreamAuth:
    """Authentifie le GET SSE : query ``sse_token`` ou Bearer access token."""
    security_config = get_security_config()
    if security_config.is_development and security_config.disable_auth:
        return SSEStreamAuth(
            user={
                "id": "1",
                "username": "admin",
                "email": "admin@example.com",
            },
            authenticated_via_sse_token=False,
        )

    request_id = getattr(request.state, "request_id", "unknown")
    # region agent log
    write_agent_debug_log(
        log_filename=_DEBUG_LOG,
        hypothesis_id="H3",
        location="streaming.py:authenticate_sse_stream:entry",
        message="sse_auth_request",
        data={
            "pid": os.getpid(),
            "job_id": job_id,
            "has_sse_token": bool(sse_token),
            "sse_token_len": len(sse_token) if sse_token else 0,
            "has_bearer": credentials is not None,
        },
    )
    # endregion agent log

    if sse_token:
        payload = verify_sse_job_token(sse_token, job_id)
        if payload:
            username = payload.get("sub")
            if username:
                user = auth_service.get_user_by_username(username)
                if user:
                    # region agent log
                    write_agent_debug_log(
                        log_filename=_DEBUG_LOG,
                        hypothesis_id="H1",
                        location="streaming.py:authenticate_sse_stream",
                        message="auth_ok_sse_token",
                        data={
                            "pid": os.getpid(),
                            "job_id": job_id,
                            "username": username,
                        },
                    )
                    # endregion agent log
                    return SSEStreamAuth(user=user, authenticated_via_sse_token=True)
                # region agent log
                write_agent_debug_log(
                    log_filename=_DEBUG_LOG,
                    hypothesis_id="H2",
                    location="streaming.py:authenticate_sse_stream",
                    message="user_not_found_after_valid_jwt",
                    data={"pid": os.getpid(), "job_id": job_id, "username": username},
                )
                # endregion agent log

    if credentials is not None:
        pl = auth_service.verify_token(credentials.credentials, token_type="access")
        if pl is not None:
            username = pl.get("sub")
            if username:
                user = auth_service.get_user_by_username(username)
                if user:
                    # region agent log
                    write_agent_debug_log(
                        log_filename=_DEBUG_LOG,
                        hypothesis_id="H5",
                        location="streaming.py:authenticate_sse_stream",
                        message="auth_ok_bearer",
                        data={"pid": os.getpid(), "job_id": job_id},
                    )
                    # endregion agent log
                    return SSEStreamAuth(user=user, authenticated_via_sse_token=False)

    # region agent log
    write_agent_debug_log(
        log_filename=_DEBUG_LOG,
        hypothesis_id="H1",
        location="streaming.py:authenticate_sse_stream",
        message="auth_failed_401_pending",
        data={
            "pid": os.getpid(),
            "job_id": job_id,
            "had_sse_token": bool(sse_token),
        },
    )
    # endregion agent log
    raise AuthenticationException(
        message="Authentification requise pour le flux SSE (sse_token ou Bearer)",
        request_id=request_id,
    )

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
                meta: Dict[str, Any] = {"type": "metadata", **event.data}
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


async def stream_generation_with_billable_user(
    job_id: str,
    orchestrator: UnityDialogueOrchestrator,
    billable_user_id: str,
) -> AsyncGenerator[str, None]:
    """Enveloppe ``stream_generation`` avec le bon ``get_billable_user_id()`` pour le flux SSE.

    Le middleware ne voit pas de Bearer sur les requêtes ``EventSource`` ; sans cette
    enveloppe, l'usage LLM serait attribué à ``default_user`` au lieu du propriétaire du job.

    Args:
        job_id: Identifiant du job.
        orchestrator: Orchestrateur Unity.
        billable_user_id: Même identifiant que pour la création du job (username ou id).

    Yields:
        Chunks SSE identiques à ``stream_generation``.
    """
    var_token = push_billable_user_id(billable_user_id)
    try:
        async for chunk in stream_generation(job_id, orchestrator):
            yield chunk
    finally:
        reset_billable_user_id(var_token)


@router.post(
    "/generate/jobs",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_generation_job(
    job_data: GenerationJobCreate,
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)],
) -> GenerationJobResponse:
    """Crée un nouveau job de génération Unity Dialogue.
    
    Args:
        job_data: Paramètres de génération (identiques à l'endpoint REST).
        request: Requête HTTP (pour construire l'URL de streaming).
        current_user: Utilisateur authentifié (émission du jeton SSE).
        
    Returns:
        Job créé avec job_id et stream_url.
    """
    job_manager = get_job_manager()

    owner_username = _job_owner_label(current_user)
    job_id = job_manager.create_job(
        job_data.model_dump(mode='json'),
        owner_username=owner_username,
    )
    # region agent log
    write_agent_debug_log(
        log_filename=_DEBUG_LOG,
        hypothesis_id="H4",
        location="streaming.py:create_generation_job",
        message="job_created",
        data={"pid": os.getpid(), "job_id": job_id, "owner": owner_username},
    )
    # endregion agent log

    sse_token = create_sse_job_token(job_id=job_id, username=owner_username)
    stream_url = (
        f"/api/v1/dialogues/generate/jobs/{job_id}/stream?sse_token={quote_plus(sse_token)}"
    )
    
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
    stream_auth: Annotated[SSEStreamAuth, Depends(authenticate_sse_stream)],
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
    # region agent log
    write_agent_debug_log(
        log_filename=_DEBUG_LOG,
        hypothesis_id="H4",
        location="streaming.py:stream_job",
        message="stream_job_lookup",
        data={
            "pid": os.getpid(),
            "job_id": job_id,
            "job_found": bool(job),
        },
    )
    # endregion agent log

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    _ensure_stream_allowed_for_job(job, stream_auth)

    billable_uid = _job_owner_label(stream_auth.user) or "user"

    return StreamingResponse(
        stream_generation_with_billable_user(job_id, orchestrator, billable_uid),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Désactiver le buffering nginx
        },
    )


@router.post("/generate/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    _user: Annotated[dict, Depends(get_current_user)],
) -> Dict[str, Any]:
    """Annule un job de génération en cours.
    
    Args:
        job_id: ID du job à annuler.
        
    Returns:
        Statut de l'annulation.
    """
    job_manager = get_job_manager()
    
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    _ensure_job_owned_by(job, _user)

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
async def get_job_status(
    job_id: str,
    _user: Annotated[dict, Depends(get_current_user)],
) -> GenerationJobStatus:
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

    _ensure_job_owned_by(job, _user)

    return GenerationJobStatus(
        job_id=job['job_id'],
        status=job['status'],
        result=job.get('result'),
        error=job.get('error'),
        created_at=job['created_at'],
        updated_at=job['updated_at'],
    )

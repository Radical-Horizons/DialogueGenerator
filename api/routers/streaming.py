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
from typing import Annotated, AsyncGenerator, Dict, Any, NamedTuple, Optional
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, Header, Request, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.routers.auth import get_current_user
from api.schemas.generation_jobs import GenerationJobCreate, GenerationJobResponse, GenerationJobStatus
from api.services.generation_job_manager import (
    CANCELLED_EVENT,
    get_job_manager,
    has_terminal_event,
)
from api.services.auth_service import AuthService
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator
from api.dependencies import get_auth_service, get_unity_dialogue_orchestrator, require_non_guest
from api.exceptions import AuthenticationException
from api.config.security_config import get_security_config
from api.utils.sse_job_token import create_sse_job_token, verify_sse_job_token
from api.middleware.billable_user_context import push_billable_user_id, reset_billable_user_id
from api.utils.job_ownership import job_owner_key

logger = logging.getLogger(__name__)

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
    return job_owner_key(user)


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
    auth_service: Annotated[
        AuthService,
        Depends(get_auth_service),
    ],
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

    if sse_token:
        payload = verify_sse_job_token(
            sse_token,
            job_id,
            auth_service=auth_service,
        )
        if payload:
            username = payload.get("sub")
            if isinstance(username, str) and username:
                user = auth_service.get_user_by_username(username)
                if user:
                    return SSEStreamAuth(user=user, authenticated_via_sse_token=True)

    if credentials is not None:
        pl = auth_service.verify_token(credentials.credentials, token_type="access")
        if pl is not None:
            username = pl.get("sub")
            if isinstance(username, str) and username:
                user = auth_service.get_user_by_username(username)
                if user:
                    return SSEStreamAuth(user=user, authenticated_via_sse_token=False)

    raise AuthenticationException(
        message="Authentification requise pour le flux SSE (sse_token ou Bearer)",
        request_id=request_id,
    )

# Constante pour timeout d'annulation (10 secondes) - Story 0.8
CANCEL_TIMEOUT_SECONDS = 10

# Les jobs vivent en mémoire : un job inconnu est presque toujours un job perdu au redémarrage.
GENERATION_LOST_MESSAGE = (
    "Génération introuvable : le serveur a redémarré depuis son lancement, elle est perdue."
)


# Un proxy (Vite en dev, nginx en prod) peut garder la connexion du navigateur ouverte
# alors que l'API est tombée : sans battement, le client attendrait indéfiniment.
SSE_HEARTBEAT_SECONDS = 5.0
SSE_HEARTBEAT = "event: ping\ndata: {}\n\n"


def _parse_last_event_id(raw: Optional[str]) -> Optional[int]:
    """Lit l'en-tête ``Last-Event-ID`` envoyé par ``EventSource`` à la reconnexion."""
    if raw is None:
        return None
    try:
        value = int(raw.strip())
    except ValueError:
        return None
    return value if value >= 0 else None


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


def _sse(payload: Dict[str, Any], event_id: Optional[int] = None) -> str:
    """Formate un événement SSE ; ``id`` permet la reprise via ``Last-Event-ID``."""
    data = json.dumps(payload, ensure_ascii=False)
    if event_id is None:
        return f"data: {data}\n\n"
    return f"id: {event_id}\ndata: {data}\n\n"


async def run_generation(job_id: str, orchestrator: UnityDialogueOrchestrator) -> None:
    """Exécute la génération d'un job et écrit chaque événement dans son journal.

    Tourne dans sa propre tâche, indépendante des connexions SSE : un rechargement de
    page ferme le flux, pas la génération. Seule l'annulation explicite l'arrête.

    Args:
        job_id: ID du job à exécuter.
        orchestrator: Orchestrateur Unity injecté via dépendance.
    """
    from datetime import datetime, timezone
    from api.schemas.dialogue import GenerateUnityDialogueRequest

    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)
    if not job:
        return

    current_step = "queued"
    try:
        request_data = GenerateUnityDialogueRequest(**job['params'])

        async for event in orchestrator.generate_with_events(
            request_data,
            check_cancelled=lambda: job_manager.is_cancelled(job_id)
        ):
            if event.type == 'chunk':
                payload: Dict[str, Any] = {"type": "chunk", "content": event.data.get("content", "")}
                chunk_sequence = event.data.get("sequence", None)
                if chunk_sequence is not None:
                    payload["sequence"] = chunk_sequence
                job_manager.append_event(job_id, payload)
                await asyncio.sleep(0)
            elif event.type == 'step':
                current_step = event.data.get("step", "unknown")
                job_manager.append_event(job_id, {"type": "step", "step": current_step})
            elif event.type == 'metadata':
                meta: Dict[str, Any] = {"type": "metadata", **event.data}
                if event.data.get("used_fallback"):
                    meta["used_fallback"] = True
                    meta["fallback_from"] = event.data.get("fallback_from", "")
                    meta["fallback_to"] = event.data.get("fallback_to", "")
                job_manager.append_event(job_id, meta)
            elif event.type == 'complete':
                job_manager.update_status(job_id, "completed", result=event.data['result'])
                job_manager.append_event(job_id, {"type": "complete", "result": event.data["result"]})

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
                # Une seule génération par job (génération multiple repoussée).
                return
            elif event.type == 'error':
                error_code = event.data.get("code")
                if error_code == "cancelled" or job_manager.is_cancelled(job_id):
                    job_manager.update_status(job_id, "cancelled", error=event.data['message'])
                else:
                    job_manager.update_status(job_id, "error", error=event.data['message'])
                error_payload: Dict[str, Any] = {"type": "error", "message": event.data["message"]}
                if error_code:
                    error_payload["code"] = error_code
                job_manager.append_event(job_id, error_payload)
                return

        if not has_terminal_event(job):
            job_manager.update_status(job_id, "error", error="Génération terminée sans résultat")
            job_manager.append_event(
                job_id, {"type": "error", "message": "Génération terminée sans résultat"}
            )

    except asyncio.CancelledError:
        duration_seconds = _calculate_duration(job)
        now = datetime.now(timezone.utc)

        job_manager.update_status(job_id, "cancelled", error="Génération annulée")
        job_manager.append_event(job_id, dict(CANCELLED_EVENT))

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
        raise
    except Exception as e:
        logger.exception(f"Error streaming job {job_id}: {e}")
        job_manager.update_status(job_id, "error", error=str(e))
        job_manager.append_event(job_id, {"type": "error", "message": str(e)})
    finally:
        if job_id in job_manager._tasks:
            job_manager.unregister_task(job_id)


async def stream_generation(
    job_id: str,
    orchestrator: UnityDialogueOrchestrator,
    last_event_id: Optional[int] = None,
) -> AsyncGenerator[str, None]:
    """Flux SSE d'un job : démarre la génération au premier abonné, puis suit son journal.

    Le journal est rejoué depuis le début (ou depuis ``last_event_id`` + 1 quand
    ``EventSource`` se reconnecte), si bien qu'un client revenu après un F5 retrouve
    le texte déjà produit puis la suite, ou le résultat si le job a fini entre-temps.
    Fermer ce flux n'arrête pas la génération.

    Args:
        job_id: ID du job à streamer.
        orchestrator: Orchestrateur Unity injecté via dépendance.
        last_event_id: Dernier événement reçu par le client (en-tête ``Last-Event-ID``).

    Yields:
        Chunks SSE au format ``id: N`` puis ``data: {...}``.
    """
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)

    if not job:
        yield _sse({"type": "error", "message": GENERATION_LOST_MESSAGE, "code": "not_found"})
        return

    if job.get("status") == "queued":
        claimed = await job_manager.try_claim_stream_job(job_id)
        if claimed:
            task = asyncio.create_task(run_generation(job_id, orchestrator))
            job_manager.register_task(job_id, task)
        elif job.get("status") == "queued":
            logger.warning(
                "Stream non réservé pour job %s (statut=%s)",
                job_id,
                job.get("status"),
                extra={"job_id": job_id, "status": job.get("status")},
            )
            yield _sse({"type": "error", "message": "Impossible de démarrer le flux pour ce job"})
            return

    start_index = 0 if last_event_id is None else last_event_id + 1
    async for item in job_manager.follow_events(
        job_id, start_index, idle_timeout=SSE_HEARTBEAT_SECONDS
    ):
        if item is None:
            yield SSE_HEARTBEAT
            continue
        index, payload = item
        yield _sse(payload, index)

    job_now = job_manager.get_job(job_id)
    if job_now is not None and not has_terminal_event(job_now):
        status_now = job_now.get("status")
        message = job_now.get("error") or f"Job en état terminal: {status_now}"
        yield _sse({"type": "error", "message": message, "code": status_now})


async def stream_generation_with_billable_user(
    job_id: str,
    orchestrator: UnityDialogueOrchestrator,
    billable_user_id: str,
    last_event_id: Optional[int] = None,
) -> AsyncGenerator[str, None]:
    """Enveloppe ``stream_generation`` avec le bon ``get_billable_user_id()`` pour le flux SSE.

    Le middleware ne voit pas de Bearer sur les requêtes ``EventSource`` ; sans cette
    enveloppe, l'usage LLM serait attribué à ``default_user`` au lieu du propriétaire du job.

    Args:
        job_id: Identifiant du job.
        orchestrator: Orchestrateur Unity.
        billable_user_id: Même identifiant que pour la création du job (username ou id).
        last_event_id: Dernier événement reçu par le client, pour la reprise.

    Yields:
        Chunks SSE identiques à ``stream_generation``.
    """
    var_token = push_billable_user_id(billable_user_id)
    try:
        async for chunk in stream_generation(job_id, orchestrator, last_event_id):
            yield chunk
    finally:
        try:
            reset_billable_user_id(var_token)
        except ValueError:
            # Client parti (F5, onglet fermé) : le générateur est finalisé dans un autre
            # contexte, que le jeton ne peut pas restaurer. Ce contexte-là est abandonné,
            # il n'y a rien à remettre en place.
            logger.debug("Flux SSE %s fermé hors de son contexte d'origine", job_id)


@router.post(
    "/generate/jobs",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_generation_job(
    job_data: GenerationJobCreate,
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> GenerationJobResponse:
    """Crée un nouveau job de génération Unity Dialogue.
    
    Args:
        job_data: Paramètres de génération (identiques à l'endpoint REST).
        request: Requête HTTP (pour construire l'URL de streaming).
        current_user: Utilisateur authentifié (émission du jeton SSE).
        
    Returns:
        Job créé avec job_id et stream_url.
    """
    require_non_guest(current_user)
    job_manager = get_job_manager()

    owner_username = _job_owner_label(current_user)
    job_id = job_manager.create_job(
        job_data.model_dump(mode='json'),
        owner_username=owner_username,
    )

    sse_token = create_sse_job_token(
        job_id=job_id,
        username=owner_username,
        auth_service=auth_service,
    )
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
    last_event_id: Annotated[Optional[str], Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    """Endpoint SSE pour streamer la génération d'un job.

    Un job inconnu répond quand même en SSE, par un événement ``error`` : un
    ``EventSource`` ne lit pas le corps d'un 404, et l'utilisateur doit savoir que
    sa génération a été perdue (redémarrage du serveur) plutôt que voir un échec muet.

    Args:
        job_id: ID du job à streamer.
        last_event_id: En-tête envoyé par ``EventSource`` à la reconnexion.

    Returns:
        StreamingResponse avec chunks SSE.
    """
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)

    if job:
        _ensure_stream_allowed_for_job(job, stream_auth)

    billable_uid = _job_owner_label(stream_auth.user) or "user"

    return StreamingResponse(
        stream_generation_with_billable_user(
            job_id, orchestrator, billable_uid, _parse_last_event_id(last_event_id)
        ),
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

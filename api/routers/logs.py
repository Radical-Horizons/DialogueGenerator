"""Router pour la consultation et gestion des logs."""
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request

from api.routers.auth import get_current_user
from pydantic import BaseModel

from api.dependencies import get_request_id
from api.services.log_service import LogService
from constants import FilePaths

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/logs",
    tags=["Logs"],
    dependencies=[Depends(get_current_user)],
)


# Schémas de requête/réponse
class LogEntry(BaseModel):
    """Modèle pour une entrée de log."""
    timestamp: str
    level: str
    logger: str
    message: str
    module: Optional[str] = None
    function: Optional[str] = None
    line: Optional[int] = None
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    status_code: Optional[int] = None
    duration_ms: Optional[int] = None
    environment: Optional[str] = None
    exception: Optional[str] = None
    exception_type: Optional[str] = None


class LogSearchResponse(BaseModel):
    """Réponse pour la recherche de logs."""
    logs: list[LogEntry]
    total: int
    limit: int
    offset: int


class LogStatisticsResponse(BaseModel):
    """Réponse pour les statistiques de logs."""
    total_logs: int
    date_range: dict
    by_level: dict
    by_day: dict
    by_logger: dict


class LogFileInfo(BaseModel):
    """Informations sur un fichier de log."""
    filename: str
    date: str
    size_bytes: int
    entry_count: int


class FrontendLogRequest(BaseModel):
    """Requête pour recevoir un log frontend."""
    level: str
    message: str
    timestamp: Optional[str] = None
    logger: Optional[str] = None
    error: Optional[dict] = None
    context: Optional[dict] = None


# Dépendances
def get_log_service() -> LogService:
    """Retourne une instance du service de logs.
    
    Returns:
        Instance de LogService.
    """
    log_dir = str(FilePaths.LOGS_DIR)
    return LogService(log_dir=log_dir)


# Endpoints
@router.get("", response_model=LogSearchResponse)
async def search_logs(
    request: Request,
    log_service: LogService = Depends(get_log_service),
    request_id: str = Depends(get_request_id),
    start_date: Optional[date] = Query(
        default=None,
        description="Date de début (incluse). Par défaut: 30 jours avant aujourd'hui."
    ),
    end_date: Optional[date] = Query(
        default=None,
        description="Date de fin (incluse). Par défaut: aujourd'hui."
    ),
    level: Optional[str] = Query(
        default=None,
        description="Niveau de log (DEBUG, INFO, WARNING, ERROR, CRITICAL)."
    ),
    logger_name: Optional[str] = Query(
        default=None,
        description="Nom du logger (ex: 'api.middleware')."
    ),
    request_id_filter: Optional[str] = Query(
        default=None,
        alias="request_id",
        description="ID de requête pour filtrer."
    ),
    endpoint: Optional[str] = Query(
        default=None,
        description="Endpoint API pour filtrer."
    ),
    limit: int = Query(
        default=100,
        ge=1,
        le=1000,
        description="Nombre maximum de résultats (1-1000)."
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Nombre de résultats à ignorer (pagination)."
    )
) -> LogSearchResponse:
    """Recherche des logs selon des critères.
    
    Args:
        request: La requête HTTP.
        log_service: Service de logs (injection de dépendance).
        request_id: ID de la requête actuelle.
        start_date: Date de début.
        end_date: Date de fin.
        level: Niveau de log.
        logger_name: Nom du logger.
        request_id_filter: ID de requête pour filtrer.
        endpoint: Endpoint API.
        limit: Nombre maximum de résultats.
        offset: Offset pour pagination.
        
    Returns:
        Réponse avec logs filtrés et paginés.
    """
    try:
        logs, total = log_service.search_logs(
            start_date=start_date,
            end_date=end_date,
            level=level,
            logger_name=logger_name,
            request_id=request_id_filter,
            endpoint=endpoint,
            limit=limit,
            offset=offset
        )
        
        # Convertir les logs en modèles Pydantic
        log_entries = [LogEntry(**log) for log in logs]
        
        return LogSearchResponse(
            logs=log_entries,
            total=total,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la recherche de logs (request_id: {request_id}): {e}")
        raise


@router.get("/stats", response_model=LogStatisticsResponse)
async def get_log_statistics(
    request: Request,
    log_service: LogService = Depends(get_log_service),
    request_id: str = Depends(get_request_id),
    start_date: Optional[date] = Query(
        default=None,
        description="Date de début (incluse). Par défaut: 30 jours avant aujourd'hui."
    ),
    end_date: Optional[date] = Query(
        default=None,
        description="Date de fin (incluse). Par défaut: aujourd'hui."
    )
) -> LogStatisticsResponse:
    """Récupère des statistiques sur les logs.
    
    Args:
        request: La requête HTTP.
        log_service: Service de logs (injection de dépendance).
        request_id: ID de la requête actuelle.
        start_date: Date de début.
        end_date: Date de fin.
        
    Returns:
        Statistiques sur les logs.
    """
    try:
        stats = log_service.get_statistics(
            start_date=start_date,
            end_date=end_date
        )
        return LogStatisticsResponse(**stats)
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération des statistiques (request_id: {request_id}): {e}")
        raise


@router.get("/files", response_model=list[LogFileInfo])
async def list_log_files(
    request: Request,
    log_service: LogService = Depends(get_log_service),
    request_id: str = Depends(get_request_id)
) -> list[LogFileInfo]:
    """Liste les fichiers de logs disponibles.
    
    Args:
        request: La requête HTTP.
        log_service: Service de logs (injection de dépendance).
        request_id: ID de la requête actuelle.
        
    Returns:
        Liste des fichiers de logs avec leurs informations.
    """
    try:
        files = log_service.list_log_files()
        return [LogFileInfo(**file_info) for file_info in files]
    except Exception as e:
        logger.exception(f"Erreur lors de la liste des fichiers (request_id: {request_id}): {e}")
        raise


@router.post("/frontend")
async def receive_frontend_log(
    request: Request,
    log_data: FrontendLogRequest,
    request_id: str = Depends(get_request_id)
) -> dict:
    """Reçoit un log depuis le frontend et l'enregistre.
    
    Args:
        request: La requête HTTP.
        log_data: Données du log frontend.
        request_id: ID de la requête actuelle.
        
    Returns:
        Confirmation de réception.
    """
    try:
        # Enrichir le log avec des informations du contexte
        import os
        from datetime import datetime, timezone
        
        log_entry = {
            "timestamp": log_data.timestamp or datetime.now(timezone.utc).isoformat() + "Z",
            "level": log_data.level.upper(),
            "logger": log_data.logger or "frontend",
            "message": log_data.message,
            "module": "frontend",
            "function": None,
            "line": None,
            "request_id": request_id,
            "environment": os.getenv("ENVIRONMENT", "development"),
            "user_agent": request.headers.get("user-agent"),
            "url": str(request.url) if hasattr(request, "url") else None
        }
        
        # Ajouter les erreurs si présentes
        if log_data.error:
            log_entry["exception"] = str(log_data.error)
            log_entry["exception_type"] = log_data.error.get("name", "Error")
        
        # Ajouter le contexte supplémentaire
        if log_data.context:
            log_entry["context"] = log_data.context
        
        # Écrire le log via le système de logging standard
        # Utiliser le logger approprié selon le niveau
        frontend_logger = logging.getLogger("frontend")
        log_level = getattr(logging, log_data.level.upper(), logging.INFO)
        frontend_logger.log(
            log_level,
            log_data.message,
            extra={
                "request_id": request_id,
                "frontend_log": True,
                "error": log_data.error,
                "context": log_data.context
            }
        )
        
        return {
            "status": "ok",
            "message": "Log frontend enregistré",
            "request_id": request_id
        }
    except Exception as e:
        logger.exception(f"Erreur lors de l'enregistrement du log frontend (request_id: {request_id}): {e}")
        raise



"""Middleware pour l'API FastAPI."""
import os
import uuid
import time
import logging
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from services.repositories.sqlite.state import get_database_status

logger = logging.getLogger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware pour générer et ajouter un ID de requête à chaque requête."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Ajoute un request_id à chaque requête.
        
        Args:
            request: La requête HTTP.
            call_next: La fonction suivante dans la chaîne middleware.
            
        Returns:
            La réponse HTTP avec le request_id dans les headers.
        """
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        
        return response


class DatabaseReadinessMiddleware(BaseHTTPMiddleware):
    """Refuse les routes métier tant que SQLite n'est pas prête."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Retourne 503 pour les routes API dépendantes d'une base indisponible."""
        path = request.url.path
        is_health_route = path in {
            "/health",
            "/health/detailed",
            "/api/v1/healthcheck",
        }
        is_auth_route = path.startswith("/api/v1/auth/")
        if path.startswith("/api/v1/") and not is_health_route and not is_auth_route:
            database_status = get_database_status()
            if not database_status.ready:
                message = (
                    f"Base SQLite indisponible: {database_status.error}"
                    if database_status.error
                    else "Base SQLite indisponible"
                )
                return JSONResponse(
                    status_code=503,
                    content={
                        "error": {
                            "code": "DATABASE_UNAVAILABLE",
                            "message": message,
                            "details": {},
                            "request_id": getattr(request.state, "request_id", "unknown"),
                        }
                    },
                    headers={"Retry-After": "5"},
                )
        return await call_next(request)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware pour logger les requêtes HTTP avec contexte structuré."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Log les requêtes HTTP avec timing et contexte enrichi.
        
        Args:
            request: La requête HTTP.
            call_next: La fonction suivante dans la chaîne middleware.
            
        Returns:
            La réponse HTTP.
        """
        from api.middleware.logging_context import add_logging_context_to_record
        
        request_id = getattr(request.state, "request_id", "unknown")
        start_time = time.time()
        path = request.url.path
        
        # Log de debug uniquement si DEBUG_MIDDLEWARE=true
        if os.getenv("DEBUG_MIDDLEWARE", "false").lower() in ("true", "1", "yes") and "/estimate-tokens" in path:
            import sys
            uvicorn_log = logging.getLogger("uvicorn.error")
            uvicorn_log.warning(f"=== LoggingMiddleware HIT: {request.method} {path} request_id={request_id} ===")
            print(f"=== LoggingMiddleware HIT: {request.method} {path} request_id={request_id} ===", file=sys.stderr, flush=True)
        
        request_logger = logging.getLogger("api.middleware")
        extra = {
            "request_id": request_id,
            "endpoint": path,
            "method": request.method,
            "client": request.client.host if request.client else "unknown"
        }
        
        # Niveaux et filtres (réduction de bruit en dev)
        # - HTTP_LOG_LEVEL contrôle le niveau mini pour loguer les succès (2xx/3xx)
        # - HTTP_SLOW_MS loggue en INFO au-dessus du seuil (même si succès)
        http_log_level = os.getenv("HTTP_LOG_LEVEL", "WARNING").upper()
        try:
            slow_ms = int(os.getenv("HTTP_SLOW_MS", "1500"))
        except ValueError:
            slow_ms = 1500
        
        # Exclure /health par défaut (sauf si erreur)
        is_health = path == "/health" or path.startswith("/health/")
        
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            duration_ms = int(process_time * 1000)
            
            # Log de la réponse avec contexte
            response_extra = {
                "request_id": request_id,
                "endpoint": path,
                "method": request.method,
                "status_code": response.status_code,
                "duration_ms": duration_ms
            }
            
            status_code = response.status_code
            
            # Skip total pour /health en succès (trop bruyant avec polling)
            if is_health and status_code < 400:
                response.headers["X-Process-Time"] = str(process_time)
                return response
            
            # Choisir le niveau selon statut / lenteur
            if status_code >= 500:
                log_fn = request_logger.error
            elif status_code >= 400:
                log_fn = request_logger.warning
            elif duration_ms >= slow_ms:
                log_fn = request_logger.info
            else:
                # Succès normal: DEBUG par défaut (ou selon HTTP_LOG_LEVEL)
                if http_log_level == "DEBUG":
                    log_fn = request_logger.debug
                elif http_log_level == "INFO":
                    log_fn = request_logger.info
                elif http_log_level == "WARNING":
                    log_fn = request_logger.debug
                elif http_log_level == "ERROR":
                    log_fn = request_logger.debug
                elif http_log_level == "CRITICAL":
                    log_fn = request_logger.debug
                else:
                    log_fn = request_logger.debug
            
            log_fn(
                f"HTTP {request.method} {path} -> {status_code} ({duration_ms}ms)",
                extra=response_extra
            )
            
            response.headers["X-Process-Time"] = str(process_time)
            return response
            
        except Exception as e:
            process_time = time.time() - start_time
            duration_ms = int(process_time * 1000)
            
            # Log de l'erreur avec contexte
            error_extra = {
                "request_id": request_id,
                "endpoint": path,
                "method": request.method,
                "duration_ms": duration_ms,
                "exception_type": type(e).__name__
            }
            request_logger.error(
                f"Error: {request.method} {path} Exception: {type(e).__name__}: {str(e)}",
                extra=error_extra,
                exc_info=True
            )
            raise


class CORSMiddleware:
    """Middleware CORS personnalisé (alternative à celui de FastAPI si besoin de plus de contrôle)."""
    
    def __init__(
        self,
        app: ASGIApp,
        allow_origins: list[str] = None,
        allow_credentials: bool = True,
        allow_methods: list[str] = None,
        allow_headers: list[str] = None
    ):
        """Initialise le middleware CORS.
        
        Args:
            app: L'application ASGI.
            allow_origins: Liste des origines autorisées (None = toutes).
            allow_credentials: Autoriser les credentials.
            allow_methods: Méthodes HTTP autorisées (None = toutes).
            allow_headers: Headers autorisés (None = tous).
        """
        self.app = app
        self.allow_origins = allow_origins or ["*"]
        self.allow_credentials = allow_credentials
        self.allow_methods = allow_methods or ["*"]
        self.allow_headers = allow_headers or ["*"]
    
    async def __call__(self, scope, receive, send):
        """Gère les requêtes CORS.
        
        Args:
            scope: Scope ASGI.
            receive: Fonction receive ASGI.
            send: Fonction send ASGI.
        """
        if scope["type"] == "http":
            request = Request(scope, receive)
            
            # Gérer les requêtes OPTIONS (preflight)
            if request.method == "OPTIONS":
                response = Response()
                self._add_cors_headers(response, request)
                await response(scope, receive, send)
                return
        
        await self.app(scope, receive, send)
    
    def _add_cors_headers(self, response: Response, request: Request):
        """Ajoute les headers CORS à la réponse.
        
        Args:
            response: La réponse HTTP.
            request: La requête HTTP.
        """
        origin = request.headers.get("origin")
        
        if "*" in self.allow_origins or (origin and origin in self.allow_origins):
            response.headers["Access-Control-Allow-Origin"] = origin or "*"
        
        if self.allow_credentials:
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        if "*" in self.allow_methods:
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        else:
            response.headers["Access-Control-Allow-Methods"] = ", ".join(self.allow_methods)
        
        if "*" in self.allow_headers:
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Request-ID"
        else:
            response.headers["Access-Control-Allow-Headers"] = ", ".join(self.allow_headers)
        
        response.headers["Access-Control-Max-Age"] = "3600"


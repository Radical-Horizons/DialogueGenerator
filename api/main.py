"""Point d'entrée principal de l'API REST FastAPI."""
import os
import logging
import sys
import asyncio
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware as FastAPICORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from api.middleware import RequestIDMiddleware, LoggingMiddleware
from api.middleware.cost_governance import CostGovernanceMiddleware
from api.exceptions import APIException, ValidationException
from api.dependencies import get_request_id
from api.config.security_config import get_security_config
from api.middleware.rate_limiter import get_limiter, rate_limit_exception_handler

# Charger le fichier .env en dev (éviter sous pytest pour des tests déterministes)
if "pytest" not in sys.modules:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except Exception as exc:
        logging.getLogger(__name__).warning(f"Impossible de charger .env: {exc}")

# Configuration du logging structuré
from api.utils.logging_config import setup_logging
setup_logging()

# Initialiser Sentry si configuré (doit être fait après le logging)
from api.utils.sentry_config import init_sentry
init_sentry()

logger = logging.getLogger(__name__)

# Créer le limiter global (peut être None si désactivé)
limiter = get_limiter()


def _validate_security_config() -> None:
    """Valide la configuration de sécurité au démarrage.
    
    Raises:
        ValueError: Si la configuration est invalide en production.
    """
    try:
        security_config = get_security_config()
        security_config.validate_config()
        # Validation réussie (pas de log nécessaire, seulement les erreurs sont loggées)
    except ValueError as e:
        logger.critical(f"Configuration de sécurité invalide: {e}")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gère le cycle de vie de l'application (startup/shutdown).
    
    Args:
        app: L'application FastAPI.
    """
    try:
        # Startup
        logger.info("Démarrage de l'API DialogueGenerator...")
        logger.info(f"Timestamp: {datetime.now(timezone.utc).isoformat()}Z")
        
        # Debug probe optionnel (désactivé par défaut pour éviter le bruit)
        if os.getenv("STARTUP_PROBE", "false").lower() in ("true", "1", "yes"):
            import logging
            uvicorn_log = logging.getLogger("uvicorn.error")
            uvicorn_log.warning("=== APP STARTUP - CODE LOADED ===")
        
        # Valider la configuration de sécurité
        try:
            _validate_security_config()
        except ValueError:
            logger.critical("L'application ne peut pas démarrer avec une configuration de sécurité invalide.")
            raise
        
        # Nettoyer les anciens logs au démarrage
        try:
            from api.utils.log_cleanup import cleanup_on_startup
            cleanup_on_startup()
        except Exception as e:
            logger.warning(f"Erreur lors du nettoyage des logs au démarrage: {e}")
        
        # Créer le container une seule fois : chargement GDD + validation puis réutilisation pour les requêtes
        try:
            from api.container import ServiceContainer
            from services.context_field_validator import ContextFieldValidator

            container = ServiceContainer()
            context_builder = container.get_context_builder()
            config_service = container.get_config_service()
            context_config = config_service.get_context_config()

            if context_config:
                validator = ContextFieldValidator(context_builder)
                validation_results = validator.validate_all_configs(context_config)

                total_errors = sum(1 for r in validation_results.values() if r.has_errors())
                total_warnings = sum(1 for r in validation_results.values() if r.has_warnings())

                if total_errors > 0 or total_warnings > 0:
                    logger.warning(
                        "Validation des champs GDD: %d erreur(s) critique(s), %d avertissement(s). "
                        "Pour le rapport complet: STARTUP_REPORT=full",
                        total_errors,
                        total_warnings,
                    )

                    startup_report_mode = os.getenv("STARTUP_REPORT", "summary").lower().strip()
                    if startup_report_mode in ("full", "true", "1", "yes"):
                        report = validator.get_validation_report(context_config)
                        logger.warning(f"Validation des champs GDD (rapport complet):\n{report}")

                    environment = os.getenv("ENVIRONMENT", "development")
                    if environment == "production" and total_errors > 0:
                        logger.critical("Champs invalides détectés dans context_config.json - l'application ne peut pas démarrer en production.")
                        raise ValueError(f"Configuration invalide: {total_errors} champs invalides détectés")
                else:
                    logger.info("Validation des champs GDD: tous les champs sont valides")

            app.state.container = container
            logger.info("ServiceContainer initialisé dans app.state (GDD chargé une seule fois).")
        except Exception as e:
            logger.error(f"Erreur lors de l'initialisation du container ou de la validation GDD: {e}", exc_info=True)
            if "container" in locals() and container is not None:
                app.state.container = container
                logger.warning("Container partiellement initialisé stocké dans app.state malgré l'erreur.")
            else:
                raise
        
        # Debug: Liste TOUTES les routes réelles au runtime (seulement si DEBUG_ROUTES=true)
        if os.getenv("DEBUG_ROUTES", "false").lower() in ("true", "1", "yes"):
            from fastapi.routing import APIRoute
            import sys
            log_routes = logging.getLogger("uvicorn.error")
            log_routes.warning("=== TOUTES LES ROUTES API AU RUNTIME ===")
            routes_by_path = {}
            for r in app.routes:
                if isinstance(r, APIRoute):
                    endpoint_str = str(r.endpoint)
                    # Extraire le nom du fichier et de la fonction depuis l'endpoint
                    if hasattr(r.endpoint, '__module__') and hasattr(r.endpoint, '__name__'):
                        endpoint_str = f"{r.endpoint.__module__}.{r.endpoint.__name__}"
                    methods_str = ', '.join(sorted(r.methods)) if r.methods else 'N/A'
                    route_key = f"{methods_str} {r.path}"
                    if route_key not in routes_by_path:
                        routes_by_path[route_key] = []
                    routes_by_path[route_key].append(endpoint_str)
            
            # Trier par chemin pour un affichage ordonné
            for route_key in sorted(routes_by_path.keys()):
                endpoints = routes_by_path[route_key]
                for endpoint in endpoints:
                    log_routes.warning("ROUTE: %s -> %s", route_key, endpoint)
                    print(f"ROUTE: {route_key} -> {endpoint}", file=sys.stderr, flush=True)
            
            log_routes.warning("=== TOTAL: %d routes API ===", len(routes_by_path))
            print(f"=== TOTAL: {len(routes_by_path)} routes API ===", file=sys.stderr, flush=True)
            
            # Liste spécifique pour estimate-tokens
            log_routes.warning("=== ROUTES ESTIMATE-TOKENS ===")
            found_any = False
            for r in app.routes:
                if isinstance(r, APIRoute) and "estimate-tokens" in r.path:
                    found_any = True
                    endpoint_str = str(r.endpoint)
                    if hasattr(r.endpoint, '__module__') and hasattr(r.endpoint, '__name__'):
                        endpoint_str = f"{r.endpoint.__module__}.{r.endpoint.__name__}"
                    log_routes.warning("ROUTE: %s %s -> %s", r.methods, r.path, endpoint_str)
                    print(f"ROUTE: {r.methods} {r.path} -> {endpoint_str}", file=sys.stderr, flush=True)
            if not found_any:
                log_routes.warning("AUCUNE ROUTE estimate-tokens trouvée!")
                print("AUCUNE ROUTE estimate-tokens trouvée!", file=sys.stderr, flush=True)
            log_routes.warning("=== FIN LISTE ROUTES ===")
        # Démarrer la tâche de cleanup des jobs de génération (Story 0.2)
        try:
            from api.services.generation_job_manager import get_job_manager
            job_manager = get_job_manager()
            await job_manager.start_cleanup_task()
            logger.info("Cleanup task des jobs de génération démarrée")
        except Exception as e:
            logger.warning(f"Erreur lors du démarrage de la cleanup task: {e}")
        
        yield
    except (KeyboardInterrupt, asyncio.CancelledError):
        # Gérer proprement les interruptions (Ctrl+C, arrêt du serveur)
        logger.info("Arrêt de l'API DialogueGenerator (interruption)...")
        raise
    except Exception as e:
        # Logger toute autre exception pendant le startup
        logger.error(f"Erreur critique pendant le startup: {e}", exc_info=True)
        raise
    finally:
        # Shutdown
        logger.info("Arrêt de l'API DialogueGenerator...")
        
        # Arrêter la tâche de cleanup des jobs (Story 0.2)
        try:
            from api.services.generation_job_manager import get_job_manager
            job_manager = get_job_manager()
            await job_manager.stop_cleanup_task()
            logger.info("Cleanup task des jobs de génération arrêtée")
        except Exception as e:
            logger.warning(f"Erreur lors de l'arrêt de la cleanup task: {e}")


# Création de l'application FastAPI
app = FastAPI(
    title="DialogueGenerator API",
    description="API REST pour la génération de dialogues IA pour jeux de rôle",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)

# Attacher le limiter à l'app si activé (requis pour que slowapi fonctionne)
if limiter is not None:
    app.state.limiter = limiter

# Configuration CORS
cors_origins_env = os.getenv("CORS_ORIGINS", "")
is_production_env = os.getenv("ENVIRONMENT", "development") == "production"

# En production, lire depuis CORS_ORIGINS (format CSV)
# IMPORTANT: Quand allow_credentials=True, on ne peut pas utiliser "*" - il faut spécifier les origines
if is_production_env and cors_origins_env:
    cors_origins = [origin.strip() for origin in cors_origins_env.split(",")]
    cors_origin_regex = None
else:
    # En développement, accepter localhost et toutes les origines ngrok via regex
    # ngrok utilise des domaines *.ngrok-free.app et *.ngrok.io
    cors_origins = [
        "http://localhost:3000",
        "http://localhost:4242",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4242",
    ]
    # Regex pour accepter toutes les URLs ngrok
    cors_origin_regex = r"https://.*\.ngrok-free\.app|https://.*\.ngrok\.io"

# Configuration du middleware CORS
cors_middleware_kwargs = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if cors_origin_regex:
    cors_middleware_kwargs["allow_origin_regex"] = cors_origin_regex
else:
    cors_middleware_kwargs["allow_origins"] = cors_origins

app.add_middleware(
    FastAPICORSMiddleware,
    **cors_middleware_kwargs
)

# Middleware personnalisés
app.add_middleware(RequestIDMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(CostGovernanceMiddleware)  # Cost governance (Story 0.7)

# Middleware anti-cache en développement (doit être avant le cache HTTP)
if not is_production_env:
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.responses import Response
    
    class DevNoCacheMiddleware(BaseHTTPMiddleware):
        """Middleware qui désactive le cache en développement pour garantir le rafraîchissement."""
        async def dispatch(self, request: Request, call_next):
            response = await call_next(request)
            # Ajouter des headers anti-cache pour toutes les réponses en développement
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            return response
    
    app.add_middleware(DevNoCacheMiddleware)
    logger.info("Middleware anti-cache activé en développement")

# Middleware de cache HTTP (doit être après RequestID et Logging pour avoir les headers)
from api.middleware.http_cache import setup_http_cache
setup_http_cache(app)

# Métriques Prometheus (optionnel)
from api.utils.metrics import setup_prometheus_metrics
prometheus_instrumentator = setup_prometheus_metrics(app)


# Handler pour les erreurs de validation FastAPI/Pydantic
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Gère les erreurs de validation FastAPI/Pydantic.
    
    Transforme le format natif FastAPI en format API standardisé.
    
    Args:
        request: La requête HTTP.
        exc: L'exception de validation.
        
    Returns:
        Réponse JSON avec format d'erreur standardisé.
    """
    request_id = getattr(request.state, "request_id", "unknown")
    
    # Transformer les erreurs Pydantic en format simple : {champ: message}
    errors = exc.errors()
    details = {}
    for err in errors:
        # err["loc"] est une liste comme ("body", "field_name") ou ("query", "param")
        # On prend le dernier élément comme nom de champ
        field_path = ".".join(str(loc) for loc in err["loc"] if loc != "body" and loc != "query")
        if not field_path:
            field_path = ".".join(str(loc) for loc in err["loc"])
        details[field_path] = err["msg"]
    
    # Logger les erreurs de validation
    error_details_full = []
    for err in errors:
        error_details_full.append({
            "loc": list(err.get("loc", [])),
            "msg": err.get("msg", ""),
            "type": err.get("type", ""),
            "ctx": err.get("ctx", {})
        })
    
    logger.error(
        f"Erreur de validation Pydantic (request_id: {request_id}): "
        f"errors={error_details_full}, "
        f"path={request.url.path}"
    )
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Erreur de validation des données",
                "details": details,
                "request_id": request_id
            }
        }
    )


# Handler pour les erreurs de rate limiting (seulement si le limiter est activé)
if limiter is not None:
    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        """Gère les erreurs de rate limiting.
        
        Args:
            request: La requête HTTP.
            exc: L'exception RateLimitExceeded.
            
        Returns:
            Réponse JSON avec erreur 429.
        """
        return await rate_limit_exception_handler(request, exc)


# Handler global d'exceptions
@app.exception_handler(APIException)
async def api_exception_handler(request: Request, exc: APIException) -> JSONResponse:
    """Gère les exceptions API personnalisées.
    
    Args:
        request: La requête HTTP.
        exc: L'exception API.
        
    Returns:
        Réponse JSON avec format d'erreur standardisé.
    """
    request_id = getattr(request.state, "request_id", "unknown")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.detail,
                "details": exc.details,
                "request_id": exc.request_id or request_id
            }
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Gère les exceptions non gérées.
    
    Args:
        request: La requête HTTP.
        exc: L'exception.
        
    Returns:
        Réponse JSON avec erreur générique (détails non exposés en production).
    """
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception(f"Exception non gérée (request_id: {request_id}): {exc}")
    
    # En production, ne pas exposer les détails de l'exception
    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "Une erreur interne s'est produite",
                "details": {} if is_production else {"type": type(exc).__name__, "message": str(exc)},
                "request_id": request_id
            }
        }
    )


# Health check endpoint
@app.get("/health", tags=["Health"])
@app.get("/api/v1/healthcheck", tags=["Health"])  # Alias pour compatibilité avec monitoring
async def health_check() -> JSONResponse:
    """Endpoint de vérification de santé basique de l'API.
    
    Returns:
        Statut de santé basique de l'API (200 si healthy, 503 si unhealthy).
    """
    from api.utils.health_check import perform_health_checks
    
    health_result = perform_health_checks(detailed=False)
    health_result["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"
    health_result["service"] = "DialogueGenerator API"
    
    # Retourner 503 si unhealthy
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE if health_result["status"] == "unhealthy" else status.HTTP_200_OK
    
    return JSONResponse(
        status_code=status_code,
        content=health_result
    )


@app.get("/health/detailed", tags=["Health"])
async def health_check_detailed() -> JSONResponse:
    """Endpoint de vérification de santé détaillé avec toutes les dépendances.
    
    Returns:
        Statut de santé détaillé avec vérification de toutes les dépendances (200 si healthy, 503 si unhealthy).
    """
    from api.utils.health_check import perform_health_checks
    
    health_result = perform_health_checks(detailed=True)
    health_result["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"
    health_result["service"] = "DialogueGenerator API"
    
    # Retourner 503 si unhealthy, 200 même si degraded (l'app fonctionne mais avec limitations)
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE if health_result["status"] == "unhealthy" else status.HTTP_200_OK
    
    return JSONResponse(
        status_code=status_code,
        content=health_result
    )


# Inclusion des routers
from api.routers import auth, dialogues, context, config, llm_usage, unity_dialogues, documents, logs, mechanics_flags, graph, streaming, presets, costs

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(dialogues.router, prefix="/api/v1/dialogues", tags=["Dialogues"])
app.include_router(streaming.router, prefix="/api/v1/dialogues", tags=["Dialogues"])  # SSE streaming (Story 0.2)
app.include_router(unity_dialogues.router, prefix="/api/v1/unity-dialogues", tags=["Unity Dialogues"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["Documents"])
app.include_router(context.router, prefix="/api/v1/context", tags=["Context"])
app.include_router(config.router, prefix="/api/v1/config", tags=["Configuration"])
app.include_router(llm_usage.router, prefix="/api/v1/llm-usage", tags=["LLM Usage"])
app.include_router(costs.router, prefix="/api/v1/costs", tags=["Cost Governance"])
app.include_router(logs.router)

# Routers pour vocabulaire et guides narratifs
from api.routers import vocabulary, narrative_guides
app.include_router(vocabulary.router)
app.include_router(narrative_guides.router)

# Router pour les mechanics (flags in-game)
app.include_router(mechanics_flags.router)

# Router pour l'éditeur de graphe
app.include_router(graph.router)

# Router pour les presets de génération
app.include_router(presets.router, prefix="/api/v1/presets", tags=["Presets"])

# Debug endpoint (dev only): inspect PromptEngine code loaded by server
@app.get("/debug/prompt-engine", tags=["Debug"])
async def debug_prompt_engine() -> JSONResponse:
    """Expose basic PromptEngine debug info (development only)."""
    import inspect
    import core.prompt.prompt_engine as pe_module
    from core.prompt.prompt_engine import PromptEngine

    try:
        src = inspect.getsource(PromptEngine.build_prompt)
    except Exception:
        src = ""

    return JSONResponse(
        content={
            "prompt_engine_module_file": getattr(pe_module, "__file__", None),
            "has_prompt_input_parameter": "PromptInput" in src,
            "has_xml_format": "<prompt>" in src or 'create_xml_document' in src,
        }
    )

# Servir le frontend statique si le dossier dist existe (APRÈS les routes API)
# Fonctionne en production ET en development si le frontend est buildé
try:
    from fastapi.staticfiles import StaticFiles
    from pathlib import Path
    
    # Chemin vers le dossier dist du frontend
    frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
    
    if frontend_dist.exists():
        app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")
        logger.info(f"Frontend statique monté depuis: {frontend_dist} (mode: {os.getenv('ENVIRONMENT', 'development')})")
    else:
        logger.warning(f"Dossier frontend/dist introuvable: {frontend_dist}")
        logger.info("Le frontend ne sera pas servi. Builder le frontend avec 'npm run deploy:build' pour l'activer.")
except ImportError:
    logger.warning("StaticFiles non disponible, le frontend ne sera pas servi")
except Exception as e:
    logger.error(f"Erreur lors du montage du frontend statique: {e}")


if __name__ == "__main__":
    import uvicorn
    from pathlib import Path
    
    # ⚠️ AVERTISSEMENT : Pour le développement, utiliser 'npm run dev' à la racine du projet
    # Ce script lance uniquement le backend. Pour lancer backend + frontend ensemble, utiliser 'npm run dev'
    # L'ouverture automatique du navigateur est désactivée
    # Le script dev.js gère l'ouverture du navigateur pour le frontend
    
    # Désactiver le reload automatique si RELOAD=false dans l'environnement
    # Par défaut, reload=True en développement pour recharger automatiquement
    enable_reload = os.getenv("RELOAD", "true").lower() not in ("false", "0", "no", "off")
    
    # Configuration du reload pour éviter les redémarrages trop fréquents
    reload_config = {}
    if enable_reload:
        # Limiter la surveillance aux dossiers pertinents (évite les redémarrages
        # lors de modifications dans frontend/, tests/, docs/, etc.)
        project_root = Path(__file__).parent.parent
        reload_dirs = [
            # Inclure la racine pour capter les modules "top-level" (ex: prompt_engine.py)
            # tout en excluant explicitement les dossiers bruyants ci-dessous.
            str(project_root),
            str(project_root / "api"),
            str(project_root / "services"),
            str(project_root / "core"),
            str(project_root / "domain"),
        ]
        # Vérifier que les dossiers existent
        reload_dirs = [d for d in reload_dirs if Path(d).exists()]
        
        reload_config = {
            "reload": True,
            "reload_dirs": reload_dirs,
            # Garder un reload rapide mais éviter les redémarrages liés aux assets non-Python.
            # Uvicorn (watchfiles) gère les patterns glob ici.
            "reload_includes": ["*.py"],
            "reload_excludes": [
                "frontend/*",
                "node_modules/*",
                "tests/*",
                "docs/*",
                "Assets/*",
                "data/*",
                "*.log",
                "*.txt",
                "*.json",
                "*.yarn",
            ],
            "reload_delay": 1.0,  # Délai de 1 seconde pour éviter les redémarrages trop fréquents
        }
    else:
        reload_config = {"reload": False}
    
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=int(os.getenv("API_PORT", "4242")),
        log_level="info",
        **reload_config
    )


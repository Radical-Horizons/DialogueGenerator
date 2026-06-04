"""Middleware de cache HTTP avec TTL pour les endpoints GET statiques."""
import os
import hashlib
import json
import logging
import time
from typing import Optional, Callable, Any
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse
from cachetools import TTLCache

logger = logging.getLogger(__name__)


async def _read_response_body(response: Response) -> bytes:
    """Lit le body d'une réponse Starlette/FastAPI de manière asynchrone.
    
    Args:
        response: Réponse HTTP.
        
    Returns:
        Contenu du body en bytes.
    """
    content = b""
    if hasattr(response, "body_iterator"):
        async for chunk in response.body_iterator:
            if isinstance(chunk, bytes):
                content += chunk
            elif isinstance(chunk, str):
                content += chunk.encode()
    elif hasattr(response, "body"):
        body = response.body
        if isinstance(body, bytes):
            content = body
        elif isinstance(body, str):
            content = body.encode()
    return content


class HTTPCacheMiddleware(BaseHTTPMiddleware):
    """Middleware de cache HTTP avec TTL pour améliorer les performances."""
    
    def __init__(
        self,
        app: Any,
        enabled: bool = True,
        ttl_gdd: int = 30,
        ttl_static: int = 300,
        max_size: int = 1000
    ):
        """Initialise le middleware de cache HTTP.
        
        Args:
            app: Application FastAPI.
            enabled: Si False, désactive le cache.
            ttl_gdd: TTL en secondes pour les données GDD (défaut: 30).
            ttl_static: TTL en secondes pour les données statiques (défaut: 300).
            max_size: Taille maximale du cache (défaut: 1000 entrées).
        """
        super().__init__(app)
        self.enabled = enabled
        self.ttl_gdd = ttl_gdd
        self.ttl_static = ttl_static
        self.max_size = max_size
        
        # Caches séparés pour différents types de données
        if enabled:
            self._cache_gdd = TTLCache(maxsize=max_size, ttl=ttl_gdd)
            self._cache_static = TTLCache(maxsize=max_size, ttl=ttl_static)
        else:
            self._cache_gdd = None
            self._cache_static = None
        
        if enabled:
            logger.info(
                f"Cache HTTP activé: TTL GDD={ttl_gdd}s, TTL Static={ttl_static}s, max_size={max_size}"
            )
        else:
            logger.info("Cache HTTP désactivé")

    def _has_auth_credentials(self, request: Request) -> bool:
        """Indique si la requête transporte une identité utilisateur."""
        return bool(request.headers.get("Authorization") or request.headers.get("Cookie"))

    def _is_sensitive_path(self, path: str) -> bool:
        """Indique si le chemin API contient des données utilisateur ou dynamiques."""
        sensitive_prefixes = (
            "/api/v1/auth",
            "/api/v1/documents",
            "/api/v1/interactions",
            "/api/v1/dialogues",
            "/api/v1/unity-dialogues",
            "/api/v1/presets",
            "/api/v1/cost",
            "/api/v1/costs",
            "/api/v1/config",
            "/api/v1/context/build",
            "/api/v1/context/estimate-tokens",
            "/api/v1/context/linked-elements",
        )
        return any(path.startswith(prefix) for prefix in sensitive_prefixes)

    def _apply_private_no_store(self, request: Request, response: Response) -> Response:
        """Force des headers anti-cache pour les réponses liées à une identité."""
        if self._has_auth_credentials(request) or self._is_sensitive_path(request.url.path):
            response.headers["Cache-Control"] = "private, no-store"
            response.headers["Pragma"] = "no-cache"
            response.headers["Vary"] = "Authorization, Cookie"
        return response
    
    def _get_cache_key(self, request: Request) -> str:
        """Génère une clé de cache unique pour la requête.
        
        Args:
            request: Requête HTTP.
            
        Returns:
            Clé de cache.
        """
        # Inclure la méthode, le chemin et les paramètres de requête
        path = str(request.url.path)
        query_string = str(request.url.query)
        key_data = f"{request.method}:{path}:{query_string}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    def _is_cacheable(self, request: Request) -> bool:
        """Détermine si une requête peut être mise en cache.
        
        Args:
            request: Requête HTTP.
            
        Returns:
            True si la requête peut être mise en cache.
        """
        # Seulement les requêtes GET
        if request.method != "GET":
            return False

        path = request.url.path

        # Ne jamais mettre en cache le shell SPA ni les assets servis hors /api/ :
        # StaticFiles (/, /assets/*, etc.) passait ici et recevait public,max-age=TTL,
        # ce qui figeait index.html en RAM et dans le navigateur après déploiement.
        if not path.startswith("/api/"):
            return False
        
        # Ne jamais partager une réponse liée à une identité ou à un endpoint dynamique.
        if self._has_auth_credentials(request) or self._is_sensitive_path(path):
            return False
        
        return True
    
    def _get_cache_for_path(self, path: str) -> Optional[TTLCache]:
        """Retourne le cache approprié selon le chemin.
        
        Args:
            path: Chemin de la requête.
            
        Returns:
            Cache approprié ou None.
        """
        if not self.enabled:
            return None
        
        # Endpoints GDD
        if path.startswith("/api/v1/context/"):
            return self._cache_gdd
        
        # Autres endpoints statiques
        return self._cache_static
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Traite la requête avec cache HTTP.
        
        Args:
            request: Requête HTTP.
            call_next: Fonction pour appeler le prochain middleware/handler.
            
        Returns:
            Réponse HTTP.
        """
        # Vérifier si la requête peut être mise en cache
        if not self._is_cacheable(request):
            response = await call_next(request)
            return self._apply_private_no_store(request, response)
        
        # Vérifier le header If-None-Match (ETag)
        cache_key = self._get_cache_key(request)
        cache = self._get_cache_for_path(request.url.path)
        # Log seulement si le cache est activé et qu'il y a un problème
        if self.enabled and cache is None:
            logger.warning(f"Cache HTTP activé mais cache=None pour {request.url.path}")
        
        if cache is not None and cache_key in cache:
            cached_response = cache[cache_key]

            # Vérifier ETag si présent
            if_none_match = request.headers.get("If-None-Match")
            if if_none_match and cached_response.get("etag") == if_none_match:
                return Response(
                    status_code=304,
                    headers={"ETag": cached_response["etag"]}
                )
            
            # Retourner la réponse en cache
            return StarletteResponse(
                content=cached_response["content"],
                status_code=cached_response["status_code"],
                headers={
                    **cached_response["headers"],
                    "X-Cache": "HIT",
                    "Cache-Control": f"public, max-age={self.ttl_gdd if request.url.path.startswith('/api/v1/context/') else self.ttl_static}"
                },
                media_type=cached_response.get("media_type", "application/json")
            )
        
        # Cache miss : exécuter la requête
        response = await call_next(request)
        
        # Mettre en cache si succès (2xx)
        if cache is not None and 200 <= response.status_code < 300:
            logger.debug(f"Tentative de mise en cache pour {request.url.path}")
            # Lire le body de la réponse de manière asynchrone
            try:
                content = await _read_response_body(response)
                if not content:
                    # Si on n'a pas pu lire le body, ne pas mettre en cache
                    return response
            except Exception as e:
                logger.warning(f"Impossible de lire le body de la réponse pour mise en cache: {e}")
                return response
            
            media_type = getattr(response, "media_type", "application/json")
            
            etag = hashlib.md5(content).hexdigest()
            
            # Stocker dans le cache
            cache[cache_key] = {
                "content": content,
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "etag": etag,
                "media_type": media_type
            }

            # Créer une nouvelle réponse avec les headers de cache
            ttl = self.ttl_gdd if request.url.path.startswith("/api/v1/context/") else self.ttl_static
            headers = dict(response.headers)
            headers["X-Cache"] = "MISS"
            headers["ETag"] = etag
            headers["Cache-Control"] = f"public, max-age={ttl}"
            
            return StarletteResponse(
                content=content,
                status_code=response.status_code,
                headers=headers,
                media_type=media_type
            )
        
        return response
    
    def invalidate_path(self, path_pattern: str) -> None:
        """Invalide toutes les entrées de cache correspondant à un pattern de chemin.
        
        Args:
            path_pattern: Pattern de chemin à invalider (ex: "/api/v1/context/characters").
        """
        if not self.enabled:
            return
        
        # Invalider dans les deux caches
        for cache in [self._cache_gdd, self._cache_static]:
            if cache:
                keys_to_remove = [
                    key for key in cache.keys()
                    if isinstance(key, str)  # Les clés sont des hash MD5
                ]
                # Note: On ne peut pas facilement inverser le hash pour trouver les chemins
                # Donc on invalide tout le cache si nécessaire
                # Une meilleure implémentation utiliserait un index chemin -> clés
                logger.info(f"Invalidation du cache HTTP pour pattern: {path_pattern}")
        
        # Pour simplifier, on vide tout le cache GDD si un endpoint GDD est invalidé
        if path_pattern.startswith("/api/v1/context/") and self._cache_gdd:
            self._cache_gdd.clear()
            logger.info("Cache HTTP GDD vidé")


def setup_http_cache(app: Any) -> None:
    """Configure le middleware de cache HTTP pour l'application.
    
    Args:
        app: Application FastAPI.
    """
    # Désactiver le cache en développement pour garantir des changements toujours visibles
    environment = os.getenv("ENVIRONMENT", "development").lower()
    is_development = environment == "development"
    
    # En développement, désactiver le cache par défaut
    # (peut être forcé avec HTTP_CACHE_ENABLED=true)
    if is_development:
        cache_enabled_env = os.getenv("HTTP_CACHE_ENABLED", "false")
    else:
        cache_enabled_env = os.getenv("HTTP_CACHE_ENABLED", "true")
    
    enabled = cache_enabled_env.lower() in ("true", "1", "yes")
    ttl_gdd = int(os.getenv("HTTP_CACHE_TTL_GDD", "30"))
    ttl_static = int(os.getenv("HTTP_CACHE_TTL_STATIC", "300"))
    max_size = int(os.getenv("HTTP_CACHE_MAX_SIZE", "1000"))
    
    if enabled:
        app.add_middleware(
            HTTPCacheMiddleware,
            enabled=enabled,
            ttl_gdd=ttl_gdd,
            ttl_static=ttl_static,
            max_size=max_size
        )
        logger.info("Middleware de cache HTTP configuré")
    else:
        if is_development:
            logger.info("Middleware de cache HTTP désactivé en développement (pour garantir le rafraîchissement)")



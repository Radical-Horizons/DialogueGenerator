"""Router pour l'authentification."""
import logging
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from slowapi import Limiter
from slowapi.util import get_remote_address
from api.schemas.auth import (
    LoginRequest,
    TokenResponse,
    UserResponse,
    RefreshTokenRequest,
    ChangePasswordRequest,
)
from api.services.auth_service import AuthService
from api.exceptions import AuthenticationException, AuthorizationException, ValidationException
from api.dependencies import get_auth_service, get_request_id
from api.config.security_config import get_security_config
from api.middleware.rate_limiter import get_limiter, get_rate_limit_string
from api.utils.password_policy import PasswordPolicyError
logger = logging.getLogger(__name__)

# Configuration cookies (utilise SecurityConfig)
security_config = get_security_config()

router = APIRouter()
# Bearer optionnel uniquement en dev avec DISABLE_AUTH=true ; sinon erreur 403 si header absent
security = HTTPBearer(auto_error=False)
_is_production = security_config.is_production
_cookie_domain = None  # Peut être étendu via config si nécessaire
_cookie_secure = _is_production  # Secure=True en production uniquement
_cookie_same_site = "none" if _is_production and _cookie_domain else "lax"  # none nécessite Secure=True


def apply_rate_limit(func):
    """Applique le rate limiting si activé.
    
    Le limiter doit être attaché à app.state.limiter dans main.py.
    Si le rate limiting est désactivé, cette fonction retourne la fonction telle quelle.
    
    Args:
        func: La fonction à décorer.
        
    Returns:
        La fonction décorée avec rate limiting ou la fonction originale.
    """
    # Vérifier si le rate limiting est activé
    if not security_config.auth_rate_limit_enabled:
        return func
    
    # Utiliser le limiter global (doit être attaché à app.state.limiter dans main.py)
    limiter = get_limiter()
    if limiter is None:
        return func
    
    rate_limit_str = get_rate_limit_string()
    return limiter.limit(rate_limit_str)(func)


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Configure et définit le cookie refresh_token.
    
    Args:
        response: La réponse HTTP.
        refresh_token: Le token de rafraîchissement à stocker.
    """
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,  # Pas accessible via JavaScript
        secure=_cookie_secure,  # HTTPS uniquement en production
        samesite=_cookie_same_site,  # Protection CSRF
        path="/api/v1/auth",  # Cookie disponible uniquement sur les routes auth
        domain=_cookie_domain,  # Domaine spécifique en production (optionnel)
        max_age=7 * 24 * 60 * 60,  # 7 jours en secondes
    )


def _delete_refresh_cookie(response: Response) -> None:
    """Supprime le cookie refresh_token.
    
    Args:
        response: La réponse HTTP.
    """
    response.delete_cookie(
        key="refresh_token",
        path="/api/v1/auth",
        domain=_cookie_domain,
        samesite=_cookie_same_site,
        secure=_cookie_secure,
    )


async def get_current_user(
    request: Request,
    auth_service: Annotated[
        AuthService,
        Depends(get_auth_service),
    ],
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(security),
    ] = None,
) -> dict[str, object]:
    """Dépendance pour obtenir l'utilisateur courant depuis le token JWT.

    Si ``DISABLE_AUTH=true`` et environnement non-production : utilisateur mock admin
    (pytest / outillage). Sinon : Bearer JWT obligatoire (y compris guest).

    Args:
        credentials: Credentials HTTP (token). Optionnel si DISABLE_AUTH.
        request: La requête HTTP.

    Returns:
        Dictionnaire avec les informations de l'utilisateur.

    Raises:
        AuthenticationException: Si le token est invalide, expiré ou absent.
    """
    # Toujours via get_security_config() (évite singleton stale après reset tests).
    live_security = get_security_config()
    if live_security.is_development and live_security.disable_auth:
        logger.debug(
            "DISABLE_AUTH=true: JWT ignoré, utilisateur mock (développement uniquement)"
        )
        return {
            "id": "1",
            "username": "admin",
            "email": "admin@example.com",
            "role": "admin",
            "is_active": True,
        }
    
    # Vérifier le token JWT
    request_id = getattr(request.state, "request_id", "unknown")
    
    if credentials is None:
        raise AuthenticationException(
            message="Token manquant",
            request_id=request_id
        )
    
    token = credentials.credentials
    
    payload = auth_service.verify_token(token, token_type="access")
    if payload is None:
        raise AuthenticationException(
            message="Token invalide ou expiré",
            request_id=request_id
        )
    
    username = payload.get("sub")
    if not isinstance(username, str) or not username:
        raise AuthenticationException(
            message="Token invalide",
            request_id=request_id
        )

    if payload.get("role") == "guest" and username == "guest":
        return auth_service.guest_principal()

    user = auth_service.get_user_by_username(username)
    if user is None:
        raise AuthenticationException(
            message="Token invalide ou expiré",
            request_id=request_id
        )
    
    return user


async def get_current_user_or_none(
    request: Request,
    auth_service: Annotated[
        AuthService,
        Depends(get_auth_service),
    ],
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)] = None,
) -> Optional[dict[str, object]]:
    """Résout l'utilisateur courant sans interrompre la vérification d'admin.

    Args:
        request: Requête HTTP courante.
        credentials: Identifiants Bearer éventuellement fournis.

    Returns:
        Utilisateur courant, ou ``None`` si l'authentification échoue.
    """
    try:
        return await get_current_user(
            request=request,
            credentials=credentials,
            auth_service=auth_service,
        )
    except AuthenticationException as exc:
        logger.debug("Utilisateur non authentifié pour une route admin: %s", exc.detail)
        return None


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
@apply_rate_limit
async def login(
    login_data: LoginRequest,
    request: Request,
    response: Response,
    auth_service: Annotated[
        AuthService,
        Depends(get_auth_service),
    ],
) -> TokenResponse:
    """Endpoint de connexion avec rate limiting.
    
    Args:
        login_data: Données de connexion (username, password).
        request: La requête HTTP.
        response: La réponse HTTP.
        
    Returns:
        Tokens d'authentification (access dans body, refresh dans cookie).
        
    Raises:
        AuthenticationException: Si les identifiants sont invalides.
        RateLimitExceeded: Si le rate limit est dépassé.
    """
    request_id = getattr(request.state, "request_id", "unknown")
    
    user = auth_service.authenticate_user(login_data.username, login_data.password)
    if not user:
        raise AuthenticationException(
            message="Nom d'utilisateur ou mot de passe incorrect",
            request_id=request_id
        )
    
    # Créer les tokens
    access_token = auth_service.create_access_token(data={"sub": user["username"]})
    refresh_token = auth_service.create_refresh_token(data={"sub": user["username"]})
    
    # Définir le cookie refresh_token (httpOnly, sécurisé)
    _set_refresh_cookie(response, refresh_token)
    
    logger.info(f"Utilisateur '{user['username']}' connecté (request_id: {request_id})")
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=auth_service.access_token_expire.total_seconds()
    )


@router.post("/guest", response_model=TokenResponse, status_code=status.HTTP_200_OK)
@apply_rate_limit
async def guest_login(
    request: Request,
    auth_service: Annotated[
        AuthService,
        Depends(get_auth_service),
    ],
) -> TokenResponse:
    """Ouvre une session invité lecture seule sans compte SQLite.

    Args:
        request: Requête HTTP.
        auth_service: Service d'authentification injecté.

    Returns:
        Access token JWT ``role=guest`` (pas de cookie refresh).
    """
    request_id = getattr(request.state, "request_id", "unknown")
    access_token = auth_service.create_guest_access_token()
    logger.info("Session invité ouverte (request_id: %s)", request_id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=auth_service.guest_token_expire_seconds,
    )


@router.post("/refresh", response_model=TokenResponse, status_code=status.HTTP_200_OK)
@apply_rate_limit
async def refresh_token(
    request: Request,
    response: Response,
    auth_service: Annotated[
        AuthService,
        Depends(get_auth_service),
    ],
    refresh_data: RefreshTokenRequest | None = None,
) -> TokenResponse:
    """Endpoint de rafraîchissement de token avec rate limiting.
    
    Args:
        refresh_data: Données de rafraîchissement (peut être dans cookie, body conservé pour compatibilité dev).
        request: La requête HTTP.
        response: La réponse HTTP.
        
    Returns:
        Nouveau token d'accès.
        
    Raises:
        AuthenticationException: Si le refresh token est invalide.
        RateLimitExceeded: Si le rate limit est dépassé.
    """
    """Endpoint de rafraîchissement de token.
    
    Args:
        refresh_data: Données de rafraîchissement (peut être dans cookie, body conservé pour compatibilité dev).
        request: La requête HTTP.
        response: La réponse HTTP.
        
    Returns:
        Nouveau token d'accès.
        
    Raises:
        AuthenticationException: Si le refresh token est invalide.
    """
    request_id = getattr(request.state, "request_id", "unknown")
    
    # Chercher le refresh token dans les cookies en priorité, puis dans le body (fallback pour dev)
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token and security_config.is_development and refresh_data is not None:
        refresh_token = refresh_data.refresh_token
    
    if not refresh_token:
        raise AuthenticationException(
            message="Refresh token manquant",
            request_id=request_id
        )
    
    payload = auth_service.verify_token(refresh_token, token_type="refresh")
    if payload is None:
        raise AuthenticationException(
            message="Refresh token invalide ou expiré",
            request_id=request_id
        )
    
    username = payload.get("sub")
    if not isinstance(username, str) or not username:
        raise AuthenticationException(
            message="Refresh token invalide",
            request_id=request_id
        )
    
    user = auth_service.get_user_by_username(username)
    if user is None:
        raise AuthenticationException(
            message="Refresh token invalide ou expiré",
            request_id=request_id
        )

    # Créer un nouveau access token
    access_token = auth_service.create_access_token(data={"sub": user["username"]})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=auth_service.access_token_expire.total_seconds()
    )


@router.get("/me", response_model=UserResponse, status_code=status.HTTP_200_OK)
async def get_current_user_info(
    current_user: Annotated[dict, Depends(get_current_user)]
) -> UserResponse:
    """Endpoint pour obtenir les informations de l'utilisateur courant.
    
    Args:
        current_user: Utilisateur courant (injecté via dépendance).
        
    Returns:
        Informations de l'utilisateur.
    """
    return UserResponse(
        id=current_user["id"],
        username=current_user["username"],
        email=current_user.get("email"),
        role=current_user["role"],
        is_active=bool(current_user["is_active"]),
    )


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
@apply_rate_limit
async def change_own_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> None:
    """Change le mot de passe du compte authentifié (admin / writer).

    Args:
        payload: Mot de passe actuel et nouveau.
        request: Requête HTTP (request_id).
        current_user: Principal JWT résolu.
        auth_service: Service d'authentification injecté.
    """
    request_id = getattr(request.state, "request_id", "unknown")
    if current_user.get("role") == "guest":
        raise AuthorizationException(
            message="Les invités ne peuvent pas changer de mot de passe.",
            request_id=request_id,
        )
    user_id = current_user.get("id")
    if not isinstance(user_id, str) or not user_id:
        raise AuthenticationException(
            message="Session invalide",
            request_id=request_id,
        )
    try:
        auth_service.change_password(
            user_id,
            current_password=payload.current_password,
            new_password=payload.new_password,
            actor=current_user,
        )
    except PermissionError as exc:
        raise AuthenticationException(
            message=str(exc),
            request_id=request_id,
        ) from exc
    except LookupError as exc:
        raise AuthenticationException(
            message=str(exc),
            request_id=request_id,
        ) from exc
    except PasswordPolicyError as exc:
        raise ValidationException(
            message=str(exc),
            request_id=request_id,
        ) from exc


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    auth_service: Annotated[
        AuthService,
        Depends(get_auth_service),
    ],
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(HTTPBearer(auto_error=False)),
    ] = None,
) -> None:
    """Endpoint de déconnexion.
    
    Efface toujours le cookie ``refresh_token`` même si l'access token est expiré
    (``EventSource`` / onglet fermé : l'utilisateur doit pouvoir terminer la session).
    
    Args:
        response: La réponse HTTP.
        credentials: Bearer optionnel pour journaliser le ``sub`` si encore valide.
    """
    _delete_refresh_cookie(response)
    if credentials is not None:
        payload = auth_service.verify_token(credentials.credentials, token_type="access")
        if payload and payload.get("sub"):
            logger.info("Déconnexion (cookie refresh effacé), sub=%s", payload.get("sub"))
            return
    logger.info("Déconnexion : cookie refresh effacé (access token absent ou expiré)")


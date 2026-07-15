"""Jetons JWT à courte durée pour authentifier les connexions SSE (EventSource sans header Authorization)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt

from api.config.security_config import get_security_config
from api.services.auth_service import AuthService

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
SSE_TOKEN_TYPE = "sse_job"
SSE_TOKEN_EXPIRE_MINUTES = 30


def create_sse_job_token(
    *,
    job_id: str,
    username: str,
    auth_service: AuthService | None = None,
) -> str:
    """Crée un JWT limité au stream d'un job (même `sub` que l'access token).

    Args:
        job_id: Identifiant du job de génération.
        username: Nom d'utilisateur (claim ``sub``).

    Returns:
        Chaîne JWT à passer en query ``sse_token`` sur le GET stream.
    """
    secret_key = (
        auth_service.secret_key
        if auth_service is not None
        else get_security_config().jwt_secret_key
    )
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": username,
        "typ": SSE_TOKEN_TYPE,
        "job_id": job_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=SSE_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, secret_key, algorithm=ALGORITHM)


def verify_sse_job_token(
    token: str,
    expected_job_id: str,
    auth_service: AuthService | None = None,
) -> Optional[dict[str, Any]]:
    """Valide le jeton SSE et vérifie qu'il correspond au ``job_id``.

    Args:
        token: JWT reçu en query.
        expected_job_id: Identifiant de job attendu (path).

    Returns:
        Payload décodé si valide, sinon ``None``.
    """
    secret_key = (
        auth_service.secret_key
        if auth_service is not None
        else get_security_config().jwt_secret_key
    )
    try:
        payload = jwt.decode(
            token,
            secret_key,
            algorithms=[ALGORITHM],
        )
    except JWTError as e:
        logger.debug("SSE token invalide: %s", e)
        return None
    if payload.get("typ") != SSE_TOKEN_TYPE or "exp" not in payload:
        return None
    if payload.get("job_id") != expected_job_id:
        return None
    return payload

"""Jetons JWT à courte durée pour authentifier les connexions SSE (EventSource sans header Authorization)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt

from api.config.security_config import get_security_config
from api.utils.debug_agent_ndjson import write_agent_debug_log

logger = logging.getLogger(__name__)

_DEBUG_LOG = "debug-d08897.log"

ALGORITHM = "HS256"
SSE_TOKEN_TYPE = "sse_job"
SSE_TOKEN_EXPIRE_MINUTES = 30


def create_sse_job_token(*, job_id: str, username: str) -> str:
    """Crée un JWT limité au stream d'un job (même `sub` que l'access token).

    Args:
        job_id: Identifiant du job de génération.
        username: Nom d'utilisateur (claim ``sub``).

    Returns:
        Chaîne JWT à passer en query ``sse_token`` sur le GET stream.
    """
    security_config = get_security_config()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": username,
        "typ": SSE_TOKEN_TYPE,
        "job_id": job_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=SSE_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, security_config.jwt_secret_key, algorithm=ALGORITHM)


def verify_sse_job_token(token: str, expected_job_id: str) -> Optional[dict[str, Any]]:
    """Valide le jeton SSE et vérifie qu'il correspond au ``job_id``.

    Args:
        token: JWT reçu en query.
        expected_job_id: Identifiant de job attendu (path).

    Returns:
        Payload décodé si valide, sinon ``None``.
    """
    security_config = get_security_config()
    try:
        payload = jwt.decode(
            token,
            security_config.jwt_secret_key,
            algorithms=[ALGORITHM],
        )
    except JWTError as e:
        logger.debug("SSE token invalide: %s", e)
        # region agent log
        write_agent_debug_log(
            log_filename=_DEBUG_LOG,
            hypothesis_id="H1",
            location="sse_job_token.py:verify_sse_job_token",
            message="jwt_decode_failed",
            data={"expected_job_id": expected_job_id, "error_type": type(e).__name__},
        )
        # endregion agent log
        return None
    if payload.get("typ") != SSE_TOKEN_TYPE:
        # region agent log
        write_agent_debug_log(
            log_filename=_DEBUG_LOG,
            hypothesis_id="H1",
            location="sse_job_token.py:verify_sse_job_token",
            message="wrong_typ",
            data={
                "expected_job_id": expected_job_id,
                "typ": payload.get("typ"),
            },
        )
        # endregion agent log
        return None
    if payload.get("job_id") != expected_job_id:
        # region agent log
        write_agent_debug_log(
            log_filename=_DEBUG_LOG,
            hypothesis_id="H1",
            location="sse_job_token.py:verify_sse_job_token",
            message="job_id_mismatch",
            data={
                "expected_job_id": expected_job_id,
                "token_job_id": payload.get("job_id"),
            },
        )
        # endregion agent log
        return None
    return payload

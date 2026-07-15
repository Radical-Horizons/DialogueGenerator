"""Contexte par requête : identifiant facturable dérivé du JWT Bearer (budget / usage)."""

from __future__ import annotations

import logging
from contextvars import ContextVar, Token
from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from api.config.security_config import get_security_config

logger = logging.getLogger(__name__)

DEFAULT_BILLABLE_USER_ID = "default_user"

_billable_user_id: ContextVar[str] = ContextVar(
    "billable_user_id", default=DEFAULT_BILLABLE_USER_ID
)

def get_billable_user_id() -> str:
    """Retourne l'identifiant utilisateur pour quota/coût (JWT ``sub`` / username ou défaut)."""
    return _billable_user_id.get()


def set_billable_user_id_for_tests(user_id: str) -> Token[str]:
    """Réinitialisable dans les tests (pytest)."""
    return _billable_user_id.set(user_id)


def push_billable_user_id(user_id: str) -> Token[str]:
    """Empile un identifiant facturable (ex. propriétaire du job SSE).

    ``EventSource`` n'envoie pas ``Authorization: Bearer`` : le middleware ne peut
    pas déduire l'utilisateur sur le GET ``/stream``. Après authentification par
    ``sse_token``, appeler cette fonction pour que ``get_billable_user_id()`` reflète
    le même utilisateur que la création du job, sur toute la durée du flux.

    Args:
        user_id: Identifiant aligné sur ``username`` / ``sub`` (ex. depuis JWT job).

    Returns:
        Jeton à passer à ``reset_billable_user_id`` dans un ``finally``.
    """
    return _billable_user_id.set(user_id)


def reset_billable_user_id(token: Token[str]) -> None:
    """Réinitialise le contexte après un ``push_billable_user_id`` ou ``set`` de test."""
    _billable_user_id.reset(token)


def _user_id_from_authorization(request: Request) -> str:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return DEFAULT_BILLABLE_USER_ID
    token = auth[7:].strip()
    container = getattr(request.app.state, "container", None)
    if container is None:
        return DEFAULT_BILLABLE_USER_ID
    payload = container.get_auth_service().verify_token(token, token_type="access")
    if not payload:
        return DEFAULT_BILLABLE_USER_ID
    sub = payload.get("sub")
    return str(sub) if sub else DEFAULT_BILLABLE_USER_ID


class BillableUserContextMiddleware(BaseHTTPMiddleware):
    """Définit ``get_billable_user_id()`` pour toute la durée de la requête."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Même source de vérité que ``get_current_user`` (SecurityConfig.disable_auth), pas seulement
        # ``os.getenv`` : sans .env, le défaut Pydantic reste auth désactivée en local.
        if get_security_config().disable_auth:
            uid = "admin"
        else:
            uid = _user_id_from_authorization(request)
        var_token = _billable_user_id.set(uid)
        try:
            return await call_next(request)
        finally:
            _billable_user_id.reset(var_token)

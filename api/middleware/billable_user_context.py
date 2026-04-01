"""Contexte par requête : identifiant facturable dérivé du JWT Bearer (budget / usage)."""

from __future__ import annotations

import logging
import os
from contextvars import ContextVar, Token
from typing import Callable, Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from api.services.auth_service import AuthService

logger = logging.getLogger(__name__)

DEFAULT_BILLABLE_USER_ID = "default_user"

_billable_user_id: ContextVar[str] = ContextVar(
    "billable_user_id", default=DEFAULT_BILLABLE_USER_ID
)

_auth = AuthService()


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
    payload = _auth.verify_token(token, token_type="access")
    if not payload:
        return DEFAULT_BILLABLE_USER_ID
    sub = payload.get("sub")
    return str(sub) if sub else DEFAULT_BILLABLE_USER_ID


class BillableUserContextMiddleware(BaseHTTPMiddleware):
    """Définit ``get_billable_user_id()`` pour toute la durée de la requête."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Aligner avec ``get_current_user`` mock (username admin) quand auth désactivée en dev/test.
        if os.getenv("DISABLE_AUTH", "").lower() in ("1", "true", "yes"):
            uid = "admin"
        else:
            uid = _user_id_from_authorization(request)
        var_token = _billable_user_id.set(uid)
        try:
            return await call_next(request)
        finally:
            _billable_user_id.reset(var_token)

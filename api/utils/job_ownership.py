"""Clés de propriété pour les jobs en mémoire (Epic 8 / streaming)."""

from __future__ import annotations

from typing import Mapping


def job_owner_key(user: Mapping[str, object]) -> str:
    """Retourne la clé propriétaire stable pour un job.

    Les sessions invitées partagent ``username=guest`` : on isole via
    ``session_id`` (claim JWT ``sid``) pour éviter un IDOR inter-sessions.

    Args:
        user: Principal auth (username/id/role/session_id).

    Returns:
        Chaîne utilisée comme ``owner_username`` du job.
    """
    role = str(user.get("role") or "")
    username = str(user.get("username") or "")
    user_id = str(user.get("id") or "")
    if role == "guest" or username == "guest" or user_id == "guest":
        session_id = user.get("session_id")
        if isinstance(session_id, str) and session_id.strip():
            return f"guest:{session_id.strip()}"
        return "guest"
    return username or user_id or "unknown"

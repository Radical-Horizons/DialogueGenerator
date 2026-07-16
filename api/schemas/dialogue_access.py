"""Schémas partagés pour les capacités d'accès aux dialogues."""

from pydantic import BaseModel


class DialogueCapabilitiesResponse(BaseModel):
    """Capacités CRUD calculées par le serveur pour le dialogue."""

    can_read: bool
    can_edit: bool
    can_delete: bool
    is_owner: bool

"""Schémas Pydantic pour la vue agrégée des permissions dialogue."""

from pydantic import BaseModel

from api.schemas.dialogue_shares import DialogueShareResponse


class DialoguePermissionUserResponse(BaseModel):
    """Identité publique minimale d'un utilisateur."""

    user_id: str
    username: str


class DialoguePermissionsResponse(BaseModel):
    """Propriétaire, co-éditeurs et capacité de gestion du demandeur."""

    owner: DialoguePermissionUserResponse
    co_editors: list[DialogueShareResponse]
    can_manage: bool

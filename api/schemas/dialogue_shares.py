"""Schémas Pydantic pour le partage co-édition des dialogues."""

from pydantic import BaseModel, Field


class DialogueShareCreateRequest(BaseModel):
    """Invitation d'un writer existant par username."""

    username: str = Field(..., min_length=1, max_length=64)

    def normalized_username(self) -> str:
        """Retourne le username trimé, ou lève si vide après trim."""
        trimmed = self.username.strip()
        if not trimmed:
            raise ValueError("Le nom d'utilisateur est vide")
        return trimmed


class DialogueShareResponse(BaseModel):
    """Partage writer exposé à l'API."""

    document_id: str
    user_id: str
    username: str
    permission: str = "writer"
    created_at: str

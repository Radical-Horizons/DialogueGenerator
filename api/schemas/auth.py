"""Schémas Pydantic pour l'authentification."""
from typing import Literal, Optional
from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator

from api.utils.password_policy import PasswordPolicyError, validate_password


class LoginRequest(BaseModel):
    """Requête de connexion.
    
    Attributes:
        username: Nom d'utilisateur ou email.
        password: Mot de passe.
    """
    username: str = Field(..., min_length=1, description="Nom d'utilisateur ou email")
    password: str = Field(..., min_length=1, description="Mot de passe")


class ChangePasswordRequest(BaseModel):
    """Changement de mot de passe pour le compte authentifié."""

    current_password: str = Field(..., min_length=1, description="Mot de passe actuel")
    new_password: str = Field(..., min_length=8, description="Nouveau mot de passe")

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        """Applique la politique de mot de passe au nouveau secret."""
        try:
            validate_password(value)
        except PasswordPolicyError as exc:
            raise ValueError(str(exc)) from exc
        return value

    @model_validator(mode="after")
    def reject_unchanged_password(self) -> "ChangePasswordRequest":
        """Refuse un changement qui laisse le mot de passe identique."""
        if self.current_password == self.new_password:
            raise ValueError("Le nouveau mot de passe doit être différent de l'actuel.")
        return self


class TokenResponse(BaseModel):
    """Réponse avec tokens d'authentification.
    
    Attributes:
        access_token: Token d'accès (court terme).
        token_type: Type de token (généralement "bearer").
        expires_in: Durée de validité en secondes.
    """
    access_token: str = Field(..., description="Token d'accès JWT")
    token_type: str = Field(default="bearer", description="Type de token")
    expires_in: int = Field(..., description="Durée de validité en secondes")


class UserResponse(BaseModel):
    """Informations sur l'utilisateur.
    
    Attributes:
        id: Identifiant unique de l'utilisateur.
        username: Nom d'utilisateur.
        email: Adresse email (optionnel).
    """
    id: str = Field(..., description="Identifiant unique de l'utilisateur")
    username: str = Field(..., description="Nom d'utilisateur")
    email: Optional[EmailStr] = Field(None, description="Adresse email")
    role: Literal["admin", "writer", "guest"] = Field(..., description="Rôle applicatif")
    is_active: bool = Field(..., description="État actif du compte")


class RefreshTokenRequest(BaseModel):
    """Requête de rafraîchissement de token.
    
    Attributes:
        refresh_token: Token de rafraîchissement.
    """
    refresh_token: Optional[str] = Field(None, description="Token de rafraîchissement (peut être dans cookie)")




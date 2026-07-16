"""Schémas Pydantic pour l'authentification."""
from typing import Literal, Optional
from pydantic import BaseModel, Field, EmailStr


class LoginRequest(BaseModel):
    """Requête de connexion.
    
    Attributes:
        username: Nom d'utilisateur ou email.
        password: Mot de passe.
    """
    username: str = Field(..., min_length=1, description="Nom d'utilisateur ou email")
    password: str = Field(..., min_length=1, description="Mot de passe")


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




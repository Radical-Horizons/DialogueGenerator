"""Schémas Pydantic pour la gestion administrative des utilisateurs."""

import unicodedata

from pydantic import BaseModel, EmailStr, Field, field_validator

from api.utils.password_policy import PasswordPolicyError, validate_password


class UserCreate(BaseModel):
    """Données nécessaires à la création d'un compte writer."""

    username: str = Field(
        min_length=3,
        max_length=50,
        description="Nom d'utilisateur unique",
    )
    email: EmailStr = Field(description="Adresse email du collaborateur")
    password: str = Field(
        min_length=8,
        description="Mot de passe initial transmis hors bande",
    )

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        """Refuse les identifiants ambigus ou réservés au bootstrap admin."""
        if not value.strip() or any(character.isspace() for character in value):
            raise ValueError("Le username ne peut pas être vide ou contenir d'espaces.")
        if any(unicodedata.category(character).startswith("C") for character in value):
            raise ValueError("Le username ne peut pas contenir de caractères de contrôle.")
        if value.casefold() == "admin":
            raise ValueError("Le username admin est réservé.")
        return value

    @field_validator("password")
    @classmethod
    def validate_password_field(cls, value: str) -> str:
        """Applique la politique de mot de passe et conserve la valeur valide."""
        try:
            validate_password(value)
        except PasswordPolicyError as exc:
            raise ValueError(str(exc)) from exc
        return value


class UserResponse(BaseModel):
    """Représentation publique d'un compte utilisateur."""

    id: str
    username: str
    email: str
    role: str
    is_active: bool
    created_at: str

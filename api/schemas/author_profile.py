"""Schémas Pydantic des profils d'auteur.

Un profil d'auteur décrit une **voix** — le registre persistant appliqué à toutes les
scènes d'un projet. C'est un objet distinct d'un template : celui-ci porte une
configuration de génération, celui-là un style d'écriture.
"""

from datetime import datetime
from typing import Any, List, Literal, Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

AUTHOR_PROFILE_NAME_MAX_LENGTH = 120
AUTHOR_PROFILE_DESCRIPTION_MAX_LENGTH = 2000
AUTHOR_PROFILE_CONTENT_MAX_LENGTH = 20000


def _strip_required_name(value: str) -> str:
    """Normalise le nom : strip, puis refuse le vide (422)."""
    stripped = value.strip()
    if not stripped:
        raise ValueError("Le nom du profil d'auteur ne peut pas être vide")
    return stripped


class AuthorProfileMetadata(BaseModel):
    """Horodatages de création et de dernière modification."""

    created: datetime = Field(..., description="Création ISO 8601")
    modified: datetime = Field(..., description="Dernière modification ISO 8601")


class AuthorProfile(BaseModel):
    """Profil d'auteur persisté (fichier JSON UUID)."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="UUID du profil (nom fichier)")
    name: str = Field(..., description="Nom affiché", min_length=1)
    description: str = Field(default="", description="Description libre")
    content: str = Field(default="", description="Texte du profil, envoyé au LLM")
    metadata: AuthorProfileMetadata = Field(..., description="Horodatages")
    ownerId: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("ownerId", "owner_id"),
        description="Identifiant du propriétaire (absent = legacy public)",
    )
    visibility: Literal["shared", "private"] = Field(
        default="shared",
        description="Partagé avec l'équipe (défaut) ou brouillon privé",
    )
    relation: Optional[Literal["owned", "team", "legacy"]] = Field(
        default=None,
        description="Relation de l'acteur au profil (calculée, non persistée)",
    )

    @field_validator("id")
    @classmethod
    def validate_uuid(cls, v: str) -> str:
        """Valide que l'ID est un UUID."""
        try:
            UUID(v)
        except ValueError as exc:
            raise ValueError(f"Invalid UUID format: {v}") from exc
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Refuse un nom vide après strip."""
        return _strip_required_name(v)


class AuthorProfileCreate(BaseModel):
    """Payload de création."""

    name: str = Field(..., min_length=1, max_length=AUTHOR_PROFILE_NAME_MAX_LENGTH)
    description: str = Field(default="", max_length=AUTHOR_PROFILE_DESCRIPTION_MAX_LENGTH)
    content: str = Field(default="", max_length=AUTHOR_PROFILE_CONTENT_MAX_LENGTH)
    visibility: Literal["shared", "private"] = Field(
        default="shared",
        description="Partagé avec l'équipe par défaut ; `private` pour un brouillon",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Refuse un nom vide après strip."""
        return _strip_required_name(v)


class AuthorProfileUpdate(BaseModel):
    """Payload PUT partiel."""

    name: Optional[str] = Field(None, min_length=1, max_length=AUTHOR_PROFILE_NAME_MAX_LENGTH)
    description: Optional[str] = Field(None, max_length=AUTHOR_PROFILE_DESCRIPTION_MAX_LENGTH)
    content: Optional[str] = Field(None, max_length=AUTHOR_PROFILE_CONTENT_MAX_LENGTH)
    visibility: Optional[Literal["shared", "private"]] = Field(
        None,
        description="Statut ; seul le propriétaire ou un admin peut le changer",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Refuse un nom vide après strip quand il est fourni."""
        return None if v is None else _strip_required_name(v)


class PrebuiltAuthorProfile(BaseModel):
    """Voix fournie avec le projet, en lecture seule."""

    id: str = Field(..., description="Slug stable du catalogue")
    name: str
    description: str = ""
    content: str = ""


class AuthorProfileListResponse(BaseModel):
    """Réponse de liste (profils visibles de l'acteur)."""

    profiles: List[AuthorProfile]
    total: int


def build_metadata(now: Any) -> AuthorProfileMetadata:
    """Métadonnées d'un profil qu'on vient de créer."""
    return AuthorProfileMetadata(created=now, modified=now)

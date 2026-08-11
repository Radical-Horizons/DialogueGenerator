"""Schémas Pydantic pour les collections de dialogues (Story 8.5 / FR84)."""

from pydantic import BaseModel, Field, field_validator, model_validator


class CollectionCreateRequest(BaseModel):
    """Création d'une collection (nom requis)."""

    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    icon: str | None = Field(default=None, max_length=16)

    @field_validator("name")
    @classmethod
    def _trim_name(cls, value: str) -> str:
        """Refuse un nom composé uniquement d'espaces."""
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Le nom de collection est vide")
        return trimmed


class CollectionUpdateRequest(BaseModel):
    """Mise à jour partielle d'une collection."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    icon: str | None = Field(default=None, max_length=16)

    @field_validator("name")
    @classmethod
    def _trim_name(cls, value: str | None) -> str | None:
        """Normalise le nom s'il est fourni."""
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Le nom de collection est vide")
        return trimmed

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "CollectionUpdateRequest":
        """Exige au moins un champ présent dans le payload (y compris null)."""
        if not self.model_fields_set:
            raise ValueError("Aucun champ à mettre à jour")
        return self


class CollectionResponse(BaseModel):
    """Collection exposée à l'API avec ses membres."""

    id: str
    name: str
    description: str | None = None
    icon: str | None = None
    owner_id: str
    created_at: str
    updated_at: str
    dialogue_ids: list[str] = Field(default_factory=list)


class CollectionDeleteResponse(BaseModel):
    """Confirmation de suppression avec compte de memberships retirés."""

    id: str
    removed_dialogue_count: int


class CollectionDialoguesRequest(BaseModel):
    """Ajout ou retrait de dialogues dans une collection."""

    document_ids: list[str] = Field(..., min_length=1)

    @field_validator("document_ids")
    @classmethod
    def _non_empty_ids(cls, value: list[str]) -> list[str]:
        """Refuse les identifiants vides."""
        cleaned = [item.strip() for item in value if item and item.strip()]
        if not cleaned:
            raise ValueError("document_ids ne peut pas être vide")
        return cleaned

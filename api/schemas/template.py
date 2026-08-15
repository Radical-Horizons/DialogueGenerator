"""Schémas Pydantic pour les templates de génération custom."""
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator
from uuid import UUID

from api.schemas.preset import PresetConfiguration, PresetMetadata


def _strip_required_name(value: str) -> str:
    """Normalise le nom : strip, puis refuse le vide (422)."""
    stripped = value.strip()
    if not stripped:
        raise ValueError("Le nom du template ne peut pas être vide")
    return stripped


class TemplateConfiguration(PresetConfiguration):
    """Configuration snapshotée d'un template (PresetConfiguration + champs LLM optionnels)."""

    llmProvider: Optional[str] = Field(
        None,
        description="Fournisseur LLM (openai, mistral, openrouter)",
    )
    temperature: Optional[float] = Field(
        None,
        description="Température de sampling (optionnelle)",
    )


class Template(BaseModel):
    """Modèle complet d'un template custom."""

    id: str = Field(..., description="UUID du template (nom fichier)")
    name: str = Field(..., description="Nom du template", min_length=1)
    description: str = Field(default="", description="Description libre")
    category: str = Field(default="Général", description="Catégorie d'affichage")
    icon: str = Field(default="📋", description="Emoji icône")
    metadata: PresetMetadata = Field(..., description="Métadonnées de création / modification")
    configuration: TemplateConfiguration = Field(..., description="Snapshot de configuration")

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


class TemplateCreate(BaseModel):
    """Payload de création d'un template."""

    name: str = Field(..., description="Nom du template", min_length=1)
    description: str = Field(default="", description="Description libre")
    category: str = Field(default="Général", description="Catégorie d'affichage")
    icon: str = Field(default="📋", description="Emoji icône")
    configuration: TemplateConfiguration = Field(..., description="Snapshot de configuration")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Refuse un nom vide après strip."""
        return _strip_required_name(v)


class TemplateCreateResponse(Template):
    """Réponse POST 201 : template persisté + warnings GDD (jamais bloquants)."""

    warnings: List[str] = Field(
        default_factory=list,
        description="Avertissements de références GDD obsolètes ou résolues",
    )

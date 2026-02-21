"""Schémas Pydantic pour les endpoints document (GET/PUT) avec revision.

Story 16.2 : document canonique, schemaVersion, revision ; pas de nodes/edges au top level.
"""
from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field

ValidationMode = Literal["draft", "export"]


class ValidationErrorItem(BaseModel):
    """Une erreur de validation structurée (code, message, path)."""

    code: str = Field(..., description="Code d'erreur (ex. missing_choice_id, validation_error)")
    message: str = Field(..., description="Message lisible")
    path: str = Field(default="", description="Chemin JSON ou champ concerné")


class DocumentGetResponse(BaseModel):
    """Réponse GET /documents/{id} : document persisté + schemaVersion + revision."""

    document: Dict[str, Any] = Field(..., description="Document canonique (schemaVersion, nodes)")
    schemaVersion: str = Field(..., description="Version du schéma depuis le document")
    revision: int = Field(..., ge=1, description="Numéro de révision du document")


class PutDocumentRequest(BaseModel):
    """Corps PUT /documents/{id} : document + revision + optionnel validationMode."""

    document: Dict[str, Any] = Field(..., description="Document canonique (schemaVersion, nodes)")
    revision: int = Field(..., ge=1, description="Révision côté client (pour optimistic locking)")
    validationMode: ValidationMode = Field(
        default="draft",
        description="draft: validation non bloquante (autosave) ; export: validation bloquante.",
    )


class PutDocumentResponse(BaseModel):
    """Réponse PUT /documents/{id} en succès : revision + validationReport."""

    revision: int = Field(..., ge=1, description="Nouvelle révision après persistance")
    validationReport: List[ValidationErrorItem] = Field(
        default_factory=list,
        description="Erreurs de validation structurées (code, message, path)",
    )


# --- Layout (Story 16.3) ---


class LayoutGetResponse(BaseModel):
    """Réponse GET /documents/{id}/layout : layout persisté + revision."""

    layout: Dict[str, Any] = Field(..., description="Layout libre (positions, viewport, etc.)")
    revision: int = Field(..., ge=1, description="Numéro de révision du layout")


class PutLayoutRequest(BaseModel):
    """Corps PUT /documents/{id}/layout : layout + revision (optimistic locking)."""

    layout: Dict[str, Any] = Field(..., description="Layout libre (positions, viewport, etc.)")
    revision: int = Field(..., ge=1, description="Révision côté client (pour optimistic locking)")


class PutLayoutResponse(BaseModel):
    """Réponse PUT /documents/{id}/layout en succès : revision."""

    revision: int = Field(..., ge=1, description="Nouvelle révision après persistance")

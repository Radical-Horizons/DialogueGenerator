"""Schémas Pydantic pour les endpoints document (GET/PUT) avec revision.

Story 16.2 : document canonique, schemaVersion, revision ; pas de nodes/edges au top level.
"""
from typing import Any, Dict, List, Literal, Optional, Self

from pydantic import BaseModel, Field, model_validator

from api.schemas.graph import ValidationErrorDetail
from services.dialogue_preview_limits import MAX_VALIDATE_FLAG_REFERENCES_INLINE_NODES

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
    flagThresholdWarnings: List[str] = Field(
        default_factory=list,
        description="Alertes non bloquantes seuils flags dialogue (Story 9.1)",
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

    revision: int = Field(..., ge=1, description="Numéro de révision après persistance")


# --- Validation références flags (Story 9.5 / FR93) ---


class ValidateFlagReferencesRequest(BaseModel):
    """Corps optionnel : document en mémoire ; sinon lecture du fichier persisté."""

    document: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Document canonique à analyser ; si absent, lecture depuis le stockage.",
    )

    @model_validator(mode="after")
    def _validate_inline_document_size(self) -> Self:
        """Limite la taille d'un document inline pour éviter un DoS authentifié."""
        if self.document is None:
            return self
        nodes = self.document.get("nodes")
        if isinstance(nodes, list) and len(nodes) > MAX_VALIDATE_FLAG_REFERENCES_INLINE_NODES:
            raise ValueError(
                "document.nodes: au plus "
                f"{MAX_VALIDATE_FLAG_REFERENCES_INLINE_NODES} nœuds autorisés"
            )
        return self


class ValidateFlagReferencesResponse(BaseModel):
    """Réponse POST validate-flag-references."""

    valid: bool = Field(..., description="True si aucune erreur bloquante (références manquantes)")
    summary: str = Field(..., description="Résumé lisible (erreurs, warnings, compteurs)")
    used_flag_count: int = Field(..., ge=0, description="Nombre de flags distincts référencés")
    errors: List[ValidationErrorDetail] = Field(default_factory=list)
    warnings: List[ValidationErrorDetail] = Field(default_factory=list)


# --- Migration choiceId (Story 16.5, CI / pre-commit) ---


class DocumentMigrationItem(BaseModel):
    """Un document v1.1.0 dont au moins un choice n'a pas de choiceId."""

    documentId: str = Field(..., description="Identifiant du document (ex. filename)")
    path: str = Field(..., description="Chemin du premier choice sans choiceId (ex. nodes.0.choices.1)")


class CheckMigrationResponse(BaseModel):
    """Réponse GET /documents/check-migration : liste des documents à migrer."""

    needsMigration: List[DocumentMigrationItem] = Field(
        default_factory=list,
        description="Documents avec schemaVersion >= 1.1.0 et au moins un choice sans choiceId",
    )

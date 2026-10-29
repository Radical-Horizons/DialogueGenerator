"""Schémas Pydantic pour les presets."""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict
from datetime import datetime
from uuid import UUID

from api.schemas.validation_rules import ContextDroppingRulesSchema


class PresetMetadata(BaseModel):
    """Métadonnées du preset."""
    created: datetime = Field(..., description="Date de création ISO 8601")
    modified: datetime = Field(..., description="Date de dernière modification ISO 8601")


class PresetConfiguration(BaseModel):
    """Configuration de génération du preset."""

    characters: List[str] = Field(default_factory=list, description="IDs des personnages")
    locations: List[str] = Field(default_factory=list, description="IDs des lieux")
    region: str = Field(..., description="Région principale")
    subLocation: Optional[str] = Field(None, description="Sous-lieu optionnel")
    sceneType: str = Field(..., description="Type de scène (ex: 'Première rencontre')")
    instructions: str = Field(default="", description="Instructions de scène")
    fieldConfigs: Optional[Dict[str, List[str]]] = Field(None, description="Configuration champs contexte (optionnel)")
    # Snapshot complet du ContextSelector (toutes catégories) + région/sous-lieux
    contextSelections: Optional[Dict] = Field(None, description="Snapshot complet des sélections de contexte (optionnel)")
    selectedRegion: Optional[str] = Field(None, description="Région sélectionnée dans le ContextSelector (optionnel)")
    selectedSubLocations: Optional[List[str]] = Field(None, description="Sous-lieux sélectionnés dans le ContextSelector (optionnel)")
    # Aligné avec frontend/src/types/preset.ts (paramètres LLM optionnels)
    topP: Optional[float] = Field(None, description="Top-p (nucleus sampling)")
    reasoningEffort: Optional[str] = Field(None, description="Effort de raisonnement (valeurs UI / OpenAI)")
    maxCompletionTokens: Optional[int] = Field(None, ge=0, description="Plafond tokens complétion")
    maxChoices: Optional[int] = Field(None, ge=0, description="Nombre max de choix générés")
    llmModel: Optional[str] = Field(None, description="Identifiant modèle LLM")
    contextDroppingRules: Optional[ContextDroppingRulesSchema] = Field(
        None,
        description="Copie des règles anti-drop (None = pas d'overlay)",
    )


class Preset(BaseModel):
    """Modèle complet d'un preset."""
    id: str = Field(..., description="UUID du preset (nom fichier)")
    name: str = Field(..., description="Nom du preset", min_length=1)
    icon: str = Field(default="📋", description="Emoji icône")
    metadata: PresetMetadata = Field(..., description="Métadonnées")
    configuration: PresetConfiguration = Field(..., description="Configuration")
    
    @field_validator('id')
    @classmethod
    def validate_uuid(cls, v: str) -> str:
        """Valide que l'ID est un UUID valide."""
        try:
            UUID(v)  # Lève ValueError si invalide
        except ValueError:
            raise ValueError(f"Invalid UUID format: {v}")
        return v


class PresetCreate(BaseModel):
    """Modèle pour création de preset."""
    name: str = Field(..., description="Nom du preset", min_length=1)
    icon: str = Field(default="📋", description="Emoji icône")
    configuration: PresetConfiguration = Field(..., description="Configuration")


class PresetUpdate(BaseModel):
    """Modèle pour mise à jour de preset (tous champs optionnels)."""
    name: Optional[str] = Field(None, description="Nouveau nom", min_length=1)
    icon: Optional[str] = Field(None, description="Nouvel emoji")
    configuration: Optional[PresetConfiguration] = Field(None, description="Nouvelle configuration")


class PresetValidationResult(BaseModel):
    """Résultat de validation des références GDD."""
    valid: bool = Field(..., description="True si toutes références valides")
    warnings: List[str] = Field(default_factory=list, description="Messages d'avertissement")
    obsoleteRefs: List[str] = Field(default_factory=list, description="Liste IDs références obsolètes")
    resolvedRefs: Dict[str, str] = Field(
        default_factory=dict,
        description="Ancien libellé → Nom canonique GDD (alias ou fuzzy)",
    )

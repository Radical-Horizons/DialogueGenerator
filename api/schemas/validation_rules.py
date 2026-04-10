"""Schémas Pydantic pour les règles de validation anti-context-dropping (Story 4.10)."""
from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class DialogueTypeRuleOverride(BaseModel):
    """Surcharge de règles pour un type de dialogue spécifique."""

    rules_profile: Optional[Literal["strict", "light"]] = Field(
        None,
        description="Profil appliqué pour ce type (priorité sur la règle globale).",
    )
    tolerance: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Tolérance pour ce type de dialogue.",
    )


class ContextDroppingRulesSchema(BaseModel):
    """Règles de validation anti-context-dropping persistées (GET/PUT)."""

    rules_profile: Literal["strict", "light"] = Field(
        "strict",
        description="Profil global : 'strict' = sensibilité maximale, 'light' = tolérance élevée.",
    )
    tolerance: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Seuil souple [0, 1] pour la détection. None = comportement par défaut du profil.",
    )
    mandatory_info: List[str] = Field(
        default_factory=list,
        description="Labels d'informations dont la présence est obligatoire dans le graphe.",
    )
    dialogue_type_overrides: Dict[str, DialogueTypeRuleOverride] = Field(
        default_factory=dict,
        description="Surcharges par type de dialogue (clé = type, valeur = override).",
    )
    schema_version: str = Field(
        "1.0",
        description="Version du schéma pour migrations futures.",
    )

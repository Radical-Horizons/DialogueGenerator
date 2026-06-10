"""Schémas Pydantic pour les flags in-game."""
from typing import Optional, List, Union, Literal, Dict
from pydantic import BaseModel, Field


# Union type pour les valeurs de flags (bool, int, float, string)
FlagValue = Union[bool, int, float, str]


class FlagDefinition(BaseModel):
    """Définition d'un flag in-game (provenant du catalogue CSV).
    
    Attributes:
        id: Identifiant unique du flag (ex: "PLAYER_KILLED_BOSS").
        type: Type de valeur ("bool", "int", "float", "string").
        category: Catégorie du flag (ex: "Event", "Choice", "Stat").
        label: Label lisible par humain.
        description: Description détaillée du flag.
        defaultValue: Valeur par défaut (en string, sera convertie selon le type).
        defaultValueParsed: Valeur par défaut parsée selon le type (optionnel, calculé côté backend).
        tags: Liste de tags pour la recherche.
        isFavorite: Si le flag est marqué comme favori.
        semanticType: Type fonctionnel FR89 (bool | compteur | enum | unsupported).
        scope: Portée enrichie (conversationnel | mécanique).
        minValue: Borne basse catalogue pour compteur (optionnel).
        maxValue: Borne haute catalogue pour compteur (optionnel).
        enumValues: Valeurs enum ordonnées si applicable.
    """
    id: str = Field(..., description="Identifiant unique du flag")
    type: Literal["bool", "int", "float", "string"] = Field(..., description="Type de valeur du flag")
    category: str = Field(..., description="Catégorie du flag")
    label: str = Field(..., description="Label lisible par humain")
    description: Optional[str] = Field(None, description="Description détaillée")
    defaultValue: str = Field(..., description="Valeur par défaut (en string)")
    defaultValueParsed: Optional[FlagValue] = Field(None, description="Valeur par défaut parsée selon le type")
    tags: List[str] = Field(default_factory=list, description="Liste de tags")
    isFavorite: bool = Field(default=False, description="Si le flag est marqué comme favori")
    semanticType: Optional[str] = Field(None, description="Type FR89 dérivé du CSV")
    scope: Optional[str] = Field(None, description="Portée conversationnel / mécanique")
    minValue: Optional[FlagValue] = Field(None, description="Min compteur catalogue")
    maxValue: Optional[FlagValue] = Field(None, description="Max compteur catalogue")
    enumValues: List[str] = Field(default_factory=list, description="Valeurs enum ordonnées")


class InGameFlag(BaseModel):
    """Flag in-game avec sa valeur actuelle (sélection runtime).
    
    Attributes:
        id: Identifiant du flag.
        value: Valeur actuelle du flag.
        category: Catégorie du flag (pour affichage/tri).
        timestamp: Timestamp optionnel (ISO format).
    """
    id: str = Field(..., description="Identifiant du flag")
    value: FlagValue = Field(..., description="Valeur actuelle du flag")
    category: Optional[str] = Field(None, description="Catégorie du flag")
    timestamp: Optional[str] = Field(None, description="Timestamp ISO (optionnel)")


class FlagsCatalogResponse(BaseModel):
    """Réponse pour la liste des définitions de flags.
    
    Attributes:
        flags: Liste des définitions de flags.
        total: Nombre total de flags.
    """
    flags: List[FlagDefinition] = Field(..., description="Liste des définitions de flags")
    total: int = Field(..., description="Nombre total de flags")


class UpsertFlagRequest(BaseModel):
    """Requête pour créer ou mettre à jour une définition de flag.
    
    Attributes:
        id: Identifiant unique du flag.
        type: Type de valeur.
        category: Catégorie du flag.
        label: Label lisible.
        description: Description détaillée.
        defaultValue: Valeur par défaut.
        tags: Liste de tags.
        isFavorite: Si favori.
    """
    id: str = Field(..., min_length=1, description="Identifiant unique du flag")
    type: Literal["bool", "int", "float", "string"] = Field(..., description="Type de valeur")
    category: str = Field(..., min_length=1, description="Catégorie du flag")
    label: str = Field(..., min_length=1, description="Label lisible")
    description: Optional[str] = Field(None, description="Description détaillée")
    defaultValue: str = Field(..., description="Valeur par défaut (en string)")
    tags: List[str] = Field(default_factory=list, description="Liste de tags")
    isFavorite: bool = Field(default=False, description="Si favori")


class UpsertFlagResponse(BaseModel):
    """Réponse pour l'upsert d'un flag.
    
    Attributes:
        success: Si l'opération a réussi.
        flag: La définition du flag créée/mise à jour.
    """
    success: bool = Field(..., description="Si l'opération a réussi")
    flag: FlagDefinition = Field(..., description="La définition du flag")


class ToggleFavoriteRequest(BaseModel):
    """Requête pour activer/désactiver le statut favori d'un flag.
    
    Attributes:
        flag_id: ID du flag.
        is_favorite: True pour marquer comme favori, False sinon.
    """
    flag_id: str = Field(..., description="ID du flag")
    is_favorite: bool = Field(..., description="True pour marquer comme favori")


class ToggleFavoriteResponse(BaseModel):
    """Réponse pour toggle favorite.
    
    Attributes:
        success: Si l'opération a réussi.
        flag_id: ID du flag modifié.
        is_favorite: Nouveau statut favori.
    """
    success: bool = Field(..., description="Si l'opération a réussi")
    flag_id: str = Field(..., description="ID du flag modifié")
    is_favorite: bool = Field(..., description="Nouveau statut favori")


class FlagSnapshot(BaseModel):
    """Snapshot d'état des flags (pour import/export Unity).
    
    Attributes:
        version: Version du format snapshot (ex: "1.0").
        timestamp: Timestamp ISO optionnel de création du snapshot.
        flags: Dictionnaire flag_id -> valeur (état actuel des flags).
    """
    version: str = Field(default="1.0", description="Version du format snapshot")
    timestamp: Optional[str] = Field(None, description="Timestamp ISO de création")
    flags: Dict[str, FlagValue] = Field(..., description="Dictionnaire flag_id -> valeur")


class ImportSnapshotRequest(BaseModel):
    """Requête pour importer un snapshot Unity.
    
    Attributes:
        snapshot_json: JSON string du snapshot Unity (FlagSnapshot sérialisé).
    """
    snapshot_json: str = Field(..., description="JSON string du snapshot Unity")


class ImportSnapshotResponse(BaseModel):
    """Réponse pour l'import d'un snapshot.
    
    Attributes:
        success: Si l'opération a réussi.
        imported_count: Nombre de flags importés.
        warnings: Liste des warnings (flags inconnus, etc.).
        snapshot: Le snapshot importé.
    """
    success: bool = Field(..., description="Si l'opération a réussi")
    imported_count: int = Field(..., description="Nombre de flags importés")
    warnings: List[str] = Field(default_factory=list, description="Warnings (flags inconnus, etc.)")
    snapshot: FlagSnapshot = Field(..., description="Le snapshot importé")


class ExportSnapshotRequest(BaseModel):
    """Requête pour exporter un snapshot (sélection actuelle).
    
    Attributes:
        flags: Liste des flags à exporter (si None, exporte tous les flags sélectionnés).
    """
    flags: Optional[List[InGameFlag]] = Field(None, description="Flags à exporter (si None, exporte la sélection actuelle)")


class ExportSnapshotResponse(BaseModel):
    """Réponse pour l'export d'un snapshot.
    
    Attributes:
        success: Si l'opération a réussi.
        snapshot: Le snapshot exporté.
    """
    success: bool = Field(..., description="Si l'opération a réussi")
    snapshot: FlagSnapshot = Field(..., description="Le snapshot exporté")

"""Schémas Pydantic pour les endpoints de configuration."""
import sys
from pathlib import Path
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

_root_dir = Path(__file__).parent.parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from constants import Defaults


class FieldInfo(BaseModel):
    """Information sur un champ de contexte.
    
    Attributes:
        path: Chemin du champ (ex: "Nom", "Introduction.Résumé de la fiche").
        label: Libellé du champ.
        type: Type du champ (string, list, dict).
        depth: Profondeur du champ dans la hiérarchie.
        frequency: Fréquence du champ (0.0 à 1.0).
        suggested: Si True, le champ est suggéré pour le type de génération.
        category: Catégorie du champ (identity, characterization, voice, background, mechanics).
        importance: Niveau d'importance du champ.
        is_metadata: Si True, le champ est une métadonnée.
        is_essential: Si True, le champ est considéré comme essentiel.
        is_unique: Si True, le champ est unique (n'apparaît que dans une seule fiche).
        is_in_config: Si True, le champ est référencé dans context_config.json.
        is_valid: Si True, le champ existe réellement dans les données GDD.
    """
    path: str = Field(..., description="Chemin du champ")
    label: str = Field(..., description="Libellé du champ")
    type: str = Field(..., description="Type du champ")
    depth: int = Field(..., description="Profondeur du champ")
    frequency: float = Field(..., description="Fréquence du champ (0.0 à 1.0)")
    suggested: bool = Field(default=False, description="Si True, le champ est suggéré")
    category: Optional[str] = Field(None, description="Catégorie du champ")
    importance: str = Field(..., description="Niveau d'importance du champ")
    is_metadata: bool = Field(default=False, description="Si True, le champ est une métadonnée")
    is_essential: bool = Field(default=False, description="Si True, le champ est essentiel")
    is_unique: bool = Field(default=False, description="Si True, le champ est unique")
    is_in_config: bool = Field(default=False, description="Si True, le champ est dans context_config.json")
    is_valid: bool = Field(default=True, description="Si True, le champ existe dans les données GDD")


class ContextFieldsResponse(BaseModel):
    """Réponse contenant la liste des champs de contexte disponibles.
    
    Attributes:
        element_type: Type d'élément (character, location, etc.).
        fields: Dictionnaire des informations sur les champs (clé = path du champ).
        total: Nombre total de champs.
        unique_fields_by_item: Nombre de fiches avec des champs uniques.
    """
    element_type: str = Field(..., description="Type d'élément")
    fields: Dict[str, FieldInfo] = Field(default_factory=dict, description="Dictionnaire des champs de contexte")
    total: int = Field(..., description="Nombre total de champs")
    unique_fields_by_item: int = Field(default=0, description="Nombre de fiches avec des champs uniques")


class ContextFieldSuggestionsRequest(BaseModel):
    """Requête pour obtenir des suggestions de champs de contexte.
    
    Attributes:
        element_type: Type d'élément (character, location, item, etc.).
        context: Type de contexte (dialogue, action, etc.).
        selected_fields: Champs déjà sélectionnés.
    """
    element_type: str = Field(..., description="Type d'élément")
    context: str = Field(..., description="Type de contexte (dialogue, action, etc.)")
    selected_fields: List[str] = Field(default_factory=list, description="Champs déjà sélectionnés")


class ContextFieldSuggestionsResponse(BaseModel):
    """Réponse contenant des suggestions de champs de contexte.
    
    Attributes:
        element_type: Type d'élément.
        context: Type de contexte.
        suggested_fields: Liste des suggestions de champs.
    """
    element_type: str = Field(..., description="Type d'élément")
    context: str = Field(..., description="Type de contexte")
    suggested_fields: List[str] = Field(default_factory=list, description="Liste des suggestions")


class ContextPreviewRequest(BaseModel):
    """Requête pour obtenir un aperçu du contexte construit.
    
    Attributes:
        selected_elements: Éléments sélectionnés (characters, locations, etc.).
        field_configs: Configuration des champs par type d'élément.
        organization_mode: Mode d'organisation du contexte.
        scene_instruction: Instructions de scène.
        max_tokens: Nombre maximum de tokens pour l'aperçu.
    """
    selected_elements: Dict[str, List[str]] = Field(..., description="Éléments sélectionnés")
    field_configs: Optional[Dict[str, List[str]]] = Field(None, description="Configuration des champs par type")
    organization_mode: Optional[str] = Field("default", description="Mode d'organisation")
    scene_instruction: Optional[str] = Field(None, description="Instructions de scène")
    max_tokens: int = Field(
        default=Defaults.CONTEXT_TOKENS,
        ge=Defaults.MIN_CONTEXT_TOKENS,
        le=Defaults.MAX_CONTEXT_TOKENS,
        description="Nombre maximum de tokens",
    )


class ContextPreviewResponse(BaseModel):
    """Réponse contenant un aperçu du contexte.
    
    Attributes:
        structured_prompt: Structure JSON du contexte (optionnel).
        preview: Texte de l'aperçu.
        tokens: Nombre estimé de tokens.
    """
    preview: str = Field(..., description="Texte de l'aperçu")
    tokens: int = Field(..., description="Nombre estimé de tokens")
    structured_prompt: Optional[Dict[str, Any]] = Field(None, description="Structure JSON du contexte pour affichage structuré")


class DefaultFieldConfigResponse(BaseModel):
    """Réponse contenant la configuration par défaut des champs.
    
    Attributes:
        essential_fields: Champs essentiels (courts, toujours sélectionnés) par type d'élément.
        default_fields: Tous les champs par défaut (priorités 1, 2, 3) par type d'élément.
    """
    essential_fields: Dict[str, List[str]] = Field(..., description="Champs essentiels par type d'élément")
    default_fields: Dict[str, List[str]] = Field(..., description="Champs par défaut par type d'élément")


class SceneInstructionTemplate(BaseModel):
    """Template d'instructions de scène.
    
    Attributes:
        id: Identifiant du template.
        name: Nom du template.
        description: Description du template.
        instructions: Instructions de scène.
    """
    id: str = Field(..., description="Identifiant du template")
    name: str = Field(..., description="Nom du template")
    description: str = Field(..., description="Description du template")
    instructions: str = Field(..., description="Instructions de scène")


class SceneInstructionTemplatesResponse(BaseModel):
    """Réponse contenant la liste des templates d'instructions de scène.
    
    Attributes:
        templates: Liste des templates.
        total: Nombre total de templates.
    """
    templates: List[SceneInstructionTemplate] = Field(default_factory=list, description="Liste des templates")
    total: int = Field(default=0, description="Nombre total de templates")


class AuthorProfileTemplate(BaseModel):
    """Template de profil d'auteur.
    
    Attributes:
        id: Identifiant du template.
        name: Nom du template.
        description: Description du template.
        profile: Profil d'auteur.
    """
    id: str = Field(..., description="Identifiant du template")
    name: str = Field(..., description="Nom du template")
    description: str = Field(..., description="Description du template")
    profile: str = Field(..., description="Profil d'auteur")


class AuthorProfileTemplatesResponse(BaseModel):
    """Réponse contenant la liste des templates de profils d'auteur.
    
    Attributes:
        templates: Liste des templates.
        total: Nombre total de templates.
    """
    templates: List[AuthorProfileTemplate] = Field(default_factory=list, description="Liste des templates")
    total: int = Field(default=0, description="Nombre total de templates")


class TemplateFilePathsResponse(BaseModel):
    """Réponse contenant les chemins des fichiers de templates.
    
    Attributes:
        system_prompt_path: Chemin du fichier system prompt par défaut.
        scene_instructions_dir: Chemin du répertoire des instructions de scène.
        author_profiles_dir: Chemin du répertoire des profils d'auteur.
    """
    system_prompt_path: str = Field(..., description="Chemin du fichier system prompt par défaut")
    scene_instructions_dir: str = Field(..., description="Chemin du répertoire des instructions de scène")
    author_profiles_dir: str = Field(..., description="Chemin du répertoire des profils d'auteur")
    config_dir: str = Field(..., description="Chemin du répertoire de configuration")

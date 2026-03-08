"""Schémas Pydantic pour le contexte GDD."""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from api.schemas.dialogue import ContextSelection
import sys
from pathlib import Path

# Ajouter le répertoire racine au path pour importer constants
_root_dir = Path(__file__).parent.parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from constants import Defaults


class CharacterResponse(BaseModel):
    """Réponse contenant un personnage.
    
    Attributes:
        name: Nom du personnage.
        data: Données complètes du personnage (dict JSON).
    """
    name: str = Field(..., description="Nom du personnage")
    data: Dict[str, Any] = Field(..., description="Données complètes du personnage")


class LocationResponse(BaseModel):
    """Réponse contenant un lieu.
    
    Attributes:
        name: Nom du lieu.
        data: Données complètes du lieu (dict JSON).
    """
    name: str = Field(..., description="Nom du lieu")
    data: Dict[str, Any] = Field(..., description="Données complètes du lieu")


class ItemResponse(BaseModel):
    """Réponse contenant un objet.
    
    Attributes:
        name: Nom de l'objet.
        data: Données complètes de l'objet (dict JSON).
    """
    name: str = Field(..., description="Nom de l'objet")
    data: Dict[str, Any] = Field(..., description="Données complètes de l'objet")


class CharacterListResponse(BaseModel):
    """Réponse contenant une liste de personnages.
    
    Attributes:
        characters: Liste des personnages.
        total: Nombre total de personnages.
        page: Numéro de page actuelle (1-indexed, None si pas de pagination).
        page_size: Taille de la page (None si pas de pagination).
        total_pages: Nombre total de pages (None si pas de pagination).
    """
    characters: List[CharacterResponse] = Field(..., description="Liste des personnages")
    total: int = Field(..., description="Nombre total de personnages")
    page: Optional[int] = Field(None, description="Numéro de page actuelle (1-indexed)")
    page_size: Optional[int] = Field(None, description="Taille de la page")
    total_pages: Optional[int] = Field(None, description="Nombre total de pages")


class LocationListResponse(BaseModel):
    """Réponse contenant une liste de lieux.
    
    Attributes:
        locations: Liste des lieux.
        total: Nombre total de lieux.
        page: Numéro de page actuelle (1-indexed, None si pas de pagination).
        page_size: Taille de la page (None si pas de pagination).
        total_pages: Nombre total de pages (None si pas de pagination).
    """
    locations: List[LocationResponse] = Field(..., description="Liste des lieux")
    total: int = Field(..., description="Nombre total de lieux")
    page: Optional[int] = Field(None, description="Numéro de page actuelle (1-indexed)")
    page_size: Optional[int] = Field(None, description="Taille de la page")
    total_pages: Optional[int] = Field(None, description="Nombre total de pages")


class ItemListResponse(BaseModel):
    """Réponse contenant une liste d'objets.
    
    Attributes:
        items: Liste des objets.
        total: Nombre total d'objets.
        page: Numéro de page actuelle (1-indexed, None si pas de pagination).
        page_size: Taille de la page (None si pas de pagination).
        total_pages: Nombre total de pages (None si pas de pagination).
    """
    items: List[ItemResponse] = Field(..., description="Liste des objets")
    total: int = Field(..., description="Nombre total d'objets")
    page: Optional[int] = Field(None, description="Numéro de page actuelle (1-indexed)")
    page_size: Optional[int] = Field(None, description="Taille de la page")
    total_pages: Optional[int] = Field(None, description="Nombre total de pages")


class SpeciesResponse(BaseModel):
    """Réponse contenant une espèce.
    
    Attributes:
        name: Nom de l'espèce.
        data: Données complètes de l'espèce (dict JSON).
    """
    name: str = Field(..., description="Nom de l'espèce")
    data: Dict[str, Any] = Field(..., description="Données complètes de l'espèce")


class SpeciesListResponse(BaseModel):
    """Réponse contenant une liste d'espèces.
    
    Attributes:
        species: Liste des espèces.
        total: Nombre total d'espèces.
        page: Numéro de page actuelle (1-indexed, None si pas de pagination).
        page_size: Taille de la page (None si pas de pagination).
        total_pages: Nombre total de pages (None si pas de pagination).
    """
    species: List[SpeciesResponse] = Field(..., description="Liste des espèces")
    total: int = Field(..., description="Nombre total d'espèces")
    page: Optional[int] = Field(None, description="Numéro de page actuelle (1-indexed)")
    page_size: Optional[int] = Field(None, description="Taille de la page")
    total_pages: Optional[int] = Field(None, description="Nombre total de pages")


class CommunityResponse(BaseModel):
    """Réponse contenant une communauté.
    
    Attributes:
        name: Nom de la communauté.
        data: Données complètes de la communauté (dict JSON).
    """
    name: str = Field(..., description="Nom de la communauté")
    data: Dict[str, Any] = Field(..., description="Données complètes de la communauté")


class CommunityListResponse(BaseModel):
    """Réponse contenant une liste de communautés.
    
    Attributes:
        communities: Liste des communautés.
        total: Nombre total de communautés.
    """
    communities: List[CommunityResponse] = Field(..., description="Liste des communautés")
    total: int = Field(..., description="Nombre total de communautés")


class RegionListResponse(BaseModel):
    """Réponse contenant une liste de régions.
    
    Attributes:
        regions: Liste des noms de régions.
        total: Nombre total de régions.
    """
    regions: List[str] = Field(..., description="Liste des noms de régions")
    total: int = Field(..., description="Nombre total de régions")


class SubLocationListResponse(BaseModel):
    """Réponse contenant une liste de sous-lieux.
    
    Attributes:
        sub_locations: Liste des noms de sous-lieux.
        total: Nombre total de sous-lieux.
        region_name: Nom de la région.
    """
    sub_locations: List[str] = Field(..., description="Liste des noms de sous-lieux")
    total: int = Field(..., description="Nombre total de sous-lieux")
    region_name: str = Field(..., description="Nom de la région")


class LinkedElementsRequest(BaseModel):
    """Requête pour obtenir les éléments liés.
    
    Attributes:
        character_a: Nom du premier personnage (optionnel).
        character_b: Nom du deuxième personnage (optionnel).
        scene_region: Nom de la région de la scène (optionnel).
        sub_location: Nom du sous-lieu (optionnel).
    """
    character_a: Optional[str] = Field(None, description="Nom du premier personnage")
    character_b: Optional[str] = Field(None, description="Nom du deuxième personnage")
    scene_region: Optional[str] = Field(None, description="Nom de la région de la scène")
    sub_location: Optional[str] = Field(None, description="Nom du sous-lieu")


class LinkedElementsResponse(BaseModel):
    """Réponse contenant les éléments liés.
    
    Attributes:
        linked_elements: Liste des noms d'éléments à sélectionner.
        total: Nombre total d'éléments.
    """
    linked_elements: List[str] = Field(..., description="Liste des noms d'éléments à sélectionner")
    total: int = Field(..., description="Nombre total d'éléments")


class BuildContextRequest(BaseModel):
    """Requête pour construire un contexte personnalisé.
    
    Attributes:
        context_selections: Sélections de contexte GDD.
        user_instructions: Instructions utilisateur.
        max_tokens: Nombre maximum de tokens.
        include_dialogue_type: Inclure le type de dialogue dans le contexte.
    """
    context_selections: ContextSelection = Field(..., description="Sélections de contexte GDD")
    user_instructions: str = Field(default="", description="Instructions utilisateur")
    max_tokens: int = Field(default=1500, ge=100, le=Defaults.MAX_CONTEXT_TOKENS, description="Nombre maximum de tokens")
    include_dialogue_type: bool = Field(default=False, description="Inclure le type de dialogue")


class BuildContextResponse(BaseModel):
    """Réponse contenant le contexte construit.
    
    Attributes:
        context: Le contexte construit (texte).
        token_count: Nombre de tokens du contexte.
    """
    context: str = Field(..., description="Contexte construit")
    token_count: int = Field(..., description="Nombre de tokens")


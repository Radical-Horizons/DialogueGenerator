"""Service de résolution d'éléments GDD avec mappings centralisés."""
import logging
from typing import Dict, List, Optional, Any, Callable

from services.element_repository import ElementRepository, ElementCategory

logger = logging.getLogger(__name__)


class ElementResolver:
    """Résout les éléments GDD par catégorie avec mappings centralisés.
    
    Centralise les mappings entre catégories, types d'éléments, labels et méthodes
    de résolution pour simplifier l'accès aux éléments GDD.
    """
    
    # Mapping des catégories vers les types d'éléments (pour context_config.json)
    ELEMENT_TYPE_MAP: Dict[str, str] = {
        "characters": "character",
        "characters_full": "character",
        "characters_excerpt": "character",
        "locations": "location",
        "locations_full": "location",
        "locations_excerpt": "location",
        "items": "item",
        "items_full": "item",
        "items_excerpt": "item",
        "species": "species",
        "species_full": "species",
        "species_excerpt": "species",
        "communities": "community",
        "communities_full": "community",
        "communities_excerpt": "community",
        "quests": "quest",
    }
    
    # Mapping des catégories vers les labels pour les marqueurs explicites
    ELEMENT_LABEL_MAP: Dict[str, str] = {
        "characters": "PNJ",
        "characters_full": "PNJ",
        "characters_excerpt": "PNJ",
        "locations": "LIEU",
        "locations_full": "LIEU",
        "locations_excerpt": "LIEU",
        "items": "OBJET",
        "items_full": "OBJET",
        "items_excerpt": "OBJET",
        "species": "ESPÈCE",
        "species_full": "ESPÈCE",
        "species_excerpt": "ESPÈCE",
        "communities": "COMMUNAUTÉ",
        "communities_full": "COMMUNAUTÉ",
        "communities_excerpt": "COMMUNAUTÉ",
        "quests": "QUÊTE",
    }
    
    # Mapping des catégories vers les ElementCategory
    CATEGORY_TO_ELEMENT_CATEGORY: Dict[str, ElementCategory] = {
        "characters": ElementCategory.CHARACTERS,
        "characters_full": ElementCategory.CHARACTERS,
        "characters_excerpt": ElementCategory.CHARACTERS,
        "locations": ElementCategory.LOCATIONS,
        "locations_full": ElementCategory.LOCATIONS,
        "locations_excerpt": ElementCategory.LOCATIONS,
        "items": ElementCategory.ITEMS,
        "items_full": ElementCategory.ITEMS,
        "items_excerpt": ElementCategory.ITEMS,
        "species": ElementCategory.SPECIES,
        "species_full": ElementCategory.SPECIES,
        "species_excerpt": ElementCategory.SPECIES,
        "communities": ElementCategory.COMMUNITIES,
        "communities_full": ElementCategory.COMMUNITIES,
        "communities_excerpt": ElementCategory.COMMUNITIES,
        "quests": ElementCategory.QUESTS,
        "dialogues_examples": ElementCategory.DIALOGUES,
    }
    
    def __init__(self, element_repository: Optional[ElementRepository] = None):
        """Initialise le résolveur d'éléments.
        
        Args:
            element_repository: Repository d'éléments (créé si None).
        """
        self._element_repository = element_repository
    
    def get_element_type(self, category_key: str) -> str:
        """Retourne le type d'élément pour une catégorie.
        
        Args:
            category_key: Clé de catégorie (ex: "characters", "locations").
            
        Returns:
            Type d'élément correspondant (ex: "character", "location").
        """
        return self.ELEMENT_TYPE_MAP.get(category_key, category_key)
    
    def get_element_label(self, category_key: str) -> str:
        """Retourne le label d'élément pour les marqueurs explicites.
        
        Args:
            category_key: Clé de catégorie (ex: "characters", "locations").
            
        Returns:
            Label pour les marqueurs (ex: "PNJ", "LIEU").
        """
        return self.ELEMENT_LABEL_MAP.get(category_key, category_key.upper())
    
    def get_category_element_category(self, category_key: str) -> Optional[ElementCategory]:
        """Retourne l'ElementCategory correspondant à une catégorie.
        
        Args:
            category_key: Clé de catégorie (ex: "characters", "locations").
            
        Returns:
            ElementCategory correspondant ou None si non trouvé.
        """
        return self.CATEGORY_TO_ELEMENT_CATEGORY.get(category_key)
    
    def get_names(self, category_key: str) -> List[str]:
        """Récupère la liste des noms pour une catégorie.
        
        Args:
            category_key: Clé de catégorie (ex: "characters", "locations").
            
        Returns:
            Liste des noms (vide si repository non disponible ou catégorie invalide).
        """
        if self._element_repository is None:
            return []
        
        element_category = self.get_category_element_category(category_key)
        if element_category is None:
            logger.warning(f"Catégorie '{category_key}' non reconnue pour get_names()")
            return []
        
        return self._element_repository.get_names(element_category)
    
    def get_by_name(self, category_key: str, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un élément par catégorie et nom.
        
        Args:
            category_key: Clé de catégorie (ex: "characters", "locations").
            name: Nom de l'élément à récupérer.
            
        Returns:
            Données de l'élément ou None si non trouvé.
        """
        if self._element_repository is None:
            return None
        
        element_category = self.get_category_element_category(category_key)
        if element_category is None:
            logger.warning(f"Catégorie '{category_key}' non reconnue pour get_by_name()")
            return None
        
        return self._element_repository.get_by_name(element_category, name)
    
    def resolve_element_data(self, category_key: str, name: str) -> Optional[Dict[str, Any]]:
        """Résout les données d'un élément par catégorie et nom.
        
        Alias pour get_by_name() pour compatibilité avec le code existant.
        
        Args:
            category_key: Clé de catégorie (ex: "characters", "locations").
            name: Nom de l'élément à résoudre.
            
        Returns:
            Données de l'élément ou None si non trouvé.
        """
        return self.get_by_name(category_key, name)
    
    def get_dialogue_examples_titles(self) -> List[str]:
        """Récupère les titres des exemples de dialogues.
        
        Returns:
            Liste des titres (vide si repository non disponible).
        """
        if self._element_repository is None:
            return []
        
        element_list = self._element_repository.get_all(ElementCategory.DIALOGUES)
        return [
            d.get("Nom") or d.get("Titre") or d.get("ID")
            for d in element_list
            if isinstance(d, dict)
        ]
    
    def prioritize_elements(self, selected_elements: Dict[str, List[str]]) -> Dict[str, List[str]]:
        """Priorise les éléments selon l'ordre standard.
        
        Args:
            selected_elements: Dictionnaire d'éléments sélectionnés par catégorie.
            
        Returns:
            Dictionnaire avec éléments prioritaires en premier, puis les autres.
        """
        element_categories_order = ["characters", "species", "communities", "locations", "items", "quests"]
        prioritized = {}
        for category_key in element_categories_order:
            if category_key in selected_elements:
                prioritized[category_key] = selected_elements[category_key]
        for category_key in selected_elements:
            if category_key not in prioritized:
                prioritized[category_key] = selected_elements[category_key]
        return prioritized

"""Repository pour l'accès aux éléments GDD par nom avec normalisation."""
import logging
from enum import Enum
from typing import Dict, List, Optional, Any

from services.gdd_loader import GDDData

logger = logging.getLogger(__name__)


class ElementCategory(Enum):
    """Catégories d'éléments GDD disponibles."""
    CHARACTERS = "characters"
    LOCATIONS = "locations"
    ITEMS = "items"
    SPECIES = "species"
    COMMUNITIES = "communities"
    QUESTS = "quests"
    DIALOGUES = "dialogues_examples"
    NARRATIVE_STRUCTURES = "narrative_structures"
    CHAPTERS = "chapters"
    SCENES = "scenes"


class ElementRepository:
    """Repository pour accéder aux éléments GDD par nom avec normalisation.
    
    Fournit des méthodes pour rechercher des éléments par nom en gérant
    la normalisation des apostrophes et caractères spéciaux.
    """
    
    # Mapping des catégories vers les clés de nom à utiliser pour la recherche
    NAME_KEYS_MAP = {
        ElementCategory.CHARACTERS: ["Nom"],
        ElementCategory.LOCATIONS: ["Nom"],
        ElementCategory.ITEMS: ["Nom"],
        ElementCategory.SPECIES: ["Nom"],
        ElementCategory.COMMUNITIES: ["Nom"],
        ElementCategory.QUESTS: ["Nom"],
        ElementCategory.DIALOGUES: ["Nom", "Titre", "ID"],
        ElementCategory.NARRATIVE_STRUCTURES: ["Nom"],
        ElementCategory.CHAPTERS: ["Nom", "Titre", "ID"],
        ElementCategory.SCENES: ["Nom", "Titre", "ID"],
    }
    
    def __init__(self, gdd_data: GDDData):
        """Initialise le repository avec les données GDD.
        
        Args:
            gdd_data: Instance de GDDData contenant les données chargées.
        """
        self._gdd_data = gdd_data
    
    @staticmethod
    def _normalize_string_for_matching(text: str) -> str:
        """Normalise une chaîne pour la comparaison (apostrophes, espaces, etc.).
        
        Args:
            text: Chaîne à normaliser.
            
        Returns:
            Chaîne normalisée pour comparaison.
        """
        if not text:
            return text
        # Normaliser les apostrophes typographiques vers apostrophe droite
        # U+2019 (') -> U+0027 (')
        # U+2018 (') -> U+0027 (')
        # U+201C (") -> U+0022 (")
        # U+201D (") -> U+0022 (")
        normalized = text.replace('\u2019', "'").replace('\u2018', "'")
        normalized = normalized.replace('\u201C', '"').replace('\u201D', '"')
        # Normaliser les espaces insécables
        normalized = normalized.replace('\u00A0', ' ')
        return normalized.strip()
    
    def _get_element_list(self, category: ElementCategory) -> List[Dict[str, Any]]:
        """Récupère la liste d'éléments pour une catégorie.
        
        Args:
            category: Catégorie d'éléments.
            
        Returns:
            Liste des éléments (peut être vide).
        """
        attribute_name = category.value
        element_list = getattr(self._gdd_data, attribute_name, None)
        
        if element_list is None:
            return []
        
        # Pour macro_structure et micro_structure qui sont des dict, retourner une liste vide
        if isinstance(element_list, dict):
            return []
        
        if isinstance(element_list, list):
            return element_list
        
        return []
    
    def _get_element_details_by_name(
        self,
        element_name: str,
        element_list: List[Dict[str, Any]],
        name_keys: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """Recherche un élément par nom avec normalisation des apostrophes.
        
        Args:
            element_name: Nom de l'élément à rechercher.
            element_list: Liste des éléments à parcourir.
            name_keys: Clés à utiliser pour la recherche (défaut: ["Nom"]).
            
        Returns:
            Dictionnaire de l'élément trouvé, ou None si non trouvé.
        """
        if name_keys is None:
            name_keys = ["Nom"]
        if not element_list or not element_name:
            return None
        
        # Normaliser le nom recherché
        normalized_search_name = self._normalize_string_for_matching(element_name)
        
        for element_data in element_list:
            if isinstance(element_data, dict):
                for key in name_keys:
                    element_value = element_data.get(key)
                    if element_value:
                        # Normaliser la valeur de l'élément pour comparaison
                        normalized_element_value = self._normalize_string_for_matching(str(element_value))
                        if normalized_element_value == normalized_search_name:
                            return element_data
        
        logger.warning(
            f"Élément '{element_name}' non trouvé dans la liste fournie avec les clés {name_keys}."
        )
        return None
    
    def get_names(self, category: ElementCategory) -> List[str]:
        """Récupère la liste des noms pour une catégorie d'éléments.
        
        Args:
            category: Catégorie d'éléments.
            
        Returns:
            Liste des noms (peut être vide).
        """
        element_list = self._get_element_list(category)
        
        if not element_list:
            return []
        
        name_keys = self.NAME_KEYS_MAP.get(category, ["Nom"])
        primary_key = name_keys[0]  # Utiliser la première clé comme clé principale
        
        names = []
        for element in element_list:
            if isinstance(element, dict):
                name = element.get(primary_key)
                if name:
                    names.append(name)
        
        return names
    
    def get_by_name(
        self,
        category: ElementCategory,
        name: str
    ) -> Optional[Dict[str, Any]]:
        """Récupère un élément par son nom.
        
        Args:
            category: Catégorie d'éléments.
            name: Nom de l'élément à rechercher.
            
        Returns:
            Dictionnaire de l'élément trouvé, ou None si non trouvé.
        """
        element_list = self._get_element_list(category)
        name_keys = self.NAME_KEYS_MAP.get(category, ["Nom"])
        return self._get_element_details_by_name(name, element_list, name_keys)
    
    def get_all(self, category: ElementCategory) -> List[Dict[str, Any]]:
        """Récupère tous les éléments d'une catégorie.
        
        Args:
            category: Catégorie d'éléments.
            
        Returns:
            Liste de tous les éléments (peut être vide).
        """
        return self._get_element_list(category)
    
    # Méthodes de compatibilité avec l'ancienne interface ContextBuilder
    def get_characters_names(self) -> List[str]:
        """Récupère la liste des noms de personnages."""
        return self.get_names(ElementCategory.CHARACTERS)
    
    def get_locations_names(self) -> List[str]:
        """Récupère la liste des noms de lieux."""
        return self.get_names(ElementCategory.LOCATIONS)
    
    def get_items_names(self) -> List[str]:
        """Récupère la liste des noms d'objets."""
        return self.get_names(ElementCategory.ITEMS)
    
    def get_species_names(self) -> List[str]:
        """Récupère la liste des noms d'espèces."""
        return self.get_names(ElementCategory.SPECIES)
    
    def get_communities_names(self) -> List[str]:
        """Récupère la liste des noms de communautés."""
        return self.get_names(ElementCategory.COMMUNITIES)
    
    def get_quests_names(self) -> List[str]:
        """Récupère la liste des noms de quêtes."""
        return self.get_names(ElementCategory.QUESTS)
    
    def get_character_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un personnage par nom."""
        return self.get_by_name(ElementCategory.CHARACTERS, name)
    
    def get_location_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un lieu par nom."""
        return self.get_by_name(ElementCategory.LOCATIONS, name)
    
    def get_item_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un objet par nom."""
        return self.get_by_name(ElementCategory.ITEMS, name)
    
    def get_species_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'une espèce par nom."""
        return self.get_by_name(ElementCategory.SPECIES, name)
    
    def get_community_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'une communauté par nom."""
        return self.get_by_name(ElementCategory.COMMUNITIES, name)
    
    def get_quest_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'une quête par nom."""
        return self.get_by_name(ElementCategory.QUESTS, name)
    
    def get_dialogue_example_details_by_title(self, title: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un exemple de dialogue par titre."""
        return self.get_by_name(ElementCategory.DIALOGUES, title)

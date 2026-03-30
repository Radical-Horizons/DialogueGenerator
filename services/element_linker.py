"""Service pour gérer les relations et liens entre éléments GDD."""
import logging
import re
from typing import Dict, List, Optional, Set, TYPE_CHECKING

if TYPE_CHECKING:
    from services.element_repository import ElementRepository
    from services.element_resolver import ElementResolver

logger = logging.getLogger(__name__)


class ElementLinker:
    """Gère les relations et liens entre éléments GDD.
    
    Centralise la logique de découverte des éléments liés :
    - Extraction des régions et sous-lieux
    - Découverte des éléments liés (personnages, lieux, objets, etc.)
    - Recherche de noms dans le texte
    """
    
    def __init__(
        self,
        element_repository: Optional['ElementRepository'] = None,
        element_resolver: Optional['ElementResolver'] = None
    ):
        """Initialise le service de liens d'éléments.
        
        Args:
            element_repository: Repository d'éléments pour accès aux données.
            element_resolver: Resolver d'éléments pour résolution par nom.
        """
        self._element_repository = element_repository
        self._element_resolver = element_resolver
    
    def get_regions(self, locations: List[Dict]) -> List[str]:
        """Retourne des noms de lieux pour l'index « régions » / catalogue.
        
        Comportement :
        - Si au moins une fiche a ``Catégorie == "Région"`` (GDD agrégé classique), ne
          retourne que ces noms (rétrocompatibilité).
        - Sinon (fiches Notion individuelles sans champ ``Catégorie``), retourne tous
          les ``Nom`` non vides, triés (insensible à la casse).
        
        Args:
            locations: Liste des lieux depuis GDDData.
            
        Returns:
            Noms de régions (mode classique) ou de tous les lieux (mode fiches).
        """
        if not locations:
            return []
        legacy_regions = [
            loc.get("Nom")
            for loc in locations
            if isinstance(loc, dict) and loc.get("Nom") and loc.get("Catégorie") == "Région"
        ]
        if legacy_regions:
            return sorted(set(legacy_regions), key=lambda n: str(n).casefold())
        names = [
            loc.get("Nom")
            for loc in locations
            if isinstance(loc, dict) and loc.get("Nom")
        ]
        return sorted(set(names), key=lambda n: str(n).casefold())
    
    def get_sub_locations(self, region_name: str, locations: List[Dict]) -> List[str]:
        """Récupère les sous-lieux listés dans le champ ``Contient`` d'une fiche lieu.
        
        Args:
            region_name: Nom du lieu (région classique ou toute fiche avec ``Contient``).
            locations: Liste des lieux depuis GDDData.
            
        Returns:
            Noms issus de ``Contient`` (séparés par des virgules), ou liste vide.
        """
        if not locations or not region_name:
            return []
        region_details = None
        for loc in locations:
            if isinstance(loc, dict) and loc.get("Nom") == region_name:
                region_details = loc
                break
        if not region_details:
            logger.debug("Lieu introuvable pour sous-lieux: %s", region_name)
            return []
        sub_locations_str = region_details.get("Contient")
        if isinstance(sub_locations_str, str) and sub_locations_str.strip():
            return [name.strip() for name in sub_locations_str.split(",") if name.strip()]
        return []
    
    def extract_linked_names(self, text_field: Optional[str], known_names_list: List[str]) -> Set[str]:
        """Extrait les noms liés depuis un champ texte.
        
        Args:
            text_field: Champ texte contenant des noms séparés par virgules.
            known_names_list: Liste des noms valides à rechercher.
            
        Returns:
            Ensemble des noms trouvés dans le champ texte.
        """
        linked_found = set()
        if not text_field or not isinstance(text_field, str):
            return linked_found
        potential_names = [name.strip() for name in text_field.split(',') if name.strip()]
        for pname in potential_names:
            if pname in known_names_list:
                linked_found.add(pname)
        return linked_found
    
    def find_related_names_in_text(self, text: str, known_character_names: List[str]) -> Set[str]:
        """Trouve les noms de personnages mentionnés dans un texte.
        
        Args:
            text: Texte à analyser.
            known_character_names: Liste des noms de personnages connus.
            
        Returns:
            Ensemble des noms trouvés dans le texte.
        """
        if not text or not isinstance(text, str):
            return set()
        found_names = set()
        for known_name in known_character_names:
            if re.search(r"\b" + re.escape(known_name) + r"\b", text):
                found_names.add(known_name)
        return found_names
    
    def get_linked_elements(
        self,
        character_name: Optional[str] = None,
        location_names: Optional[List[str]] = None
    ) -> Dict[str, Set[str]]:
        """Récupère les éléments liés à un personnage et/ou des lieux.
        
        Args:
            character_name: Nom du personnage (optionnel).
            location_names: Liste des noms de lieux (optionnel).
            
        Returns:
            Dictionnaire avec les éléments liés par catégorie.
        """
        linked_elements: Dict[str, Set[str]] = {
            "characters": set(),
            "locations": set(),
            "items": set(),
            "species": set(),
            "communities": set(),
            "quests": set()
        }
        
        if self._element_resolver is None:
            return linked_elements
        
        # Récupérer toutes les listes de noms
        all_char_names = self._element_resolver.get_names("characters")
        all_loc_names = self._element_resolver.get_names("locations")
        all_item_names = self._element_resolver.get_names("items")
        all_species_names = self._element_resolver.get_names("species")
        all_comm_names = self._element_resolver.get_names("communities")
        all_quest_names = self._element_resolver.get_names("quests")
        
        # Traiter le personnage
        if character_name:
            char_details = self._element_resolver.get_by_name("characters", character_name)
            if char_details:
                linked_elements["items"].update(
                    self.extract_linked_names(char_details.get("Détient"), all_item_names)
                )
                linked_elements["species"].update(
                    self.extract_linked_names(char_details.get("Espèce"), all_species_names)
                )
                linked_elements["communities"].update(
                    self.extract_linked_names(char_details.get("Communautés"), all_comm_names)
                )
                linked_elements["locations"].update(
                    self.extract_linked_names(char_details.get("Lieux de vie"), all_loc_names)
                )
                
                # Extraire les relations depuis Background.Relations
                relations_text = None
                background = char_details.get("Background")
                if isinstance(background, dict):
                    relations_text = background.get("Relations")
                elif isinstance(background, str):
                    relations_text = background
                
                if relations_text and isinstance(relations_text, str):
                    for word_or_phrase in self.find_related_names_in_text(relations_text, all_char_names):
                        if word_or_phrase != character_name:
                            linked_elements["characters"].add(word_or_phrase)
        
        # Traiter les lieux
        if location_names:
            for loc_name in location_names:
                loc_details = self._element_resolver.get_by_name("locations", loc_name)
                if loc_details:
                    linked_elements["characters"].update(
                        self.extract_linked_names(loc_details.get("Personnages présents"), all_char_names)
                    )
                    linked_elements["communities"].update(
                        self.extract_linked_names(loc_details.get("Communautés présentes"), all_comm_names)
                    )
                    linked_elements["species"].update(
                        self.extract_linked_names(loc_details.get("Faunes & Flores présentes"), all_species_names)
                    )
                    linked_elements["locations"].update(
                        self.extract_linked_names(loc_details.get("Contient"), all_loc_names)
                    )
                    linked_elements["locations"].update(
                        self.extract_linked_names(loc_details.get("Contenu par"), all_loc_names)
                    )
        
        # Exclure les éléments sources
        if character_name:
            linked_elements["characters"].discard(character_name)
        if location_names:
            for loc_name in location_names:
                linked_elements["locations"].discard(loc_name)
        
        return linked_elements

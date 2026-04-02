"""Service d'accès en lecture aux données GDD."""
import logging
from typing import Dict, List, Optional, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from services.element_resolver import ElementResolver
    from services.element_linker import ElementLinker
    from services.gdd_loader import GDDData

logger = logging.getLogger(__name__)


class GDDDataAccessor:
    """Service d'accès en lecture aux données GDD.
    
    Centralise toutes les méthodes d'accès aux données GDD :
    - Propriétés directes (characters, locations, items, etc.)
    - Méthodes de récupération par nom (get_*_names, get_*_details_by_name)
    - Méthodes de récupération de structures (narrative, macro, micro)
    - Méthodes de gestion des éléments liés (regions, sub_locations, linked_elements)
    
    Respecte le principe SRP : responsabilité unique d'accès aux données.
    """
    
    def __init__(
        self,
        gdd_data: Optional['GDDData'] = None,
        element_resolver: Optional['ElementResolver'] = None,
        element_linker: Optional['ElementLinker'] = None
    ):
        """Initialise le service d'accès aux données.
        
        Args:
            gdd_data: Données GDD chargées (optionnel).
            element_resolver: Resolver d'éléments pour résolution par nom (optionnel).
            element_linker: Linker d'éléments pour relations (optionnel).
        """
        self._gdd_data = gdd_data
        self._element_resolver = element_resolver
        self._element_linker = element_linker
    
    # Propriétés directes vers GDDData
    @property
    def characters(self) -> List[Dict[str, Any]]:
        """Liste des personnages."""
        if self._gdd_data is None:
            return []
        return self._gdd_data.characters
    
    @property
    def locations(self) -> List[Dict[str, Any]]:
        """Liste des lieux."""
        if self._gdd_data is None:
            return []
        return self._gdd_data.locations
    
    @property
    def items(self) -> List[Dict[str, Any]]:
        """Liste des objets."""
        if self._gdd_data is None:
            return []
        return self._gdd_data.items
    
    @property
    def species(self) -> List[Dict[str, Any]]:
        """Liste des espèces."""
        if self._gdd_data is None:
            return []
        return self._gdd_data.species
    
    @property
    def communities(self) -> List[Dict[str, Any]]:
        """Liste des communautés."""
        if self._gdd_data is None:
            return []
        return self._gdd_data.communities
    
    @property
    def quests(self) -> List[Dict[str, Any]]:
        """Liste des quêtes."""
        if self._gdd_data is None:
            return []
        return self._gdd_data.quests
    
    @property
    def narrative_structures(self) -> List[Dict[str, Any]]:
        """Liste des structures narratives."""
        if self._gdd_data is None:
            return []
        return self._gdd_data.narrative_structures
    
    @property
    def macro_structure(self) -> Optional[Dict[str, Any]]:
        """Structure macro."""
        if self._gdd_data is None:
            return None
        return self._gdd_data.macro_structure
    
    @property
    def micro_structure(self) -> Optional[Dict[str, Any]]:
        """Structure micro."""
        if self._gdd_data is None:
            return None
        return self._gdd_data.micro_structure
    
    @property
    def dialogues_examples(self) -> List[Dict[str, Any]]:
        """Liste des exemples de dialogues."""
        if self._gdd_data is None:
            return []
        return self._gdd_data.dialogues_examples
    
    @property
    def vision_data(self) -> Optional[Dict[str, Any]]:
        """Données Vision."""
        if self._gdd_data is None:
            return None
        return self._gdd_data.vision_data
    
    @property
    def gdd_data(self) -> Dict[str, Any]:
        """Données GDD (compatibilité - retourne dict vide pour compatibilité)."""
        return {}  # Conservé pour compatibilité mais non utilisé
    
    # Méthodes de récupération des noms via ElementResolver
    def get_characters_names(self) -> List[str]:
        """Récupère la liste des noms de personnages."""
        if self._element_resolver is None:
            return []
        return self._element_resolver.get_names("characters")
    
    def get_locations_names(self) -> List[str]:
        """Récupère la liste des noms de lieux."""
        if self._element_resolver is None:
            return []
        return self._element_resolver.get_names("locations")
    
    def get_items_names(self) -> List[str]:
        """Récupère la liste des noms d'objets."""
        if self._element_resolver is None:
            return []
        return self._element_resolver.get_names("items")
    
    def get_species_names(self) -> List[str]:
        """Récupère la liste des noms d'espèces."""
        if self._element_resolver is None:
            return []
        return self._element_resolver.get_names("species")
    
    def get_communities_names(self) -> List[str]:
        """Récupère la liste des noms de communautés."""
        if self._element_resolver is None:
            return []
        return self._element_resolver.get_names("communities")
    
    def get_quests_names(self) -> List[str]:
        """Récupère la liste des noms de quêtes."""
        if self._element_resolver is None:
            return []
        return self._element_resolver.get_names("quests")
    
    def get_dialogue_examples_titles(self) -> List[str]:
        """Récupère les titres des exemples de dialogues."""
        if self._element_resolver is None:
            return []
        return self._element_resolver.get_dialogue_examples_titles()
    
    # Méthodes de récupération des détails par nom via ElementResolver
    def get_character_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un personnage par nom."""
        if self._element_resolver is None:
            return None
        return self._element_resolver.get_by_name("characters", name)
    
    def get_location_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un lieu par nom."""
        if self._element_resolver is None:
            return None
        return self._element_resolver.get_by_name("locations", name)
    
    def get_item_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un objet par nom."""
        if self._element_resolver is None:
            return None
        return self._element_resolver.get_by_name("items", name)
    
    def get_species_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'une espèce par nom."""
        if self._element_resolver is None:
            return None
        return self._element_resolver.get_by_name("species", name)
    
    def get_community_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'une communauté par nom."""
        if self._element_resolver is None:
            return None
        return self._element_resolver.get_by_name("communities", name)
    
    def get_quest_details_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'une quête par nom."""
        if self._element_resolver is None:
            return None
        return self._element_resolver.get_by_name("quests", name)
    
    def get_dialogue_example_details_by_title(self, title: str) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un exemple de dialogue par titre."""
        if self._element_resolver is None:
            return None
        return self._element_resolver.get_by_name("dialogues_examples", title)
    
    # Méthodes de récupération des structures
    def get_narrative_structures(self) -> List[Dict[str, Any]]:
        """Récupère les structures narratives."""
        return self.narrative_structures
    
    def get_macro_structure(self) -> Optional[Dict[str, Any]]:
        """Récupère la structure macro."""
        return self.macro_structure
    
    def get_micro_structure(self) -> Optional[Dict[str, Any]]:
        """Récupère la structure micro."""
        return self.micro_structure
    
    # Méthodes de gestion des éléments liés via ElementLinker
    def get_regions(self) -> List[str]:
        """Retourne les noms pour le catalogue lieu (régions classiques ou toutes les fiches)."""
        if self._element_linker is None or not self.locations:
            return []
        return self._element_linker.get_regions(self.locations)
    
    def get_sub_locations(self, region_name: str) -> List[str]:
        """Récupère les noms listés dans ``Contient`` pour la fiche ``region_name``."""
        if self._element_linker is None or not self.locations or not region_name:
            return []
        return self._element_linker.get_sub_locations(region_name, self.locations)

    def get_scene_region_names(self) -> List[str]:
        """Noms « région » pour le widget Scène principale."""
        if self._element_linker is None or not self.locations:
            return []
        return self._element_linker.get_scene_region_names(self.locations)

    def get_scene_sub_location_names(self, parent_name: str) -> List[str]:
        """Noms « lieu » sous une région pour le widget Scène principale."""
        if self._element_linker is None or not self.locations or not parent_name:
            return []
        return self._element_linker.get_scene_sub_location_names(parent_name, self.locations)
    
    def get_linked_elements(
        self,
        character_name: Optional[str] = None,
        location_names: Optional[List[str]] = None
    ) -> Dict[str, set]:
        """Récupère les éléments liés à un personnage et/ou des lieux."""
        if self._element_linker is None:
            return {
                "characters": set(),
                "locations": set(),
                "items": set(),
                "species": set(),
                "communities": set(),
                "quests": set()
            }
        return self._element_linker.get_linked_elements(
            character_name=character_name,
            location_names=location_names
        )

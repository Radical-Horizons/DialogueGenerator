import logging
from typing import List, Dict, Any, Optional

from core.context.context_builder import ContextBuilder

logger = logging.getLogger(__name__)

class LinkedSelectorService:
    """Service responsible for selecting and managing linked GDD elements for dialogue context.

    Ce service encapsule toute la logique qui vivait auparavant dans GenerationPanel
    pour :
      1. Déterminer quels éléments du GDD (toutes catégories confondues) doivent
         être sélectionnés quand l'utilisateur clique sur « Select Linked Elements ».
      2. Déterminer quels éléments garder cochés lorsqu'on veut supprimer les
         éléments non liés (bouton « Unlink Unrelated Elements »).
    Il fournit donc deux méthodes publiques :
      - ``get_elements_to_select``
      - ``compute_items_to_keep_checked``
    """

    _IGNORE_VALUES = {"-- None --", "-- All --", ""}

    def __init__(self, context_builder: ContextBuilder):
        """Initializes the LinkedSelectorService."""
        self.context_builder = context_builder
        logger.info("LinkedSelectorService initialized.")

    def get_all_character_names(self) -> List[str]:
        """Retrieves all character names from the ContextBuilder."""
        # Example method - will implement others based on GenerationPanel needs
        return self.context_builder.get_characters_names()

    # ------------------------------------------------------------------
    # Helper (interne)
    # ------------------------------------------------------------------
    def _extract_linked_names(self, item_details: dict[str, Any]) -> set[str]:
        """Recursively extracts linked names (str) from a details dict."""
        linked_names: set[str] = set()
        if not isinstance(item_details, dict):
            return linked_names

        for _k, v in item_details.items():
            if isinstance(v, str):
                if v.strip():
                    linked_names.add(v.strip())
            elif isinstance(v, (list, set, tuple)):
                for element in v:
                    if isinstance(element, str) and element.strip():
                        linked_names.add(element.strip())
                    elif isinstance(element, dict):
                        linked_names.update(self._extract_linked_names(element))
            elif isinstance(v, dict):
                linked_names.update(self._extract_linked_names(v))
        return linked_names

    # ------------------------------------------------------------------
    # Méthode 1 : sélection automatique d'éléments liés
    # ------------------------------------------------------------------
    def get_elements_to_select(
        self,
        character_a: Optional[str],
        character_b: Optional[str],
        scene_region: Optional[str],
        sub_location: Optional[str],
    ) -> set[str]:
        """Retourne l'ensemble des noms d'éléments à cocher automatiquement.

        * Ajoute les persos et lieux renseignés.
        * Ajoute les éléments liés obtenus via ``ContextBuilder.get_linked_elements``.
        """
        elements_to_select: set[str] = set()

        # Normalisation des entrées (remplacer valeurs ignorées par None)
        char_a = character_a if character_a not in self._IGNORE_VALUES else None
        char_b = character_b if character_b not in self._IGNORE_VALUES else None

        location_names: list[str] = []
        if sub_location and sub_location not in self._IGNORE_VALUES:
            location_names.append(sub_location)
        elif scene_region and scene_region not in self._IGNORE_VALUES:
            location_names.append(scene_region)

        # --------------------------------------------------------------
        # Personnage A
        # --------------------------------------------------------------
        if char_a:
            elements_to_select.add(char_a)
            try:
                rel_a = self.context_builder.get_linked_elements(character_name=char_a)
                for _cat, items in rel_a.items():
                    elements_to_select.update(items)
            except Exception as e:
                logger.warning("get_linked_elements failed for char_a %s: %s", char_a, e)

        # --------------------------------------------------------------
        # Personnage B
        # --------------------------------------------------------------
        if char_b:
            elements_to_select.add(char_b)
            try:
                rel_b = self.context_builder.get_linked_elements(character_name=char_b)
                for _cat, items in rel_b.items():
                    elements_to_select.update(items)
            except Exception as e:
                logger.warning("get_linked_elements failed for char_b %s: %s", char_b, e)

        # --------------------------------------------------------------
        # Lieux (région ou sous-lieu)
        # --------------------------------------------------------------
        if location_names:
            elements_to_select.update(location_names)
            try:
                rel_locs = self.context_builder.get_linked_elements(location_names=location_names)
                for _cat, items in rel_locs.items():
                    elements_to_select.update(items)
            except Exception as e:
                logger.warning("get_linked_elements failed for locations %s: %s", location_names, e)

        logger.debug("Elements to select computed: %s", elements_to_select)
        return elements_to_select

    # ------------------------------------------------------------------
    # Méthode 2 : filtrage des éléments à conserver cochés
    # ------------------------------------------------------------------
    def compute_items_to_keep_checked(
        self,
        currently_checked: set[str],
        character_a: Optional[str],
        character_b: Optional[str],
        scene_region: Optional[str],
        sub_location: Optional[str],
    ) -> list[str]:
        """Détermine quels items conserver cochés parmi ceux déjà cochés.

        Se base sur les éléments « directement liés » : personnages/lieux
        sélectionnés + leurs liens internes (détails).
        """
        directly_related = self._get_directly_related_elements(character_a, character_b, scene_region, sub_location)
        items_to_keep = list(currently_checked.intersection(directly_related))
        logger.debug("Items to keep checked: %s", items_to_keep)
        return items_to_keep

    # ------------------------------------------------------------------
    # Sous-fonction : éléments directement liés
    # ------------------------------------------------------------------
    def _get_directly_related_elements(
        self,
        character_a: Optional[str],
        character_b: Optional[str],
        scene_region: Optional[str],
        sub_location: Optional[str],
    ) -> set[str]:
        """Retourne l'ensemble des éléments considérés comme directement liés."""
        related: set[str] = set()

        def _add_character_and_links(char_name: str):
            if not char_name or char_name in self._IGNORE_VALUES:
                return
            related.add(char_name)
            try:
                details = self.context_builder.get_character_details_by_name(char_name)
                if details:
                    related.update(self._extract_linked_names(details))
            except Exception as e:
                logger.warning("Could not get character details for %s: %s", char_name, e)

        def _add_location_and_links(loc_name: str):
            if not loc_name or loc_name in self._IGNORE_VALUES:
                return
            related.add(loc_name)
            try:
                details = self.context_builder.get_location_details_by_name(loc_name)
                if details:
                    related.update(self._extract_linked_names(details))
            except Exception as e:
                logger.warning("Could not get location details for %s: %s", loc_name, e)

        _add_character_and_links(character_a)
        _add_character_and_links(character_b)

        if sub_location and sub_location not in self._IGNORE_VALUES:
            _add_location_and_links(sub_location)
        elif scene_region and scene_region not in self._IGNORE_VALUES:
            _add_location_and_links(scene_region)

        logger.debug("Directly related elements: %s", related)
        return related

    # TODO: Add methods to get location names, sub-locations, handle linked element selection logic, etc. 

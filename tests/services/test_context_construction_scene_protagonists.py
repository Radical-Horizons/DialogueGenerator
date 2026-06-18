"""Tests d'inclusion des protagonistes scène dans le contexte GDD."""
from typing import Any, Dict, List, Optional

from services.context_construction_service import ContextConstructionService


class _Resolver:
    """Resolver minimal pour vérifier la sélection effective."""

    def prioritize_elements(self, selected_elements: Dict[str, List[str]]) -> Dict[str, List[str]]:
        """Retourne les éléments sans changer l'ordre."""
        return selected_elements

    def get_element_type(self, category_key: str) -> str:
        """Mappe la catégorie vers le type de champ."""
        return "character" if category_key == "characters" else category_key

    def get_element_label(self, category_key: str) -> str:
        """Retourne un label stable pour le test."""
        return "PNJ" if category_key == "characters" else category_key.upper()

    def resolve_element_data(self, category_key: str, name: str) -> Optional[Dict[str, Any]]:
        """Résout un nom canonique ou alias vers une fiche."""
        if category_key != "characters":
            return None
        if name in {"Alice", "Dame Alice"}:
            return {"Nom": "Alice", "Résumé": "A"}
        if name == "Bob":
            return {"Nom": "Bob", "Résumé": "B"}
        return None


class _FieldManager:
    """Field manager minimal."""

    def get_field_config_for_mode(
        self,
        element_type: str,
        mode: str,
        custom_fields: Optional[List[str]] = None,
    ) -> List[str]:
        """Retourne un champ toujours valide."""
        return ["Résumé"]

    def filter_fields_by_condition_flags(
        self,
        element_type: str,
        fields_to_include: List[str],
        include_dialogue_type: bool = True,
    ) -> List[str]:
        """Conserve les champs."""
        return fields_to_include

    def get_field_labels_map(self, element_type: str, fields_to_include: List[str]) -> Dict[str, str]:
        """Retourne des labels identiques aux chemins."""
        return {field: field for field in fields_to_include}


def test_scene_protagonists_are_added_and_aliases_deduplicated() -> None:
    """Les protagonistes scène alimentent characters et les alias ne doublonnent pas."""
    service = ContextConstructionService(
        element_resolver=_Resolver(),
        context_field_manager=_FieldManager(),
    )

    result = service.build_context_core(
        selected_elements={
            "characters": ["Dame Alice"],
            "_scene_protagonists": {"personnage_a": "Alice", "personnage_b": "Bob"},
        },
        scene_instruction=" ",
        field_configs=None,
        organization_mode="narrative",
        max_tokens=300_000,
        element_modes={"characters": {"Dame Alice": "full"}},
    )

    assert [item.name for item in result.categories[0].items] == ["Alice", "Bob"]

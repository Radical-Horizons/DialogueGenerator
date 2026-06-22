"""Service pour gérer la configuration et le filtrage des champs de contexte."""
import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from services.gdd_sections_split import extract_gdd_field_value

if TYPE_CHECKING:
    from core.context.context_builder import ContextBuilder

logger = logging.getLogger(__name__)

# Repli excerpt lorsque les chemins config n'ont pas de valeur sur la fiche (structure Notion shard).
_EXCERPT_FALLBACK_PATHS: Dict[str, tuple[str, ...]] = {
    "character": (
        "Introduction.Résumé de la fiche",
        "Nom",
    ),
    "location": (
        "Introduction.Résumé de la fiche",
        "Nom",
        "Description",
    ),
    "item": ("Introduction.Résumé de la fiche", "Nom"),
    "species": ("Introduction.Résumé de la fiche", "Nom"),
    "community": ("Introduction.Résumé de la fiche", "Nom"),
}


class ContextFieldManager:
    """Gère la configuration et le filtrage des champs de contexte.
    
    Centralise la logique de gestion des champs :
    - Obtention des champs selon le mode (full/excerpt)
    - Filtrage selon les condition_flags
    - Récupération des labels depuis context_config.json
    - Validation des champs via ContextFieldValidator
    """
    
    def __init__(self, context_config: Dict[str, Any], context_builder: 'ContextBuilder'):
        """Initialise le gestionnaire de champs.
        
        Args:
            context_config: Configuration chargée depuis context_config.json.
            context_builder: Instance de ContextBuilder pour accéder au validateur.
        """
        self.context_config = context_config
        self.context_builder = context_builder
    
    def get_field_config_for_mode(
        self, 
        element_type: str, 
        mode: str, 
        custom_fields: Optional[List[str]] = None
    ) -> Optional[List[str]]:
        """Obtient la configuration de champs selon le mode (full/excerpt).
        
        Args:
            element_type: Type d'élément (character, location, etc.)
            mode: Mode de sélection ('full' ou 'excerpt')
            custom_fields: Champs personnalisés fournis (optionnel, depuis field_configs)
            
        Returns:
            Liste des chemins de champs à inclure, ou None pour utiliser la config par défaut.
        """
        if mode == "full":
            # Mode full (normal): suivre field_configs si fourni, sinon utiliser tous les champs
            return custom_fields
        
        # Mode excerpt: utiliser les champs explicitement marqués, puis les anciens labels,
        # puis un extrait minimal basé sur la priorité 1 si aucune config dédiée n'existe.
        config_for_type = self.context_config.get(element_type.lower(), {})
        excerpt_fields: List[str] = []
        priority_one_fields: List[str] = []
        
        # Parcourir toutes les priorités (1, 2, 3) pour trouver les champs d'extrait.
        for priority_level, fields in config_for_type.items():
            for field_config in fields:
                label = field_config.get("label", "")
                path = field_config.get("path", "")
                if priority_level == "1" and path:
                    priority_one_fields.append(path)
                
                if field_config.get("is_excerpt") is True and path:
                    excerpt_fields.append(path)
                    continue

                # Compatibilité avec l'ancienne convention de libellé.
                if "(extrait)" in label.lower() and path:
                    excerpt_fields.append(path)
        
        if excerpt_fields:
            return list(dict.fromkeys(excerpt_fields))
        if priority_one_fields:
            return list(dict.fromkeys(priority_one_fields))
        return custom_fields

    @staticmethod
    def _field_has_content(element_data: Dict[str, Any], field_path: str) -> bool:
        """True si le chemin produit une valeur non vide sur cette fiche."""
        value = extract_gdd_field_value(element_data, field_path)
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, dict)):
            return len(value) > 0
        return True

    @staticmethod
    def _discover_summary_section_paths(element_data: Dict[str, Any]) -> List[str]:
        """Repère les sections résumé (clés ``re_sume*``, ``resume*``) dans les fiches shard."""
        sections = element_data.get("sections")
        if not isinstance(sections, dict):
            return []
        paths: List[str] = []
        for key in sections:
            key_lower = str(key).lower()
            if "resume" in key_lower or "re_sume" in key_lower or "summary" in key_lower:
                paths.append(f"sections.{key}")
        return paths

    def _fields_with_content(
        self,
        element_data: Dict[str, Any],
        field_paths: List[str],
    ) -> List[str]:
        """Conserve uniquement les chemins qui ont une valeur sur ``element_data``."""
        return [path for path in field_paths if self._field_has_content(element_data, path)]

    def resolve_fields_for_element(
        self,
        element_type: str,
        element_data: Dict[str, Any],
        mode: str,
        custom_fields: Optional[List[str]] = None,
        include_dialogue_type: bool = True,
    ) -> Optional[List[str]]:
        """Résout les champs à inclure pour une fiche, avec repli excerpt si config vide.

        Args:
            element_type: Type d'élément (character, location, …).
            element_data: Données GDD de la fiche.
            mode: ``full`` ou ``excerpt``.
            custom_fields: Surcharge champs (mode full).
            include_dialogue_type: Inclure les champs conditionnés au type de dialogue.

        Returns:
            Liste de chemins prêts pour l'organizer, ou ``None`` en mode full sans filtre explicite.
        """
        if mode == "full":
            if custom_fields is None:
                return None
            populated = self._fields_with_content(element_data, custom_fields)
            if not populated:
                return None
            return self.filter_fields_by_condition_flags(
                element_type, populated, include_dialogue_type=include_dialogue_type
            )

        candidate_paths: List[str] = []
        configured = self.get_field_config_for_mode(element_type, "excerpt", custom_fields) or []
        candidate_paths.extend(configured)
        candidate_paths.extend(_EXCERPT_FALLBACK_PATHS.get(element_type.lower(), ()))
        candidate_paths.extend(self._discover_summary_section_paths(element_data))

        deduped_candidates = list(dict.fromkeys(candidate_paths))
        populated = self._fields_with_content(element_data, deduped_candidates)
        if not populated:
            logger.warning(
                "Mode excerpt sans contenu pour %s '%s' — aucun champ exploitable.",
                element_type,
                element_data.get("Nom", "?"),
            )
            return []

        return self.filter_fields_by_condition_flags(
            element_type, populated, include_dialogue_type=include_dialogue_type
        )
    
    def filter_fields_by_condition_flags(
        self,
        element_type: str,
        fields_to_include: List[str],
        include_dialogue_type: bool = True
    ) -> List[str]:
        """Filtre les champs selon leurs condition_flag et valide leur existence.
        
        Args:
            element_type: Type d'élément (character, location, etc.)
            fields_to_include: Liste des chemins de champs à inclure
            include_dialogue_type: Si False, exclut les champs avec condition_flag="include_dialogue_type"
            
        Returns:
            Liste filtrée des champs à inclure (uniquement les champs valides et qui respectent les condition_flags).
        """
        if not fields_to_include:
            return []
        
        # D'abord, valider que les champs existent réellement
        try:
            from services.context_field_validator import ContextFieldValidator
            validator = ContextFieldValidator(context_builder=self.context_builder)
            fields_to_include = validator.filter_valid_fields(element_type, fields_to_include)
        except Exception as e:
            logger.warning(f"Impossible de valider les champs pour '{element_type}': {e}")
            # Continuer avec les champs fournis si la validation échoue
        
        filtered_fields = []
        config_for_type = self.context_config.get(element_type.lower(), {})
        
        # Créer un map des condition_flags pour chaque champ
        field_condition_flags = {}
        for priority_level, fields in config_for_type.items():
            for field_config in fields:
                path = field_config.get("path", "")
                condition_flag = field_config.get("condition_flag")
                if path and condition_flag:
                    field_condition_flags[path] = condition_flag
        
        # Filtrer les champs selon les condition_flags
        for field_path in fields_to_include:
            condition_flag = field_condition_flags.get(field_path)
            
            # Si le champ a un condition_flag "include_dialogue_type" et que include_dialogue_type est False, l'exclure
            if condition_flag == "include_dialogue_type" and not include_dialogue_type:
                continue
            
            filtered_fields.append(field_path)
        
        return filtered_fields
    
    def get_excerpt_truncation_map(self, element_type: str) -> Dict[str, int]:
        """Retourne un dictionnaire {field_path: truncate_chars} pour le mode excerpt.

        Utilise ``truncate_excerpt`` en priorité, sinon ``truncate`` si > 0.
        Les champs sans troncature (-1 ou absent) sont exclus du dict
        (la valeur entière sera conservée).

        Args:
            element_type: Type d'élément (character, location, …).

        Returns:
            Dictionnaire {field_path: caractères max} pour les champs avec troncature.
        """
        result: Dict[str, int] = {}
        config_for_type = self.context_config.get(element_type.lower(), {})
        for _priority, fields in config_for_type.items():
            for field_config in fields:
                path = field_config.get("path", "")
                if not path:
                    continue
                truncate_excerpt = field_config.get("truncate_excerpt")
                truncate = field_config.get("truncate", -1)
                effective = truncate_excerpt if isinstance(truncate_excerpt, int) and truncate_excerpt > 0 else (
                    truncate if isinstance(truncate, int) and truncate > 0 else -1
                )
                if effective > 0:
                    result[path] = effective
        return result

    def get_field_labels_map(
        self, 
        element_type: str, 
        fields_to_include: List[str]
    ) -> Dict[str, str]:
        """Récupère les labels depuis context_config.json pour les champs spécifiés.
        
        Args:
            element_type: Type d'élément (character, location, etc.)
            fields_to_include: Liste des chemins de champs à inclure
            
        Returns:
            Dictionnaire {field_path: label} pour les champs trouvés dans la config.
        """
        labels_map = {}
        config_for_type = self.context_config.get(element_type.lower(), {})
        
        # Parcourir toutes les priorités (1, 2, 3)
        for priority_level, fields in config_for_type.items():
            for field_config in fields:
                path = field_config.get("path", "")
                label = field_config.get("label", "")
                
                # Si ce champ est dans la liste à inclure et a un label, l'ajouter
                if path in fields_to_include and label:
                    labels_map[path] = label
        
        return labels_map

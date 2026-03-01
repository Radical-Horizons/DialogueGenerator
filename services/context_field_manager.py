"""Service pour gérer la configuration et le filtrage des champs de contexte."""
import logging
from typing import Dict, List, Optional, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from core.context.context_builder import ContextBuilder

logger = logging.getLogger(__name__)


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
        
        # Mode excerpt: IGNORER field_configs et extraire TOUS les champs avec "(extrait)"
        # Peu importe ce que l'utilisateur a configuré, on extrait tous les champs en version "extrait"
        config_for_type = self.context_config.get(element_type.lower(), {})
        excerpt_fields = []
        
        # Parcourir toutes les priorités (1, 2, 3) pour trouver TOUS les champs avec "(extrait)"
        for priority_level, fields in config_for_type.items():
            for field_config in fields:
                label = field_config.get("label", "")
                path = field_config.get("path", "")
                
                # Si le label contient "(extrait)", inclure ce champ
                if "(extrait)" in label and path:
                    excerpt_fields.append(path)
        
        return excerpt_fields if excerpt_fields else None
    
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

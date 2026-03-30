"""Service de formatage des champs d'éléments GDD selon la configuration."""
import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

# Variables de classe pour le throttling des logs
_last_no_config_log_time: Dict[tuple, float] = {}
_no_config_log_interval: float = 5.0


class ContextFormatter:
    """Formate les champs d'éléments GDD selon la configuration et le niveau de détail.
    
    Utilise context_config.json pour déterminer quels champs extraire et comment les formater
    selon le niveau de priorité demandé.
    """
    
    def __init__(self, config: Dict[str, Any], config_file_path: Optional[Path] = None):
        """Initialise le formateur avec une configuration.
        
        Args:
            config: Dictionnaire de configuration (chargé depuis context_config.json).
            config_file_path: Chemin vers le fichier de configuration (pour logging).
        """
        self.config = config
        self.config_file_path = config_file_path
    
    @staticmethod
    def load_config(config_file_path: Path) -> Dict[str, Any]:
        """Charge la configuration depuis un fichier JSON.
        
        Args:
            config_file_path: Chemin vers le fichier de configuration.
            
        Returns:
            Dictionnaire de configuration (vide si erreur).
        """
        if config_file_path.exists():
            try:
                with open(config_file_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                logger.info(f"Configuration de contexte chargée depuis {config_file_path}")
                return config
            except json.JSONDecodeError as e:
                logger.error(f"Erreur de décodage JSON pour le fichier de configuration {config_file_path}: {e}")
            except Exception as e:
                logger.error(f"Erreur inattendue lors du chargement de {config_file_path}: {e}")
        else:
            logger.warning(f"Fichier de configuration {config_file_path} non trouvé. Utilisation d'une configuration vide.")
        return {}
    
    @staticmethod
    def _extract_from_dict(data: Dict[str, Any], path: str, default: Any = "N/A") -> Any:
        """Extrait une valeur depuis un dictionnaire en utilisant un chemin pointé.
        
        Args:
            data: Dictionnaire source.
            path: Chemin pointé (ex: "Introduction.Résumé de la fiche").
            default: Valeur par défaut si le chemin n'existe pas.
            
        Returns:
            Valeur extraite ou default.
        """
        from services.gdd_sections_split import extract_gdd_field_value

        v = extract_gdd_field_value(data, path)
        if v is not None:
            return v
        return default
    
    @staticmethod
    def _format_list(data_list: Any, max_items: int = 5) -> str:
        """Formate une liste en chaîne de caractères.
        
        Args:
            data_list: Liste à formater (ou chaîne séparée par virgules).
            max_items: Nombre maximum d'items à afficher (non utilisé actuellement).
            
        Returns:
            Chaîne formatée.
        """
        if not isinstance(data_list, list):
            if isinstance(data_list, str):
                data_list = [item.strip() for item in data_list.split(',') if item.strip()]
            else:
                return str(data_list)
        if not data_list:
            return "N/A"
        # Note: max_items n'est plus utilisé selon les commentaires dans le code original
        # mais conservé pour compatibilité
        if len(data_list) > max_items:
            return ", ".join(data_list[:max_items]) + f", et {len(data_list) - max_items} autre(s)"
        return ", ".join(data_list)
    
    def _apply_excerpt_truncation(self, text: str, element_type: str) -> str:
        """Applique la troncature selon les paramètres de config pour le mode excerpt.
        
        Args:
            text: Texte à tronquer.
            element_type: Type d'élément.
            
        Returns:
            Texte tronqué si nécessaire.
        """
        config_for_type = self.config.get(element_type.lower(), {})
        
        # Parcourir les champs pour trouver les paramètres de troncature
        for priority_level, fields in config_for_type.items():
            for field_config in fields:
                label = field_config.get("label", "")
                truncate = field_config.get("truncate", -1)
                
                # Si c'est un champ "extrait" avec troncature
                if "(extrait)" in label and truncate > 0:
                    # Tronquer le texte si nécessaire
                    if len(text) > truncate:
                        # Essayer de tronquer à un mot complet
                        truncated = text[:truncate]
                        last_space = truncated.rfind(' ')
                        if last_space > truncate * 0.8:  # Si on trouve un espace proche
                            truncated = truncated[:last_space]
                        return truncated + "... (extrait)"
        
        return text
    
    def format_element(
        self,
        element_data: Dict[str, Any],
        element_type: str,
        level: int,
        **kwargs
    ) -> str:
        """Extrait et formate les informations d'un élément selon sa priorité et le niveau de détail.
        
        Args:
            element_data: Données de l'élément à formater.
            element_type: Type d'élément (ex: "character", "location").
            level: Niveau de détail (1-3).
            **kwargs: Arguments supplémentaires (ex: include_dialogue_type).
            
        Returns:
            Chaîne formatée contenant les informations de l'élément.
        """
        details = []
        config_for_type = self.config.get(element_type.lower(), {})
        
        # Récupérer les champs à extraire pour tous les niveaux jusqu'au level demandé
        fields_to_extract = []
        for l in range(1, level + 1):
            fields_to_extract.extend(config_for_type.get(str(l), []))
        
        # Si pas de configuration, formatage direct de toutes les données
        if not fields_to_extract and element_data:
            now = time.time()
            log_key = (element_type, level)
            last_time = _last_no_config_log_time.get(log_key, 0)
            if now - last_time > _no_config_log_interval:
                logger.info(
                    f"Aucune configuration de champ pour {element_type} au niveau {level}, "
                    f"tentative de formatage direct des données."
                )
                _last_no_config_log_time[log_key] = now
            
            # Formatage direct : convertir toutes les clés/valeurs en texte
            for key, value in element_data.items():
                if isinstance(value, list):
                    formatted_list = ", ".join(map(str, value))
                    details.append(f"{key.replace('_', ' ').capitalize()}: {formatted_list}")
                elif isinstance(value, dict):
                    # Pour les dictionnaires imbriqués, conversion JSON
                    details.append(
                        f"{key.replace('_', ' ').capitalize()}: "
                        f"{json.dumps(value, ensure_ascii=False)}"
                    )
                elif value is not None:
                    details.append(f"{key.replace('_', ' ').capitalize()}: {str(value)}")
            return "\n".join(details)
        
        processed_paths = set()
        
        for field_config in fields_to_extract:
            path = field_config.get("path")
            if not path or path in processed_paths:
                continue
            processed_paths.add(path)
            
            label = field_config.get("label", path.split('.')[-1].replace('_', ' ').capitalize())
            condition_flag = field_config.get("condition_flag")
            condition_path_not_exists = field_config.get("condition_path_not_exists")
            
            # Vérifier les conditions
            if condition_flag and not kwargs.get(condition_flag, False):
                continue
            
            if condition_path_not_exists:
                value_for_condition_check = self._extract_from_dict(
                    element_data, condition_path_not_exists, None
                )
                if value_for_condition_check is not None:
                    continue
            
            # Extraire la valeur
            value = self._extract_from_dict(element_data, path)
            fallback_path = field_config.get("fallback_path")
            if (value is None or value == "N/A" or (isinstance(value, list) and not value)) and fallback_path:
                value = self._extract_from_dict(element_data, fallback_path)
            
            if value is None or value == "N/A" or (isinstance(value, list) and not value):
                continue
            
            # Formater selon le type de valeur
            if isinstance(value, list):
                # Liste : joindre tous les éléments
                formatted_list_items = []
                for item in value:
                    if isinstance(item, dict):
                        # Pour les dicts, chercher 'Nom' ou 'Titre'
                        name = item.get("Nom", item.get("Titre", str(item)))
                        formatted_list_items.append(str(name))
                    else:
                        formatted_list_items.append(str(item))
                if formatted_list_items:
                    details.append(f"{label}: {', '.join(formatted_list_items)}")
            elif isinstance(value, dict):
                # Dictionnaire : chercher 'Nom' ou 'Résumé', sinon JSON
                display_value = value.get(
                    "Nom",
                    value.get("Résumé", json.dumps(value, ensure_ascii=False, indent=2))
                )
                details.append(f"{label}: {display_value}")
            else:
                # Valeur simple : conversion en string (sans troncature selon commentaires)
                details.append(f"{label}: {str(value)}")
        
        return "\n".join(details)

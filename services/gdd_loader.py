"""Service de chargement des fichiers JSON du Game Design Document (GDD)."""
import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)


@dataclass
class GDDData:
    """Structure de données pour les fichiers GDD chargés."""
    characters: List[Dict[str, Any]] = field(default_factory=list)
    locations: List[Dict[str, Any]] = field(default_factory=list)
    items: List[Dict[str, Any]] = field(default_factory=list)
    species: List[Dict[str, Any]] = field(default_factory=list)
    communities: List[Dict[str, Any]] = field(default_factory=list)
    dialogues_examples: List[Dict[str, Any]] = field(default_factory=list)
    narrative_structures: List[Dict[str, Any]] = field(default_factory=list)
    macro_structure: Optional[Dict[str, Any]] = None
    micro_structure: Optional[Dict[str, Any]] = None
    quests: List[Dict[str, Any]] = field(default_factory=list)
    vision_data: Optional[Dict[str, Any]] = None


class GDDLoader:
    """Charge les fichiers JSON du GDD depuis les chemins configurés.
    
    Utilise un cache intelligent avec vérification mtime pour éviter les rechargements inutiles.
    """
    
    # Mapping des catégories de fichiers vers leurs attributs et clés JSON
    CATEGORIES_CONFIG = {
        "personnages": {"attr": "characters", "key": "personnages", "type": list},
        "lieux": {"attr": "locations", "key": "lieux", "type": list},
        "objets": {"attr": "items", "key": "objets", "type": list},
        "especes": {"attr": "species", "key": "especes", "type": list},
        "communautes": {"attr": "communities", "key": "communautes", "type": list},
        "dialogues": {"attr": "dialogues_examples", "key": "dialogues", "type": list},
        "structure_narrative": {"attr": "narrative_structures", "key": "structure_narrative", "type": list},
        "structure_macro": {"attr": "macro_structure", "key": "structure_macro", "type": dict},
        "structure_micro": {"attr": "micro_structure", "key": "structure_micro", "type": dict},
        "quetes": {"attr": "quests", "key": "quetes", "type": list}
    }
    
    def __init__(
        self,
        categories_path: Optional[Path] = None,
        import_path: Optional[Path] = None,
        context_builder_dir: Optional[Path] = None,
        project_root_dir: Optional[Path] = None
    ):
        """Initialise le GDDLoader.
        
        Args:
            categories_path: Chemin vers le répertoire des catégories GDD.
                            Si None, utilise la valeur par défaut.
            import_path: Chemin vers le répertoire contenant Vision.json (ou directement le fichier Vision.json).
                        Si None, utilise la valeur par défaut.
            context_builder_dir: Répertoire de base pour les chemins par défaut.
                                Si None, calcule depuis __file__.
            project_root_dir: Répertoire racine du projet.
                             Si None, calcule depuis context_builder_dir.
        """
        if context_builder_dir is None:
            context_builder_dir = Path(__file__).resolve().parent.parent
        if project_root_dir is None:
            project_root_dir = context_builder_dir.parent
        
        # Configuration des chemins
        if categories_path is not None:
            self._categories_path = categories_path
        else:
            env_categories_path = os.getenv("GDD_CATEGORIES_PATH")
            if env_categories_path:
                self._categories_path = Path(env_categories_path)
            else:
                self._categories_path = context_builder_dir / "data" / "GDD_categories"
        
        if import_path is not None:
            self._import_path = import_path
        else:
            env_import_path = os.getenv("GDD_IMPORT_PATH")
            if env_import_path:
                self._import_path = Path(env_import_path)
            else:
                # Par défaut, Vision.json est dans data/ du projet
                self._import_path = context_builder_dir / "data"
    
    def _get_gdd_cache(self):
        """Récupère l'instance du cache GDD si disponible.
        
        Returns:
            Instance de GDDCache ou None si non disponible.
        """
        try:
            from shared.caches import get_gdd_cache
            return get_gdd_cache()
        except (ImportError, AttributeError):
            logger.debug("Cache GDD non disponible. Chargement direct depuis fichiers.")
            return None
    
    def _find_file_case_insensitive(self, directory: Path, filename: str) -> Optional[Path]:
        """Trouve un fichier dans un répertoire de manière case-insensitive.
        
        Args:
            directory: Répertoire dans lequel chercher.
            filename: Nom du fichier à chercher (peut être avec ou sans extension).
            
        Returns:
            Chemin vers le fichier trouvé, ou None si non trouvé.
        """
        if not directory.exists() or not directory.is_dir():
            return None
        
        # Normaliser le nom de fichier (enlever l'extension si présente)
        filename_lower = filename.lower()
        if filename_lower.endswith('.json'):
            base_name = filename_lower[:-5]
            extension = '.json'
        else:
            base_name = filename_lower
            extension = ''
        
        # Chercher dans le répertoire
        for file_path in directory.iterdir():
            if file_path.is_file():
                file_name_lower = file_path.name.lower()
                # Vérifier si le nom correspond (avec ou sans extension)
                if file_name_lower == filename_lower:
                    return file_path
                # Vérifier aussi sans extension
                if extension and file_name_lower == base_name + extension:
                    return file_path
        
        return None
    
    def load_vision(self) -> Optional[Dict[str, Any]]:
        """Charge le fichier Vision.json.
        
        Returns:
            Données Vision.json chargées, ou None si non trouvé/erreur.
        """
        gdd_cache = self._get_gdd_cache()
        
        # Déterminer le chemin vers Vision.json
        # Si le chemin pointe directement vers un fichier Vision.json
        if self._import_path.is_file() and self._import_path.name.lower() == "vision.json":
            vision_file_path = self._import_path
        # Si le chemin pointe vers Bible_Narrative
        elif self._import_path.is_dir() and self._import_path.name == "Bible_Narrative":
            vision_file_path = self._find_file_case_insensitive(self._import_path, "Vision.json")
            if vision_file_path is None:
                vision_file_path = self._import_path / "Vision.json"
        # Sinon, chercher Vision.json directement dans le répertoire (data/)
        else:
            vision_file_path = self._find_file_case_insensitive(self._import_path, "Vision.json")
            if vision_file_path is None:
                vision_file_path = self._import_path / "Vision.json"
        
        if vision_file_path is None or not vision_file_path.exists() or not vision_file_path.is_file():
            logger.warning(f"Fichier Vision.json non trouvé dans {self._import_path}.")
            return None
        
        # Vérifier le cache
        vision_cache_key = f"vision:{vision_file_path.resolve()}"
        cached_vision = gdd_cache.get(vision_cache_key, vision_file_path) if gdd_cache else None
        
        if cached_vision is not None:
            logger.debug(f"Fichier {vision_file_path.name} chargé depuis le cache.")
            return cached_vision
        
        # Charger depuis le fichier
        try:
            with open(vision_file_path, "r", encoding="utf-8") as f:
                vision_data = json.load(f)
            logger.info(f"Fichier {vision_file_path.name} chargé avec succès.")
            
            # Mettre en cache
            if gdd_cache:
                gdd_cache.set(vision_cache_key, vision_data, vision_file_path)
            
            return vision_data
        except json.JSONDecodeError as e:
            logger.error(f"Erreur de décodage JSON pour {vision_file_path.name}: {e}")
            return None
        except Exception as e:
            logger.error(f"Erreur inattendue lors du chargement de {vision_file_path.name}: {e}")
            return None
    
    def load_category(self, category_name: str) -> Optional[Any]:
        """Charge une catégorie spécifique de fichiers GDD.
        
        Args:
            category_name: Nom de la catégorie (ex: "personnages", "lieux").
            
        Returns:
            Données chargées (liste ou dict selon la catégorie), ou liste vide/dict vide si erreur.
        """
        if category_name not in self.CATEGORIES_CONFIG:
            logger.warning(f"Catégorie '{category_name}' non reconnue.")
            config = {"type": list}  # Type par défaut
            default_value = [] if config.get("type") == list else {}
            return default_value
        
        config = self.CATEGORIES_CONFIG[category_name]
        # Privilégier les fichiers avec "_full" dans le nom
        # Recherche case-insensitive pour compatibilité Windows/Linux
        file_path_full = self._find_file_case_insensitive(
            self._categories_path, 
            f"{category_name}_full.json"
        )
        file_path = self._find_file_case_insensitive(
            self._categories_path, 
            f"{category_name}.json"
        )
        
        # Sélectionner le fichier à utiliser : "_full" en priorité, sinon le fichier standard
        if file_path_full is not None:
            file_path = file_path_full
            logger.debug(f"Fichier {file_path.name} trouvé (version _full).")
        elif file_path is None:
            # Les fichiers GDD sont optionnels (sauf personnages.json et lieux.json qui sont recommandés)
            # Utiliser DEBUG pour éviter les warnings inutiles au démarrage
            logger.debug(f"Fichier {category_name}.json non trouvé dans {self._categories_path}. Utilisation de la valeur par défaut.")
            return [] if config["type"] == list else {}
        
        json_main_key = config["key"]
        expected_type = config["type"]
        default_value = [] if expected_type == list else {}
        
        gdd_cache = self._get_gdd_cache()
        
        # Vérifier le cache
        composite_cache_key = f"{category_name}:{file_path.resolve()}"
        cached_data = gdd_cache.get(composite_cache_key, file_path) if gdd_cache else None
        
        if cached_data is not None:
            count = len(cached_data) if expected_type == list else 1
            logger.debug(f"Fichier {file_path.name} chargé depuis le cache. {count} élément(s) pour '{json_main_key}'.")
            return cached_data
        
        # Charger depuis le fichier
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            data_to_set = None
            
            # Gestion spéciale pour structure_macro et structure_micro (objets dict directement)
            if category_name in ["structure_macro", "structure_micro"] and isinstance(data, dict):
                logger.info(f"Fichier {file_path.name} chargé comme objet unique.")
                if gdd_cache:
                    gdd_cache.set(composite_cache_key, data, file_path)
                return data
            
            # Extraction des données selon le format
            if isinstance(data, dict) and json_main_key in data:
                data_to_set = data[json_main_key]
            elif isinstance(data, dict) and expected_type == dict:
                data_to_set = data
            elif isinstance(data, list) and expected_type == list:
                data_to_set = data
            
            if data_to_set is not None:
                if isinstance(data_to_set, expected_type):
                    count = len(data_to_set) if expected_type == list else 1
                    logger.info(f"Fichier {file_path.name} chargé. {count} élément(s) pour '{json_main_key}'.")
                    # Mettre en cache
                    if gdd_cache:
                        gdd_cache.set(composite_cache_key, data_to_set, file_path)
                    return data_to_set
                else:
                    logger.warning(
                        f"Type de données inattendu pour {json_main_key} dans {file_path.name}. "
                        f"Attendu {expected_type}, obtenu {type(data_to_set)}."
                    )
            else:
                logger.warning(
                    f"Contenu inattendu dans {file_path.name}. "
                    f"Clé '{json_main_key}' non trouvée ou format non géré."
                )
            
            return default_value
            
        except json.JSONDecodeError as e:
            logger.error(f"Erreur de décodage JSON pour {file_path.name}: {e}")
            return default_value
        except Exception as e:
            logger.error(f"Erreur inattendue lors du chargement de {file_path.name}: {e}")
            return default_value
    
    def load_all(self) -> GDDData:
        """Charge tous les fichiers GDD.
        
        Returns:
            Instance de GDDData contenant toutes les données chargées.
        """
        logger.info(
            f"Début du chargement des données du GDD depuis {self._categories_path} et {self._import_path}."
        )
        
        gdd_data = GDDData()
        
        # Charger Vision.json
        gdd_data.vision_data = self.load_vision()
        
        # Charger toutes les catégories
        for category_name, config in self.CATEGORIES_CONFIG.items():
            attribute_name = config["attr"]
            data = self.load_category(category_name)
            if data is not None:
                setattr(gdd_data, attribute_name, data)
        
        logger.info("Chargement des fichiers GDD terminé.")
        return gdd_data

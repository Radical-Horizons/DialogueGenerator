"""Service pour détecter automatiquement les champs disponibles dans les fiches GDD."""
import logging
from typing import List, Dict, Set, Optional, Any
from collections import defaultdict
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class FieldInfo:
    """Informations sur un champ détecté.
    
    Deux critères distincts :
    - is_metadata : Si le champ est une métadonnée (tous les champs AVANT "Introduction" dans le JSON)
    - is_essential : Si le champ est essentiel (contexte OU métadonnées) selon ESSENTIAL_*_FIELDS
    """
    path: str
    label: str
    type: str  # "string", "list", "dict"
    depth: int
    frequency: float  # % de fiches ayant ce champ (0.0 à 1.0)
    suggested: bool = False  # Suggéré pour le type de génération
    category: Optional[str] = None  # "identity", "characterization", "voice", "background", "mechanics"
    is_metadata: bool = False  # Champ métadonnée (avant "Introduction" dans le JSON)
    is_essential: bool = False  # Champ essentiel (contexte OU métadonnées) défini dans ContextOrganizer.ESSENTIAL_*_FIELDS
    is_unique: bool = False  # Champ unique (n'apparaît que dans une seule fiche)


class ContextFieldDetector:
    """Détecte automatiquement les champs disponibles dans les fiches GDD."""
    
    # Mapping des types d'éléments vers les attributs dans ContextBuilder
    ELEMENT_TYPE_TO_ATTR = {
        "character": "characters",
        "location": "locations",
        "item": "items",
        "species": "species",
        "community": "communities",
    }
    
    # Catégories de champs pour l'organisation narrative
    FIELD_CATEGORIES = {
        "identity": ["Nom", "Alias", "Occupation", "Archétype", "Type", "Rôle", "Catégorie"],
        "characterization": ["Désir", "Faiblesse", "Compulsion", "Qualités", "Défauts"],
        "voice": ["Dialogue Type", "Registre", "Champs lexicaux", "Expressions courantes"],
        "background": ["Background", "Contexte", "Histoire", "Relations", "Évènements", "Centres d'intérêt"],
        "mechanics": ["Pouvoirs", "Héritage", "Stats", "Compétences", "Traits"],
    }
    
    def __init__(self, context_builder=None):
        """Initialise le détecteur.
        
        Args:
            context_builder: Instance de ContextBuilder pour accéder aux données GDD.
        """
        self.context_builder = context_builder
    
    def detect_available_fields(
        self, 
        element_type: str, 
        sample_data: Optional[List[Dict]] = None
    ) -> Dict[str, FieldInfo]:
        """Détecte tous les champs disponibles pour un type d'élément.
        
        Args:
            element_type: Type d'élément ("character", "location", "item", "species", "community")
            sample_data: Données d'échantillon. Si None, utilise les données du ContextBuilder.
            
        Returns:
            Dictionnaire de {path: FieldInfo} pour tous les champs détectés.
        """
        if sample_data is None:
            sample_data = self._get_sample_data(element_type)
        
        if not sample_data:
            logger.warning(f"Aucune donnée disponible pour le type '{element_type}'")
            return {}
        
        # Collecter tous les champs avec leur fréquence et les fiches où ils apparaissent
        field_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "count": 0,
            "types": set(),
            "max_depth": 0,
            "paths": set(),
            "item_names": set()  # Noms des fiches où le champ apparaît
        })
        
        total_items = len(sample_data)
        
        # Déterminer l'ordre des clés racine pour identifier les métadonnées
        # Les métadonnées sont tous les champs AVANT "Introduction" dans le JSON
        root_keys_order = []
        if sample_data:
            first_item = sample_data[0]
            if isinstance(first_item, dict):
                root_keys_order = list(first_item.keys())
        
        for item in sample_data:
            if not isinstance(item, dict):
                continue
            
            # Identifier la fiche (par son "Nom" ou autre identifiant)
            item_name = self._get_item_name(item)
            
            # Extraire tous les chemins de champs (y compris imbriqués)
            paths = self._extract_all_paths(item)
            
            for path, value, depth in paths:
                field_stats[path]["count"] += 1
                field_stats[path]["types"].add(self._get_value_type(value))
                field_stats[path]["max_depth"] = max(field_stats[path]["max_depth"], depth)
                field_stats[path]["paths"].add(path)
                if item_name:
                    field_stats[path]["item_names"].add(item_name)

        self._expand_sections_general_subfields(field_stats, sample_data)
        
        # Convertir en FieldInfo
        fields = {}
        for path, stats in field_stats.items():
            frequency = stats["count"] / total_items if total_items > 0 else 0.0
            
            # Un champ est unique s'il n'apparaît que dans une seule fiche
            is_unique = len(stats["item_names"]) == 1
            
            # Déterminer le type principal (le plus fréquent)
            type_str = self._determine_primary_type(stats["types"])
            
            # Générer un label lisible (titres markdown découpés sous sections._general)
            label = self._generate_label(path)
            display_title = stats.get("display_title")
            if isinstance(display_title, str) and display_title.strip():
                label = f"Sections > {display_title.strip()}"
            
            # Déterminer la catégorie
            category = self._categorize_field(path, element_type)
            
            # Déterminer si c'est une métadonnée (tous les champs avant "Introduction")
            is_metadata = self._is_metadata_field(path, root_keys_order)
            
            fields[path] = FieldInfo(
                path=path,
                label=label,
                type=type_str,
                depth=stats["max_depth"],
                frequency=frequency,
                suggested=False,  # Sera déterminé par FieldSuggestionService
                category=category,
                is_metadata=is_metadata,
                is_unique=is_unique
            )
        
        unique_count = sum(1 for f in fields.values() if f.is_unique)
        # Log en DEBUG par défaut (visible seulement si LOG_CONSOLE_LEVEL=DEBUG ou --debug)
        logger.debug(f"Détecté {len(fields)} champs pour '{element_type}' sur {total_items} fiches ({unique_count} champs uniques)")
        return fields

    def _expand_sections_general_subfields(
        self,
        field_stats: Dict[str, Dict[str, Any]],
        sample_data: List[Dict],
    ) -> None:
        """Ajoute des chemins virtuels ``sections._general.<slug>`` pour le markdown Notion."""
        from services.gdd_sections_split import split_sections_general_text

        def _raw_is_expandable(raw: str) -> bool:
            if not isinstance(raw, str) or len(raw.strip()) < 40:
                return False
            return len(split_sections_general_text(raw)) >= 2

        items_with_general = 0
        items_expandable = 0
        for item in sample_data:
            if not isinstance(item, dict):
                continue
            sections = item.get("sections")
            if not isinstance(sections, dict):
                continue
            raw = sections.get("_general")
            if not isinstance(raw, str) or not raw.strip():
                continue
            items_with_general += 1
            if _raw_is_expandable(raw):
                items_expandable += 1

        any_expanded = False
        for item in sample_data:
            if not isinstance(item, dict):
                continue
            item_name = self._get_item_name(item)
            sections = item.get("sections")
            if not isinstance(sections, dict):
                continue
            raw = sections.get("_general")
            if not isinstance(raw, str) or len(raw.strip()) < 40:
                continue
            chunks = split_sections_general_text(raw)
            if len(chunks) < 2:
                continue
            any_expanded = True
            for slug, title, body in chunks:
                if not (body and body.strip()):
                    continue
                path = f"sections._general.{slug}"
                st = field_stats[path]
                st["count"] += 1
                st["types"].add("string")
                st["max_depth"] = max(st["max_depth"], 3)
                st["paths"].add(path)
                if item_name:
                    st["item_names"].add(item_name)
                if "display_title" not in st:
                    st["display_title"] = title

        drop_monolith = (
            any_expanded
            and items_with_general > 0
            and items_expandable == items_with_general
            and "sections._general" in field_stats
        )
        if drop_monolith:
            del field_stats["sections._general"]
    
    def _get_item_name(self, item: Dict) -> Optional[str]:
        """Extrait le nom d'une fiche pour l'identifier.
        
        Args:
            item: Dictionnaire représentant une fiche GDD.
            
        Returns:
            Nom de la fiche (depuis "Nom", "Titre", ou autre champ d'identification) ou None.
        """
        # Essayer différents champs pour identifier la fiche
        for key in ["Nom", "Titre", "name", "title", "Name", "Title"]:
            if key in item:
                value = item[key]
                if isinstance(value, str) and value.strip():
                    return value.strip()
                # Si c'est un dict, essayer d'extraire un nom
                if isinstance(value, dict):
                    for sub_key in ["Nom", "Titre", "name", "title"]:
                        if sub_key in value:
                            sub_value = value[sub_key]
                            if isinstance(sub_value, str) and sub_value.strip():
                                return sub_value.strip()
        return None
    
    def detect_unique_fields_by_item(
        self,
        element_type: str,
        sample_data: Optional[List[Dict]] = None
    ) -> Dict[str, Dict[str, List[str]]]:
        """Détecte les champs uniques et les regroupe par fiche.
        
        Args:
            element_type: Type d'élément ("character", "location", "item", "species", "community")
            sample_data: Données d'échantillon. Si None, utilise les données du ContextBuilder.
            
        Returns:
            Dictionnaire {item_name: {path: label}} pour les champs uniques par fiche.
        """
        if sample_data is None:
            sample_data = self._get_sample_data(element_type)
        
        if not sample_data:
            logger.warning(f"Aucune donnée disponible pour le type '{element_type}'")
            return {}
        
        # D'abord, détecter tous les champs pour identifier les uniques
        all_fields = self.detect_available_fields(element_type, sample_data)
        unique_field_paths = {path for path, field_info in all_fields.items() if field_info.is_unique}
        
        if not unique_field_paths:
            return {}
        
        # Regrouper les champs uniques par fiche
        unique_fields_by_item: Dict[str, Dict[str, str]] = defaultdict(dict)
        
        # Déterminer l'ordre des clés racine pour identifier les métadonnées
        root_keys_order = []
        if sample_data:
            first_item = sample_data[0]
            if isinstance(first_item, dict):
                root_keys_order = list(first_item.keys())
        
        for item in sample_data:
            if not isinstance(item, dict):
                continue
            
            item_name = self._get_item_name(item)
            if not item_name:
                continue
            
            # Extraire tous les chemins de champs
            paths = self._extract_all_paths(item)
            
            for path, value, depth in paths:
                if path in unique_field_paths:
                    # Générer un label lisible
                    label = self._generate_label(path)
                    unique_fields_by_item[item_name][path] = label
        
        logger.debug(f"Détecté {len(unique_fields_by_item)} fiches avec des champs uniques pour '{element_type}'")
        return dict(unique_fields_by_item)

    def get_sample_data(self, element_type: str) -> List[Dict[str, Any]]:
        """Récupère des données d'échantillon pour un type d'élément.

        Cette méthode publique évite l'usage direct de l'API interne ``_get_sample_data``
        depuis les couches appelantes (ex: routeurs API).

        Args:
            element_type: Type d'élément demandé.

        Returns:
            Liste des fiches disponibles pour ce type d'élément.
        """
        return self._get_sample_data(element_type)

    def identify_essential_fields(
        self,
        element_type: str,
        context_config: Dict[str, Any],
    ) -> Set[str]:
        """Identifie les champs essentiels pour un type d'élément.

        Cette méthode publique encapsule l'implémentation interne de détection
        des champs essentiels.

        Args:
            element_type: Type d'élément demandé.
            context_config: Configuration de contexte chargée.

        Returns:
            Ensemble des chemins de champs considérés essentiels.
        """
        return self._identify_essential_fields(element_type, context_config)
    
    def _get_sample_data(self, element_type: str) -> List[Dict]:
        """Récupère les données d'échantillon depuis ContextBuilder."""
        if not self.context_builder:
            logger.warning("ContextBuilder non fourni, impossible de récupérer les données")
            return []
        
        attr_name = self.ELEMENT_TYPE_TO_ATTR.get(element_type.lower())
        if not attr_name:
            logger.warning(f"Type d'élément inconnu: {element_type}")
            return []
        
        data = getattr(self.context_builder, attr_name, [])
        if not isinstance(data, list):
            logger.debug(f"Données pour '{element_type}' ({attr_name}) ne sont pas une liste: {type(data)}")
            return []
        
        result = [item for item in data if isinstance(item, dict)]
        if not result:
            # Log plus détaillé pour comprendre pourquoi les données sont vides
            logger.debug(
                f"Aucune donnée trouvée pour '{element_type}' ({attr_name}). "
                f"Type de données: {type(data)}, Longueur: {len(data) if hasattr(data, '__len__') else 'N/A'}, "
                f"GDDDataAccessor: {hasattr(self.context_builder, '_gdd_data_accessor')}, "
                f"GDDData: {hasattr(self.context_builder, '_gdd_data')}"
            )
        return result
    
    def _extract_all_paths(
        self, 
        data: Dict, 
        prefix: str = "", 
        depth: int = 0
    ) -> List[tuple]:
        """Extrait tous les chemins de champs d'un dictionnaire, y compris imbriqués.
        
        Returns:
            Liste de tuples (path, value, depth)
        """
        paths = []
        
        for key, value in data.items():
            current_path = f"{prefix}.{key}" if prefix else key
            
            if isinstance(value, dict):
                # Récursif pour les dictionnaires imbriqués
                paths.extend(self._extract_all_paths(value, current_path, depth + 1))
                # Ajouter aussi le chemin du dict lui-même
                paths.append((current_path, value, depth))
            elif isinstance(value, list) and value and isinstance(value[0], dict):
                # Liste de dictionnaires - extraire les champs du premier élément
                if value:
                    paths.append((current_path, value, depth))
                    # Optionnel: extraire les champs du premier élément comme exemple
                    paths.extend(self._extract_all_paths(value[0], current_path, depth + 1))
            else:
                # Valeur simple (string, number, list simple, etc.)
                paths.append((current_path, value, depth))
        
        return paths
    
    def _get_value_type(self, value: Any) -> str:
        """Détermine le type d'une valeur."""
        if isinstance(value, dict):
            return "dict"
        elif isinstance(value, list):
            return "list"
        elif isinstance(value, str):
            return "string"
        elif isinstance(value, (int, float)):
            return "number"
        elif isinstance(value, bool):
            return "boolean"
        else:
            return "unknown"
    
    def _determine_primary_type(self, types: Set[str]) -> str:
        """Détermine le type principal parmi plusieurs types observés."""
        # Priorité: dict > list > string > number > boolean > unknown
        priority = ["dict", "list", "string", "number", "boolean", "unknown"]
        for ptype in priority:
            if ptype in types:
                return ptype
        return "unknown"
    
    def _generate_label(self, path: str) -> str:
        """Génère un label lisible à partir d'un chemin."""
        # Prendre la dernière partie du chemin
        parts = path.split(".")
        last_part = parts[-1]
        
        # Remplacer les underscores et capitaliser
        label = last_part.replace("_", " ").replace("-", " ")
        # Capitaliser chaque mot
        label = " ".join(word.capitalize() for word in label.split())
        
        # Si le chemin a plusieurs parties, ajouter le contexte
        if len(parts) > 1:
            parent = parts[-2].replace("_", " ").capitalize()
            label = f"{parent} > {label}"
        
        return label
    
    def _categorize_field(self, path: str, element_type: str) -> Optional[str]:
        """Catégorise un champ selon son chemin."""
        path_lower = path.lower()
        
        # Catégories spécifiques par type (vérifier en premier pour avoir la priorité)
        if element_type == "character":
            if "dialogue" in path_lower or "voix" in path_lower or "langage" in path_lower:
                return "voice"
            if "caractérisation" in path_lower:
                return "characterization"
            if "background" in path_lower or "histoire" in path_lower or "relations" in path_lower:
                return "background"
            if "pouvoir" in path_lower or "héritage" in path_lower or "compétence" in path_lower:
                return "mechanics"
        
        # Vérifier chaque catégorie
        for category, keywords in self.FIELD_CATEGORIES.items():
            for keyword in keywords:
                if keyword.lower() in path_lower:
                    return category
        
        # Par défaut, essayer de deviner depuis le chemin
        if any(kw in path_lower for kw in ["nom", "alias", "occupation", "type", "rôle"]):
            return "identity"
        
        return None
    
    def classify_field_importance(self, frequency: float) -> str:
        """Classifie l'importance d'un champ selon sa fréquence.
        
        Returns:
            "essential" (>80%), "common" (20-80%), "rare" (<20%)
        """
        if frequency >= 0.8:
            return "essential"
        elif frequency >= 0.2:
            return "common"
        else:
            return "rare"
    
    def _identify_essential_fields(self, element_type: str, context_config: Dict) -> Set[str]:
        """Identifie les champs essentiels (contexte narratif + métadonnées).
        
        Deux listes explicites et séparées sont la source de vérité :
        - ContextOrganizer.ESSENTIAL_CONTEXT_FIELDS : essentiels du CONTEXTE NARRATIF
        - ContextOrganizer.ESSENTIAL_METADATA_FIELDS : essentiels des MÉTADONNÉES
        
        IMPORTANT: `is_metadata` et `is_essential` sont deux critères indépendants.
        Un champ peut être métadonnée et essentiel, ou contexte et essentiel.
        
        Args:
            element_type: Type d'élément
            context_config: Configuration depuis context_config.json (non utilisé pour l'instant)
            
        Returns:
            Set des chemins de champs essentiels (contexte + métadonnées)
        """
        from services.context_organizer import ContextOrganizer
        
        essential_fields = set()
        context_fields = ContextOrganizer.ESSENTIAL_CONTEXT_FIELDS.get(element_type, [])
        metadata_fields = ContextOrganizer.ESSENTIAL_METADATA_FIELDS.get(element_type, [])
        
        for field_path in context_fields:
            essential_fields.add(field_path)
            logger.debug(f"Champ essentiel pour '{element_type}': '{field_path}'")
        for field_path in metadata_fields:
            essential_fields.add(field_path)
            logger.debug(f"Champ essentiel (métadonnée) pour '{element_type}': '{field_path}'")
        
        logger.debug(f"Champs essentiels identifiés pour '{element_type}': {len(essential_fields)} champs")
        return essential_fields
    
    def _is_metadata_field(self, path: str, root_keys_order: List[str]) -> bool:
        """Détermine si un champ est une métadonnée selon l'ordre dans le JSON.
        
        Règles :
        - Si la racine contient ``Introduction`` : métadonnées = clés avant ``Introduction``
          (comportement exports classiques).
        - Sinon, si la racine contient ``sections`` (fiches Notion shard) : métadonnées =
          clés strictement avant ``sections`` ; ``sections`` et ses descendants = contexte.
        - Sinon : même heuristique historique (hors branche ``Introduction``).
        
        Args:
            path: Chemin du champ (ex: "Nom", "Espèce", "Introduction.Résumé")
            root_keys_order: Liste des clés racine dans l'ordre du JSON original
            
        Returns:
            True si le champ est une métadonnée.
        """
        if not root_keys_order:
            return False

        root_key = path.split(".")[0]

        if "Introduction" in root_keys_order:
            try:
                cutoff_index = root_keys_order.index("Introduction")
                key_index = root_keys_order.index(root_key)
                return key_index < cutoff_index
            except ValueError:
                return False

        if "sections" in root_keys_order:
            try:
                sections_index = root_keys_order.index("sections")
                key_index = root_keys_order.index(root_key)
                return key_index < sections_index
            except ValueError:
                return False

        return root_key != "Introduction" and not path.startswith("Introduction.")
    
    def _extract_field_value(self, data: Dict, path: str) -> Optional[Any]:
        """Extrait la valeur d'un champ depuis un chemin."""
        from services.gdd_sections_split import extract_gdd_field_value

        return extract_gdd_field_value(data, path)
    
    def _value_to_string(self, value: Any) -> str:
        """Convertit une valeur en string pour mesurer sa longueur."""
        if isinstance(value, (list, tuple)):
            # Pour les listes, joindre les éléments
            if not value:
                return ""
            if isinstance(value[0], dict):
                # Liste de dicts - extraire les noms si possible
                names = [item.get("Nom", item.get("Titre", str(item))) for item in value]
                return ", ".join(names)
            else:
                return ", ".join(str(item) for item in value)
        elif isinstance(value, dict):
            # Pour les dicts, essayer de trouver un résumé ou convertir en JSON
            if "Résumé" in value or "Résumé de la fiche" in value:
                return str(value.get("Résumé") or value.get("Résumé de la fiche", ""))
            # Sinon, juste la représentation string
            return str(value)
        else:
            return str(value)


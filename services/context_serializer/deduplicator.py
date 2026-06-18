"""Module de déduplication des champs avant sérialisation.

Détecte et supprime les doublons de contenu dans les données GDD pour éviter
les duplications dans le prompt généré.
"""
from typing import Dict, List, Any, Set, Tuple
import logging

logger = logging.getLogger(__name__)


class FieldDeduplicator:
    """Détecte et déduplique les champs avant la sérialisation."""
    
    def __init__(self):
        """Initialise le déduplicateur."""
        pass
    
    def extract_field_paths(
        self, 
        data: Dict[str, Any], 
        prefix: str = ""
    ) -> Dict[str, Any]:
        """Extrait tous les chemins de champs avec leurs valeurs.
        
        Args:
            data: Dictionnaire à parcourir
            prefix: Préfixe pour les chemins imbriqués
            
        Returns:
            Dict mapping chemin -> valeur (ex: {"Faiblesse": "X", "Caractérisation.Faiblesse": "X"})
        """
        result = {}
        
        for key, value in data.items():
            # Ignorer les champs techniques commençant par underscore
            if key.startswith("_"):
                continue
            
            current_path = f"{prefix}.{key}" if prefix else key
            
            if isinstance(value, dict):
                # Récursion pour les dictionnaires imbriqués
                nested = self.extract_field_paths(value, current_path)
                result.update(nested)
            elif isinstance(value, list):
                # Pour les listes, on stocke la liste complète
                result[current_path] = value
            else:
                # Pour les valeurs simples
                result[current_path] = value
        
        return result
    
    def _normalize_value(self, value: Any) -> str:
        """Normalise une valeur pour comparaison.
        
        Args:
            value: Valeur à normaliser
            
        Returns:
            Représentation normalisée pour comparaison
        """
        if value is None:
            return ""
        if isinstance(value, (list, dict)):
            import json
            return json.dumps(value, sort_keys=True, ensure_ascii=False)
        return str(value).strip().lower()
    
    def detect_duplicates(self, element_data: Dict[str, Any]) -> Dict[str, List[str]]:
        """Détecte les champs qui contiennent un contenu identique.
        
        Args:
            element_data: Données de l'élément GDD
            
        Returns:
            Dict mapping valeur normalisée -> liste des chemins dupliqués
            Ex: {"contenu_x": ["Faiblesse", "Caractérisation.Faiblesse"]}
        """
        # Extraire tous les chemins avec leurs valeurs
        field_paths = self.extract_field_paths(element_data)
        
        # Regrouper les chemins par valeur normalisée
        value_to_paths: Dict[str, List[str]] = {}
        
        for path, value in field_paths.items():
            normalized = self._normalize_value(value)
            
            # Ignorer les valeurs vides
            if not normalized:
                continue
            
            if normalized not in value_to_paths:
                value_to_paths[normalized] = []
            value_to_paths[normalized].append(path)
        
        # Ne garder que les groupes avec plusieurs chemins (doublons)
        duplicates = {
            normalized_val: paths 
            for normalized_val, paths in value_to_paths.items() 
            if len(paths) > 1
        }
        
        if duplicates and logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                f"Doublons détectés: {len(duplicates)} groupes de valeurs dupliquées"
            )
            for normalized_val, paths in duplicates.items():
                logger.debug(f"  Chemins dupliqués: {paths}")
        
        return duplicates
    
    def _choose_best_path(self, paths: List[str]) -> str:
        """Choisit le meilleur chemin parmi des chemins dupliqués.
        
        Stratégie:
        1. Privilégier les chemins directs (sans '.')
        2. Si tous sont imbriqués, privilégier le plus court
        3. Si égalité, prendre le premier alphabétiquement
        
        Args:
            paths: Liste de chemins dupliqués
            
        Returns:
            Le meilleur chemin à conserver
        """
        if not paths:
            return ""
        
        # Séparer chemins directs et imbriqués
        direct_paths = [p for p in paths if '.' not in p]
        nested_paths = [p for p in paths if '.' in p]
        
        # Privilégier les chemins directs
        if direct_paths:
            # Si plusieurs chemins directs, prendre le plus court puis alphabétique
            return sorted(direct_paths, key=lambda p: (len(p), p))[0]
        
        # Sinon, prendre le chemin imbriqué le plus court
        return sorted(nested_paths, key=lambda p: (p.count('.'), len(p), p))[0]
    
    def deduplicate_fields(
        self, 
        fields_to_include: List[str], 
        element_data: Dict[str, Any]
    ) -> List[str]:
        """Supprime les champs dupliqués de la liste des champs à inclure.
        
        **Root cause des duplications** : Si "Caractérisation" (objet parent) et 
        "Caractérisation.Faiblesse" (enfant) sont tous deux inclus, le frontend affiche
        le même contenu deux fois :
        - "Faiblesse": "..." (depuis Caractérisation.Faiblesse, label généré = "Faiblesse")
        - "Caractérisation": {"Faiblesse": "...", ...} (objet parent contenant aussi Faiblesse)
        
        **Stratégie** : Exclure les chemins parents si leurs enfants sont présents.
        Privilégier les chemins directs sur les chemins imbriqués pour contenu identique.
        
        Args:
            fields_to_include: Liste des chemins de champs à inclure
            element_data: Données de l'élément pour détecter les doublons
            
        Returns:
            Liste dédupliquée des chemins de champs
        """
        if not fields_to_include:
            return []
        
        # ÉTAPE 1 : Supprimer les chemins parents si leurs enfants sont présents
        # Ex: Si "Caractérisation.Faiblesse" est présent, supprimer "Caractérisation"
        # Utiliser une liste pour préserver l'ordre
        paths_to_remove = set()
        
        for path in fields_to_include:
            # Vérifier si ce chemin a des enfants dans la liste
            has_children = any(
                other_path.startswith(path + ".") 
                for other_path in fields_to_include 
                if other_path != path
            )
            
            if has_children:
                # Ce chemin est un parent avec des enfants inclus, le marquer pour suppression
                paths_to_remove.add(path)
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug(f"Suppression parent '{path}' car enfants présents")
        
        # Filtrer en préservant l'ordre
        fields_to_include = [p for p in fields_to_include if p not in paths_to_remove]
        
        # ÉTAPE 2 : Détecter les doublons de valeurs
        duplicates = self.detect_duplicates(element_data)
        
        if not duplicates:
            # Pas de doublons de valeurs détectés
            return fields_to_include
        
        # Créer un mapping chemin -> valeur normalisée
        field_paths = self.extract_field_paths(element_data)
        path_to_normalized = {
            path: self._normalize_value(value)
            for path, value in field_paths.items()
        }
        
        # Pour chaque groupe de doublons, choisir le meilleur chemin
        paths_to_keep: Set[str] = set()
        paths_to_remove: Set[str] = set()
        
        for normalized_val, duplicate_paths in duplicates.items():
            # Filtrer pour ne garder que les chemins qui sont dans fields_to_include
            relevant_paths = [p for p in duplicate_paths if p in fields_to_include]
            
            if len(relevant_paths) <= 1:
                # Pas de conflit dans fields_to_include
                continue
            
            # Choisir le meilleur chemin
            best_path = self._choose_best_path(relevant_paths)
            paths_to_keep.add(best_path)
            
            # Marquer les autres pour suppression
            for path in relevant_paths:
                if path != best_path:
                    paths_to_remove.add(path)
            
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(
                    f"Déduplication: conservé '{best_path}', supprimé {[p for p in relevant_paths if p != best_path]}"
                )
        
        # Appliquer la déduplication en préservant l'ordre
        deduplicated = [
            field for field in fields_to_include 
            if field not in paths_to_remove
        ]
        
        if len(deduplicated) < len(fields_to_include) and logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                f"Déduplication: {len(fields_to_include)} -> {len(deduplicated)} champs "
                f"({len(fields_to_include) - len(deduplicated)} doublons supprimés)"
            )
        
        return deduplicated
    
    def get_duplicate_groups(
        self, 
        element_data: Dict[str, Any]
    ) -> List[Tuple[str, List[str]]]:
        """Retourne les groupes de champs dupliqués de manière lisible.
        
        Args:
            element_data: Données de l'élément
            
        Returns:
            Liste de tuples (valeur_preview, liste_chemins_dupliqués)
        """
        duplicates = self.detect_duplicates(element_data)
        
        result = []
        for normalized_val, paths in duplicates.items():
            # Créer un aperçu de la valeur (limité à 100 caractères)
            preview = normalized_val[:100] + "..." if len(normalized_val) > 100 else normalized_val
            result.append((preview, paths))
        
        return result

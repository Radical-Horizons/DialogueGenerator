"""Service pour lire et gérer le catalogue des flags in-game depuis le CSV Unity."""
import csv
import logging
import os
import tempfile
from pathlib import Path
from typing import List, Optional, Dict, Any, Union

logger = logging.getLogger(__name__)


class FlagCatalogService:
    """Service pour lire et gérer le catalogue des flags in-game.
    
    Lit le fichier CSV FlagCatalog.csv partagé avec Unity et permet
    de créer/modifier des définitions de flags pour la génération de dialogues.
    """
    
    def __init__(self, csv_path: Optional[Path] = None):
        """Initialise le service avec le chemin du CSV.
        
        Args:
            csv_path: Chemin vers le fichier CSV. Si None, utilise le chemin par défaut
                     (data/UnityData/FlagCatalog.csv).
        """
        if csv_path is None:
            # Chemin par défaut relatif à la racine du projet
            project_root = Path(__file__).resolve().parent.parent
            csv_path = project_root / "data" / "UnityData" / "FlagCatalog.csv"
        
        self.csv_path = csv_path.resolve()  # Résoudre le symlink si présent
        self._flags: Optional[List[Dict[str, Any]]] = None
        logger.info(f"FlagCatalogService initialisé avec le chemin: {self.csv_path}")
    
    def parse_default_value(self, value_str: str, flag_type: str) -> Union[bool, int, float, str]:
        """Parse une valeur par défaut selon le type du flag.
        
        Args:
            value_str: Valeur en string depuis le CSV.
            flag_type: Type du flag ("bool", "int", "float", "string").
            
        Returns:
            Valeur parsée selon le type (bool, int, float, ou string).
        """
        if not value_str:
            # Valeur par défaut selon le type
            if flag_type == "bool":
                return False
            elif flag_type in ("int", "float"):
                return 0
            else:
                return ""
        
        if flag_type == "bool":
            return value_str.lower() in ("true", "1", "yes")
        elif flag_type == "int":
            try:
                return int(value_str)
            except ValueError:
                logger.warning(f"Impossible de parser '{value_str}' en int, utilisation de 0")
                return 0
        elif flag_type == "float":
            try:
                return float(value_str)
            except ValueError:
                logger.warning(f"Impossible de parser '{value_str}' en float, utilisation de 0.0")
                return 0.0
        else:  # string
            return value_str
    
    def load_definitions(self) -> List[Dict[str, Any]]:
        """Charge la liste des définitions de flags depuis le CSV.
        
        Returns:
            Liste de dictionnaires contenant les définitions de flags.
            Format: [{
                "id": "PLAYER_KILLED_BOSS",
                "type": "bool",
                "category": "Event",
                "label": "Player killed boss",
                "description": "Player has defeated the final boss",
                "defaultValue": "false",
                "tags": ["quest", "main"],
                "isFavorite": True
            }, ...]
            
        Raises:
            FileNotFoundError: Si le fichier CSV n'existe pas.
            ValueError: Si le CSV est mal formaté ou ne contient pas les colonnes attendues.
        """
        if self._flags is not None:
            return self._flags
        
        if not self.csv_path.exists():
            logger.warning(f"Fichier CSV introuvable: {self.csv_path}. Retour d'une liste vide.")
            self._flags = []
            return self._flags
        
        flags = []
        
        try:
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                # Vérifier que les colonnes attendues existent
                required_columns = ["Id", "Type", "Category", "Label", "Description", "DefaultValue", "Tags", "IsFavorite"]
                missing_columns = [col for col in required_columns if col not in reader.fieldnames]
                if missing_columns:
                    raise ValueError(
                        f"Colonnes manquantes dans le CSV: {missing_columns}. "
                        f"Colonnes disponibles: {reader.fieldnames}"
                    )
                
                for row in reader:
                    flag_id = row.get("Id", "").strip()
                    flag_type = row.get("Type", "bool").strip()
                    category = row.get("Category", "").strip()
                    label = row.get("Label", "").strip()
                    description = row.get("Description", "").strip()
                    default_value = row.get("DefaultValue", "").strip()
                    tags_raw = row.get("Tags", "").strip()
                    is_favorite_raw = row.get("IsFavorite", "false").strip()
                    
                    # Ignorer les lignes où l'ID est vide
                    if not flag_id:
                        continue
                    
                    # Parser les tags (séparés par point-virgule)
                    tags = [t.strip() for t in tags_raw.split(";") if t.strip()] if tags_raw else []
                    
                    # Parser isFavorite (bool)
                    is_favorite = is_favorite_raw.lower() in ("true", "1", "yes")
                    
                    # Parser la valeur par défaut selon le type
                    parsed_default_value = self.parse_default_value(default_value, flag_type)
                    
                    flag_dict = {
                        "id": flag_id,
                        "type": flag_type,
                        "category": category,
                        "label": label,
                        "description": description,
                        "defaultValue": default_value,  # Garder en string pour compatibilité CSV
                        "defaultValueParsed": parsed_default_value,  # Ajouter la valeur parsée
                        "tags": tags,
                        "isFavorite": is_favorite
                    }
                    flags.append(flag_dict)
            
            self._flags = flags
            logger.info(f"Chargement réussi: {len(flags)} flags depuis {self.csv_path}")
            return flags
            
        except csv.Error as e:
            logger.error(f"Erreur lors du parsing du CSV: {e}")
            raise ValueError(f"Erreur de format CSV: {e}")
        except Exception as e:
            logger.error(f"Erreur inattendue lors du chargement des flags: {e}")
            raise
    
    def search(
        self,
        query: Optional[str] = None,
        category: Optional[str] = None,
        favorites_only: bool = False
    ) -> List[Dict[str, Any]]:
        """Recherche des flags selon des critères.
        
        Args:
            query: Terme de recherche (recherche dans id, label, description, tags).
            category: Filtrer par catégorie.
            favorites_only: Ne retourner que les favoris.
            
        Returns:
            Liste des flags correspondant aux critères.
        """
        flags = self.load_definitions()
        results = flags
        
        # Filtrer par favoris
        if favorites_only:
            results = [f for f in results if f.get("isFavorite", False)]
        
        # Filtrer par catégorie
        if category:
            results = [f for f in results if f.get("category", "").lower() == category.lower()]
        
        # Recherche textuelle
        if query:
            query_lower = query.lower()
            results = [
                f for f in results
                if (
                    query_lower in f.get("id", "").lower()
                    or query_lower in f.get("label", "").lower()
                    or query_lower in f.get("description", "").lower()
                    or any(query_lower in tag.lower() for tag in f.get("tags", []))
                )
            ]
        
        return results
    
    def upsert_definition(self, definition: Dict[str, Any]) -> None:
        """Crée ou met à jour une définition de flag dans le CSV.
        
        Args:
            definition: Dictionnaire contenant la définition complète du flag.
                       Doit contenir au minimum: id, type, category, label.
                       
        Raises:
            ValueError: Si la définition est invalide.
        """
        # Valider la définition
        required_fields = ["id", "type", "category", "label"]
        missing_fields = [f for f in required_fields if f not in definition or not definition[f]]
        if missing_fields:
            raise ValueError(f"Champs requis manquants: {missing_fields}")
        
        # Valider le type
        valid_types = ["bool", "int", "float", "string"]
        if definition["type"] not in valid_types:
            raise ValueError(f"Type invalide: {definition['type']}. Types valides: {valid_types}")
        
        # Charger les définitions existantes
        flags = self.load_definitions()
        
        # Trouver l'index du flag existant (si présent)
        existing_index = None
        for i, flag in enumerate(flags):
            if flag["id"] == definition["id"]:
                existing_index = i
                break
        
        # Normaliser la définition
        normalized = {
            "id": definition["id"],
            "type": definition["type"],
            "category": definition.get("category", ""),
            "label": definition.get("label", ""),
            "description": definition.get("description", ""),
            "defaultValue": definition.get("defaultValue", ""),
            "tags": definition.get("tags", []),
            "isFavorite": definition.get("isFavorite", False)
        }
        
        # Mettre à jour ou ajouter
        if existing_index is not None:
            flags[existing_index] = normalized
        else:
            flags.append(normalized)
        
        # Écrire le CSV de manière atomique (Windows-safe)
        self._write_csv(flags)
        
        # Invalider le cache
        self._flags = None
        logger.info(f"Flag {'mis à jour' if existing_index is not None else 'créé'}: {definition['id']}")
    
    def toggle_favorite(self, flag_id: str, is_favorite: bool) -> None:
        """Active/désactive le statut favori d'un flag.
        
        Args:
            flag_id: ID du flag.
            is_favorite: True pour marquer comme favori, False sinon.
            
        Raises:
            ValueError: Si le flag n'existe pas.
        """
        flags = self.load_definitions()
        
        # Trouver le flag
        flag = None
        for f in flags:
            if f["id"] == flag_id:
                flag = f
                break
        
        if flag is None:
            raise ValueError(f"Flag introuvable: {flag_id}")
        
        # Mettre à jour le statut favori
        flag["isFavorite"] = is_favorite
        
        # Écrire le CSV
        self._write_csv(flags)
        
        # Invalider le cache
        self._flags = None
        logger.info(f"Flag {flag_id} marqué comme {'favori' if is_favorite else 'non-favori'}")
    
    def _write_csv(self, flags: List[Dict[str, Any]]) -> None:
        """Écrit le CSV de manière atomique (Windows-safe).
        
        Args:
            flags: Liste des définitions de flags à écrire.
        """
        # Créer le dossier parent si nécessaire
        self.csv_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Écrire dans un fichier temporaire
        temp_fd, temp_path = tempfile.mkstemp(
            suffix=".csv",
            dir=self.csv_path.parent,
            text=True
        )
        
        try:
            with os.fdopen(temp_fd, 'w', encoding='utf-8', newline='') as f:
                fieldnames = ["Id", "Type", "Category", "Label", "Description", "DefaultValue", "Tags", "IsFavorite"]
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                
                for flag in flags:
                    # Convertir les tags en string (séparés par point-virgule)
                    tags_str = ";".join(flag.get("tags", []))
                    # Convertir isFavorite en string
                    is_favorite_str = "true" if flag.get("isFavorite", False) else "false"
                    
                    row = {
                        "Id": flag.get("id", ""),
                        "Type": flag.get("type", "bool"),
                        "Category": flag.get("category", ""),
                        "Label": flag.get("label", ""),
                        "Description": flag.get("description", ""),
                        "DefaultValue": flag.get("defaultValue", ""),
                        "Tags": tags_str,
                        "IsFavorite": is_favorite_str
                    }
                    writer.writerow(row)
            
            # Remplacer le fichier original de manière atomique (Windows-safe)
            os.replace(temp_path, self.csv_path)
            logger.info(f"CSV écrit avec succès: {self.csv_path}")
            
        except Exception as e:
            # Nettoyer le fichier temporaire en cas d'erreur
            try:
                os.remove(temp_path)
            except OSError as rm_exc:
                logger.debug("Suppression fichier temp CSV ignorée: %s", rm_exc)
            raise ValueError(f"Erreur lors de l'écriture du CSV: {e}")
    
    def reload(self) -> None:
        """Force le rechargement du CSV (utile si le fichier a été modifié)."""
        self._flags = None
        logger.info("Rechargement forcé du catalogue des flags")

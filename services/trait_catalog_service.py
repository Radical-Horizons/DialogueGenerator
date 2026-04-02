"""Service pour lire et gérer le catalogue des traits depuis le CSV Unity."""
import csv
import logging
from pathlib import Path
from typing import List, Optional, Dict, Tuple

logger = logging.getLogger(__name__)


class TraitCatalogService:
    """Service pour lire et gérer le catalogue des traits.
    
    Lit le fichier CSV TraitCatalog.csv et extrait la liste des traits
    disponibles (labels positifs et négatifs) pour les inclure dans les prompts de génération.
    """
    
    def __init__(self, csv_path: Optional[Path] = None):
        """Initialise le service avec le chemin du CSV.
        
        Args:
            csv_path: Chemin vers le fichier CSV. Si None, utilise le chemin par défaut
                     (data/UnityData/TraitCatalog.csv).
        """
        if csv_path is None:
            # Chemin par défaut relatif à la racine du projet
            project_root = Path(__file__).resolve().parent.parent
            csv_path = project_root / "data" / "UnityData" / "TraitCatalog.csv"
        
        self.csv_path = csv_path
        self._traits: Optional[List[Dict[str, str]]] = None
        logger.info(f"TraitCatalogService initialisé avec le chemin: {self.csv_path}")
    
    def load_traits(self) -> List[Dict[str, str]]:
        """Charge la liste des traits depuis le CSV.
        
        Extrait les colonnes "Label Positif" et "Label Négatif" du CSV et retourne
        une liste de dictionnaires avec les informations des traits.
        
        Returns:
            Liste de dictionnaires contenant les traits avec leurs labels positifs et négatifs.
            Format: [{"positive": "Courageux", "negative": "Lâche", "axis": "Loyal_Traitre", "sphere": "Pouvoir"}, ...]
            
        Raises:
            FileNotFoundError: Si le fichier CSV n'existe pas.
            ValueError: Si le CSV est mal formaté ou ne contient pas les colonnes attendues.
        """
        if self._traits is not None:
            return self._traits
        
        if not self.csv_path.exists():
            # Dégradation gracieuse : le catalogue Unity est optionnel (ex. en CI/tests).
            # On renvoie une liste vide et on log un warning contextualisé.
            logger.warning(f"Fichier CSV des traits introuvable: {self.csv_path} (catalogue ignoré)")
            self._traits = []
            return self._traits
        
        traits = []
        
        try:
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                # Vérifier que les colonnes attendues existent
                required_columns = ["Label Positif", "Label Négatif"]
                missing_columns = [col for col in required_columns if col not in reader.fieldnames]
                if missing_columns:
                    raise ValueError(
                        f"Colonnes manquantes dans le CSV: {missing_columns}. "
                        f"Colonnes disponibles: {reader.fieldnames}"
                    )
                
                for row in reader:
                    positive_label = row.get("Label Positif", "").strip()
                    negative_label = row.get("Label Négatif", "").strip()
                    axis = row.get("Axe", "").strip()
                    sphere = row.get("Sphère", "").strip()
                    
                    # Ignorer les lignes où les deux labels sont vides
                    if not positive_label and not negative_label:
                        continue
                    
                    trait_dict = {
                        "positive": positive_label,
                        "negative": negative_label,
                        "axis": axis,
                        "sphere": sphere
                    }
                    traits.append(trait_dict)
            
            self._traits = traits
            logger.info(f"Chargement réussi: {len(traits)} traits depuis {self.csv_path}")
            return traits
            
        except csv.Error as e:
            logger.error(f"Erreur lors du parsing du CSV: {e}")
            raise ValueError(f"Erreur de format CSV: {e}")
        except Exception as e:
            logger.error(f"Erreur inattendue lors du chargement des traits: {e}")
            raise
    
    def get_trait_labels(self) -> List[str]:
        """Retourne la liste de tous les labels de traits (positifs et négatifs).
        
        Returns:
            Liste de tous les labels de traits uniques et triés.
        """
        traits = self.load_traits()
        labels = []
        
        for trait in traits:
            if trait["positive"]:
                labels.append(trait["positive"])
            if trait["negative"]:
                labels.append(trait["negative"])
        
        # Dédupliquer et trier
        return sorted(list(set(labels)))
    
    def get_traits_for_prompt(self) -> str:
        """Retourne la liste des traits formatée pour le prompt.
        
        Returns:
            Chaîne formatée listant les traits disponibles.
            Format: "Traits disponibles (positifs/négatifs): Courageux/Lâche, Diplomate/Provocateur, ..."
        """
        traits = self.load_traits()
        
        if not traits:
            return "Aucun trait disponible."
        
        # Formater les paires positif/négatif
        trait_pairs = []
        for trait in traits:
            positive = trait.get("positive", "")
            negative = trait.get("negative", "")
            if positive and negative:
                trait_pairs.append(f"{positive}/{negative}")
            elif positive:
                trait_pairs.append(positive)
            elif negative:
                trait_pairs.append(negative)
        
        # Limiter à 30 paires pour éviter un prompt trop long
        trait_pairs_display = trait_pairs[:30]
        traits_text = ", ".join(trait_pairs_display)
        
        if len(trait_pairs) > 30:
            traits_text += f" (et {len(trait_pairs) - 30} autres paires de traits)"
        
        return f"Traits disponibles (positifs/négatifs): {traits_text}"
    
    def reload(self) -> None:
        """Force le rechargement du CSV (utile si le fichier a été modifié)."""
        self._traits = None
        logger.info("Rechargement forcé du catalogue des traits")


"""Service pour lire et gérer le catalogue des compétences depuis le CSV Unity."""
import csv
import logging
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


class SkillCatalogService:
    """Service pour lire et gérer le catalogue des compétences.
    
    Lit le fichier CSV SkillCatalog.csv et extrait la liste des compétences
    disponibles pour les inclure dans les prompts de génération.
    """
    
    def __init__(self, csv_path: Optional[Path] = None):
        """Initialise le service avec le chemin du CSV.
        
        Args:
            csv_path: Chemin vers le fichier CSV. Si None, utilise le chemin par défaut
                     (data/UnityData/SkillCatalog.csv).
        """
        if csv_path is None:
            # Chemin par défaut relatif à la racine du projet
            project_root = Path(__file__).resolve().parent.parent
            csv_path = project_root / "data" / "UnityData" / "SkillCatalog.csv"
        
        self.csv_path = csv_path
        self._skills: Optional[List[str]] = None
        logger.info(f"SkillCatalogService initialisé avec le chemin: {self.csv_path}")
    
    def load_skills(self) -> List[str]:
        """Charge la liste des compétences depuis le CSV.
        
        Extrait la colonne "Compétence" du CSV et retourne une liste de noms
        de compétences uniques et triés.
        
        Returns:
            Liste des noms de compétences.
            
        Raises:
            FileNotFoundError: Si le fichier CSV n'existe pas.
            ValueError: Si le CSV est mal formaté ou ne contient pas la colonne attendue.
        """
        if self._skills is not None:
            return self._skills
        
        if not self.csv_path.exists():
            # Dégradation gracieuse : le catalogue Unity est optionnel (ex. en CI/tests).
            # On renvoie une liste vide et on log un warning contextualisé.
            logger.warning(f"Fichier CSV des compétences introuvable: {self.csv_path} (catalogue ignoré)")
            self._skills = []
            return self._skills
        
        skills = []
        
        try:
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                # Vérifier que la colonne "Compétence" existe
                if "Compétence" not in reader.fieldnames:
                    raise ValueError(
                        f"La colonne 'Compétence' est absente du CSV. Colonnes disponibles: {reader.fieldnames}"
                    )
                
                for row in reader:
                    competence = row.get("Compétence", "").strip()
                    if competence:  # Ignorer les lignes vides
                        skills.append(competence)
            
            # Dédupliquer et trier
            skills = sorted(list(set(skills)))
            self._skills = skills
            logger.info(f"Chargement réussi: {len(skills)} compétences uniques depuis {self.csv_path}")
            return skills
            
        except csv.Error as e:
            logger.error(f"Erreur lors du parsing du CSV: {e}")
            raise ValueError(f"Erreur de format CSV: {e}")
        except Exception as e:
            logger.error(f"Erreur inattendue lors du chargement des compétences: {e}")
            raise
    
    def get_skills_for_prompt(self) -> str:
        """Retourne la liste des compétences formatée pour le prompt.
        
        Returns:
            Chaîne formatée listant les compétences disponibles.
            Format: "Compétences disponibles: Rhétorique, Histoire, Diplomatie, ..."
        """
        skills = self.load_skills()
        
        if not skills:
            return "Aucune compétence disponible."
        
        # Limiter à 50 compétences pour éviter un prompt trop long
        # (on peut ajuster selon les besoins)
        skills_display = skills[:50]
        skills_text = ", ".join(skills_display)
        
        if len(skills) > 50:
            skills_text += f" (et {len(skills) - 50} autres compétences)"
        
        return f"Compétences disponibles: {skills_text}"
    
    def reload(self) -> None:
        """Force le rechargement du CSV (utile si le fichier a été modifié)."""
        self._skills = None
        logger.info("Rechargement forcé du catalogue des compétences")







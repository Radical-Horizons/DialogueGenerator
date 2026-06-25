"""Service pour lire et gérer le catalogue des compétences depuis le CSV Unity."""
import logging
from pathlib import Path
from typing import List, Optional

from services.skill_check_catalog import SkillCheckCatalogEntry, load_skill_entries

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
        self._entries: Optional[List[SkillCheckCatalogEntry]] = None
        logger.info(f"SkillCatalogService initialisé avec le chemin: {self.csv_path}")

    def load_skill_entries(self) -> List[SkillCheckCatalogEntry]:
        """Charge les entrées compétence (id Unity + libellé)."""
        if self._entries is not None:
            return self._entries
        self._entries = load_skill_entries(self.csv_path)
        return self._entries

    def load_skills(self) -> List[str]:
        """Charge les identifiants Unity des compétences (sans espaces).

        Returns:
            Liste d'identifiants triés, utilisables dans ``Attribut+Compétence:DD``.
        """
        if self._skills is not None:
            return self._skills
        self._skills = [entry.id for entry in self.load_skill_entries()]
        if self._skills:
            logger.info(
                "Chargement réussi: %s identifiants compétence depuis %s",
                len(self._skills),
                self.csv_path,
            )
        return self._skills

    def reload(self) -> None:
        """Force le rechargement du CSV (utile si le fichier a été modifié)."""
        self._skills = None
        self._entries = None
        logger.info("Rechargement forcé du catalogue des compétences")







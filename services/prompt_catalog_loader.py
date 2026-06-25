"""Charge les catalogues hors-GDD pour les prompts LLM."""
import logging
from typing import List

from services.skill_catalog_service import SkillCatalogService
from services.skill_check_catalog import load_attribute_ids_for_prompt
from services.trait_catalog_service import TraitCatalogService

logger = logging.getLogger(__name__)


def load_prompt_catalogs(
    skill_service: SkillCatalogService,
    trait_service: TraitCatalogService,
) -> tuple[List[str], List[str], List[str]]:
    """Charge compétences, caractéristiques et traits (listes vides si échec partiel)."""
    skills_list: List[str] = []
    try:
        skills_list = skill_service.load_skills()
    except Exception as exc:
        logger.warning("Erreur lors du chargement des compétences: %s", exc, exc_info=True)

    attributes_list = load_attribute_ids_for_prompt()

    traits_list: List[str] = []
    try:
        traits_list = trait_service.get_trait_labels()
    except Exception as exc:
        logger.warning("Erreur lors du chargement des traits: %s", exc, exc_info=True)

    return skills_list, attributes_list, traits_list

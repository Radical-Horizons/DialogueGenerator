"""Script pour synchroniser le vocabulaire depuis Notion via MCP.

Ce script doit être exécuté depuis l'agent avec accès aux outils MCP Notion.
Il récupère toutes les pages de la base de données Vocabulaire Alteir,
les traite et les met en cache.
"""
import json
import logging
import re
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional

# Ajouter le répertoire parent au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.notion_import_service import NotionImportService, VOCABULARY_DATA_SOURCE_ID
from shared.caches import get_notion_cache

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def parse_notion_properties(page_text: str) -> Dict[str, Any]:
    """Parse les propriétés Notion depuis le texte de la page.
    
    Args:
        page_text: Texte de la page Notion au format MCP.
        
    Returns:
        Dictionnaire avec les propriétés parsées.
    """
    match = re.search(r'<properties>\s*(\{.*?\})\s*</properties>', page_text, re.DOTALL)
    if not match:
        return {}
    
    try:
        properties_json = match.group(1)
        # Nettoyer le JSON (enlever les {{ }} autour des URLs)
        properties_json = re.sub(r'\{\{([^}]+)\}\}', r'\1', properties_json)
        properties = json.loads(properties_json)
        return properties
    except json.JSONDecodeError as e:
        logger.error(f"Erreur lors du parsing JSON des propriétés: {e}")
        return {}


def process_vocabulary_pages(pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Traite les pages Notion pour extraire le vocabulaire.
    
    Args:
        pages: Liste des pages Notion (format MCP fetch).
        
    Returns:
        Liste des termes formatés.
    """
    terms = []
    notion_service = NotionImportService()
    
    for page in pages:
        try:
            term = notion_service.process_vocabulary_page_fetch(page)
            if term:
                terms.append(term)
        except Exception as e:
            logger.warning(f"Erreur lors du traitement d'une page: {e}")
            continue
    
    logger.info(f"Traitement de {len(terms)} termes depuis Notion")
    return terms


if __name__ == "__main__":
    """Point d'entrée du script.
    
    Ce script doit être exécuté depuis l'agent avec accès aux outils MCP Notion.
    """
    logger.info("Script de synchronisation Notion - doit être exécuté depuis l'agent")
    logger.info("Utilisez les outils MCP Notion pour récupérer les données")





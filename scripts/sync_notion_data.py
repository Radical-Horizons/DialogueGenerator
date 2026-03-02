"""Script pour synchroniser les données Notion via MCP et les mettre en cache.

Ce script utilise les outils MCP Notion disponibles dans l'environnement Cursor
pour récupérer les données et les stocker dans le cache local.
"""
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

# Ajouter le répertoire parent au path pour les imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.notion_import_service import (
    NotionImportService,
    VOCABULARY_DATA_SOURCE_ID,
    DIALOGUE_GUIDE_PAGE_ID,
    NARRATIVE_GUIDE_PAGE_ID
)
from shared.caches import get_notion_cache

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def parse_notion_properties(page_text: str) -> Dict[str, Any]:
    """Parse les propriétés Notion depuis le texte de la page.
    
    Le format MCP Notion retourne les propriétés dans une balise <properties>
    avec du JSON.
    
    Args:
        page_text: Texte de la page Notion au format MCP.
        
    Returns:
        Dictionnaire avec les propriétés parsées.
    """
    # Extraire le JSON des propriétés depuis la balise <properties>
    match = re.search(r'<properties>\s*(\{.*?\})\s*</properties>', page_text, re.DOTALL)
    if not match:
        logger.warning("Aucune propriété trouvée dans la page")
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


def sync_vocabulary_from_notion_mcp() -> Dict[str, Any]:
    """Synchronise le vocabulaire depuis Notion via MCP.
    
    Cette fonction doit être appelée depuis un contexte où les outils MCP
    sont disponibles (environnement Cursor/agent).
    
    Returns:
        Dictionnaire avec le résultat de la synchronisation.
    """
    logger.info("Démarrage de la synchronisation du vocabulaire depuis Notion")
    
    # Note: Cette fonction doit être appelée depuis l'agent avec accès aux outils MCP
    # Pour l'instant, on retourne une structure vide
    # L'implémentation réelle utilisera les outils MCP Notion disponibles
    
    return {
        "success": False,
        "error": "Cette fonction doit être appelée depuis l'agent avec accès aux outils MCP Notion"
    }


def process_vocabulary_pages(pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Traite les pages Notion pour extraire le vocabulaire.
    
    Args:
        pages: Liste des pages Notion (format MCP).
        
    Returns:
        Liste des termes formatés.
    """
    terms = []
    notion_service = NotionImportService()
    
    for page in pages:
        try:
            page_text = page.get("text", "")
            properties = parse_notion_properties(page_text)
            
            if not properties:
                continue
            
            # Extraire les propriétés
            terme = properties.get("Terme", "")
            definition = properties.get("Définition", "")
            popularité = properties.get("Popularité", "Occulte")
            categorie = properties.get("Catégorie", "Autre")
            type_term = properties.get("Type", "")
            origine = properties.get("Origine", "")
            
            if terme:
                terms.append({
                    "term": terme,
                    "definition": definition or "",
                    "popularité": popularité or "Occulte",
                    "category": categorie or "Autre",
                    "type": type_term or "",
                    "origin": origine or ""
                })
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





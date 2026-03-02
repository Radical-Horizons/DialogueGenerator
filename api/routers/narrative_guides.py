"""Router pour les guides narratifs."""
import logging
from typing import Annotated
from datetime import datetime
from fastapi import APIRouter, Depends, status

from api.dependencies import (
    get_narrative_guides_service,
    get_notion_import_service,
    get_request_id
)
from api.exceptions import InternalServerException
from api.schemas.vocabulary import (
    NarrativeGuideResponse,
    NarrativeGuidesSyncResponse
)
from services.narrative_guides_service import NarrativeGuidesService
from services.notion_import_service import NotionImportService
from shared.caches import get_notion_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/narrative-guides", tags=["narrative-guides"])


@router.get(
    "",
    response_model=NarrativeGuideResponse,
    status_code=status.HTTP_200_OK
)
async def get_narrative_guides(
    guides_service: Annotated[NarrativeGuidesService, Depends(get_narrative_guides_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> NarrativeGuideResponse:
    """Récupère les guides narratifs (Guide des dialogues + Guide de narration).
    
    Args:
        guides_service: Service des guides narratifs injecté.
        request_id: ID de la requête.
    
    Returns:
        Réponse contenant les guides et les règles extraites.
    """
    try:
        guides = guides_service.load_guides()
        rules = guides_service.extract_rules(guides)
        
        # Récupérer le timestamp de dernière sync depuis le cache
        cache = get_notion_cache()
        metadata = cache.get_metadata()
        last_sync = None
        if metadata.get("dialogue_guide", {}).get("last_sync"):
            last_sync = metadata["dialogue_guide"]["last_sync"]
        elif metadata.get("narrative_guide", {}).get("last_sync"):
            last_sync = metadata["narrative_guide"]["last_sync"]
        
        logger.info(
            f"Guides narratifs récupérés: dialogue ({len(guides.get('dialogue_guide', ''))} chars), "
            f"narration ({len(guides.get('narrative_guide', ''))} chars) "
            f"(request_id: {request_id})"
        )
        
        return NarrativeGuideResponse(
            dialogue_guide=guides.get("dialogue_guide", ""),
            narrative_guide=guides.get("narrative_guide", ""),
            rules=rules,
            last_sync=last_sync
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération des guides (request_id: {request_id}): {e}")
        raise InternalServerException(
            message="Erreur lors de la récupération des guides narratifs",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/rules",
    response_model=dict,
    status_code=status.HTTP_200_OK
)
async def get_extracted_rules(
    guides_service: Annotated[NarrativeGuidesService, Depends(get_narrative_guides_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> dict:
    """Récupère uniquement les règles extraites des guides.
    
    Args:
        guides_service: Service des guides narratifs injecté.
        request_id: ID de la requête.
    
    Returns:
        Dictionnaire avec les règles extraites par catégorie (ton, structure, interdits, principes).
    """
    try:
        guides = guides_service.load_guides()
        rules = guides_service.extract_rules(guides)
        
        logger.info(f"Règles extraites récupérées (request_id: {request_id})")
        
        return rules
    except Exception as e:
        logger.exception(f"Erreur lors de l'extraction des règles (request_id: {request_id}): {e}")
        raise InternalServerException(
            message="Erreur lors de l'extraction des règles",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/sync",
    response_model=NarrativeGuidesSyncResponse,
    status_code=status.HTTP_200_OK
)
async def sync_narrative_guides(
    notion_service: Annotated[NotionImportService, Depends(get_notion_import_service)] = None,
    guides_service: Annotated[NarrativeGuidesService, Depends(get_narrative_guides_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> NarrativeGuidesSyncResponse:
    """Synchronise les guides narratifs depuis Notion.
    
    Args:
        notion_service: Service d'import Notion injecté.
        guides_service: Service des guides narratifs injecté.
        request_id: ID de la requête.
    
    Returns:
        Réponse de synchronisation.
    """
    try:
        logger.info(f"Démarrage de la synchronisation des guides depuis Notion (request_id: {request_id})")
        
        # Synchroniser les deux guides en parallèle
        dialogue_guide_id = NotionImportService.get_dialogue_guide_page_id()
        narrative_guide_id = NotionImportService.get_narrative_guide_page_id()
        
        dialogue_content = await notion_service.sync_guide(dialogue_guide_id)
        narrative_content = await notion_service.sync_guide(narrative_guide_id)
        
        # Sauvegarder dans le cache
        cache = get_notion_cache()
        if dialogue_content:
            cache.set("dialogue_guide", {"content": dialogue_content})
        if narrative_content:
            cache.set("narrative_guide", {"content": narrative_content})
        
        last_sync = datetime.now().isoformat()
        
        logger.info(
            f"Synchronisation terminée: dialogue ({len(dialogue_content) if dialogue_content else 0} chars), "
            f"narration ({len(narrative_content) if narrative_content else 0} chars) "
            f"(request_id: {request_id})"
        )
        
        return NarrativeGuidesSyncResponse(
            success=True,
            dialogue_guide_length=len(dialogue_content) if dialogue_content else 0,
            narrative_guide_length=len(narrative_content) if narrative_content else 0,
            last_sync=last_sync,
            error=None
        )
        
    except ValueError as e:
        # Erreur de configuration (pas de clé API)
        logger.warning(f"Configuration Notion manquante (request_id: {request_id}): {e}")
        return NarrativeGuidesSyncResponse(
            success=False,
            dialogue_guide_length=0,
            narrative_guide_length=0,
            last_sync=None,
            error=f"Configuration Notion manquante: {str(e)}. Configurez NOTION_API_KEY dans les variables d'environnement."
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la synchronisation des guides (request_id: {request_id}): {e}")
        return NarrativeGuidesSyncResponse(
            success=False,
            dialogue_guide_length=0,
            narrative_guide_length=0,
            last_sync=None,
            error=str(e)
        )


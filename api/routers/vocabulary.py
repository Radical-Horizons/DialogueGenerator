"""Router pour le vocabulaire Alteir."""
import logging
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query, status
from datetime import datetime

from api.dependencies import (
    get_vocabulary_service,
    get_notion_import_service,
    get_request_id
)
from api.exceptions import InternalServerException
from api.schemas.vocabulary import (
    VocabularyResponse,
    VocabularySyncResponse,
    VocabularyStatsResponse,
    VocabularyTerm
)
from services.vocabulary_service import VocabularyService
from services.notion_import_service import NotionImportService
from shared.caches import get_notion_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vocabulary", tags=["vocabulary"])


@router.get(
    "",
    response_model=VocabularyResponse,
    status_code=status.HTTP_200_OK
)
async def get_vocabulary(
    min_popularité: Annotated[Optional[str], Query(description="Niveau de popularité minimum (Mondialement, Régionalement, Localement, etc.)")] = None,
    vocabulary_service: Annotated[VocabularyService, Depends(get_vocabulary_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> VocabularyResponse:
    """Récupère le vocabulaire Alteir, filtré par niveau de popularité.
    
    Args:
        min_popularité: Niveau de popularité minimum. Si non fourni, retourne tous les termes.
        vocabulary_service: Service de vocabulaire injecté.
        request_id: ID de la requête.
    
    Returns:
        Réponse contenant le vocabulaire filtré.
    """
    try:
        all_terms = vocabulary_service.load_vocabulary()
        
        if not all_terms:
            logger.warning(f"Vocabulaire vide dans le cache (request_id: {request_id})")
            return VocabularyResponse(
                terms=[],
                total=0,
                filtered_count=0,
                min_popularité=min_popularité or "Tous",
                statistics={}
            )
        
        # Filtrer par popularité si spécifié
        if min_popularité:
            filtered_terms = vocabulary_service.filter_by_popularity(all_terms, min_popularité)
        else:
            filtered_terms = all_terms
        
        # Calculer les statistiques
        stats = vocabulary_service.get_statistics(all_terms)
        
        # Convertir en VocabularyTerm
        term_objects = []
        for term in filtered_terms:
            term_dict = dict(term)
            term_objects.append(VocabularyTerm(**term_dict))
        
        logger.info(
            f"Vocabulaire récupéré: {len(term_objects)}/{len(all_terms)} termes "
            f"(min_popularité: {min_popularité or 'Tous'}, request_id: {request_id})"
        )
        
        return VocabularyResponse(
            terms=term_objects,
            total=len(all_terms),
            filtered_count=len(term_objects),
            min_popularité=min_popularité or "Tous",
            statistics=stats
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération du vocabulaire (request_id: {request_id}): {e}")
        raise InternalServerException(
            message="Erreur lors de la récupération du vocabulaire",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/sync",
    response_model=VocabularySyncResponse,
    status_code=status.HTTP_200_OK
)
async def sync_vocabulary(
    notion_service: Annotated[NotionImportService, Depends(get_notion_import_service)] = None,
    vocabulary_service: Annotated[VocabularyService, Depends(get_vocabulary_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> VocabularySyncResponse:
    """Synchronise le vocabulaire depuis Notion.
    
    Args:
        notion_service: Service d'import Notion injecté.
        vocabulary_service: Service de vocabulaire injecté.
        request_id: ID de la requête.
    
    Returns:
        Réponse de synchronisation.
    """
    try:
        logger.info(f"Démarrage de la synchronisation du vocabulaire depuis Notion (request_id: {request_id})")
        
        # Synchroniser depuis Notion
        terms = await notion_service.sync_vocabulary()
        
        # Sauvegarder dans le cache
        cache = get_notion_cache()
        cache.set("vocabulary", {"terms": terms})
        
        last_sync = datetime.now().isoformat()
        
        logger.info(
            f"Synchronisation terminée: {len(terms)} termes "
            f"(request_id: {request_id})"
        )
        
        return VocabularySyncResponse(
            success=True,
            terms_count=len(terms),
            last_sync=last_sync,
            error=None
        )
        
    except ValueError as e:
        # Erreur de configuration (pas de clé API)
        logger.warning(f"Configuration Notion manquante (request_id: {request_id}): {e}")
        return VocabularySyncResponse(
            success=False,
            terms_count=0,
            last_sync=None,
            error=f"Configuration Notion manquante: {str(e)}. Configurez NOTION_API_KEY dans les variables d'environnement."
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la synchronisation du vocabulaire (request_id: {request_id}): {e}")
        return VocabularySyncResponse(
            success=False,
            terms_count=0,
            last_sync=None,
            error=str(e)
        )


@router.get(
    "/stats",
    response_model=VocabularyStatsResponse,
    status_code=status.HTTP_200_OK
)
async def get_vocabulary_stats(
    vocabulary_service: Annotated[VocabularyService, Depends(get_vocabulary_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> VocabularyStatsResponse:
    """Récupère les statistiques du vocabulaire.
    
    Args:
        vocabulary_service: Service de vocabulaire injecté.
        request_id: ID de la requête.
    
    Returns:
        Statistiques du vocabulaire (nombre par popularité, catégorie, type).
    """
    try:
        all_terms = vocabulary_service.load_vocabulary()
        stats = vocabulary_service.get_statistics(all_terms)
        
        logger.info(f"Statistiques vocabulaire récupérées (request_id: {request_id})")
        
        return VocabularyStatsResponse(
            total=stats.get("total", 0),
            by_popularité=stats.get("by_popularité", {}),
            by_category=stats.get("by_category", {}),
            by_type=stats.get("by_type", {})
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération des statistiques (request_id: {request_id}): {e}")
        raise InternalServerException(
            message="Erreur lors de la récupération des statistiques du vocabulaire",
            details={"error": str(e)},
            request_id=request_id
        )


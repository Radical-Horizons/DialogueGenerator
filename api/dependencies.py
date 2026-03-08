"""Injection de dépendances pour l'API FastAPI.

Toutes les dépendances utilisent maintenant ServiceContainer depuis app.state.
Les singletons globaux ont été supprimés pour unifier le système d'injection.
"""
import logging
import os
import sys
import json
from pathlib import Path
from typing import Annotated, TypeVar
from fastapi import Depends
from starlette.requests import Request
from core.context.context_builder import ContextBuilder
from core.prompt.prompt_engine import PromptEngine
from core.llm.llm_client import ILLMClient
from services.configuration_service import ConfigurationService
from services.dialogue_generation_service import DialogueGenerationService
from services.linked_selector import LinkedSelectorService
from services.repositories.llm_usage_repository import FileLLMUsageRepository
from services.repositories.cost_budget_repository import FileCostBudgetRepository
from services.llm_usage_service import LLMUsageService
from services.llm_pricing_service import LLMPricingService
from services.cost_governance_service import CostGovernanceService
from factories.llm_factory import LLMClientFactory
from services.vocabulary_service import VocabularyService
from services.narrative_guides_service import NarrativeGuidesService
from services.notion_import_service import NotionImportService
from services.prompt_enricher import PromptEnricher
from services.skill_catalog_service import SkillCatalogService
from services.trait_catalog_service import TraitCatalogService
from services.preset_service import PresetService
from constants import FilePaths, Defaults
from api.config.security_config import get_security_config
from api.exceptions import NotFoundException

logger = logging.getLogger(__name__)

DIALOGUE_GENERATOR_DIR = Path(__file__).resolve().parent.parent


def _get_container(request: Request):
    """Récupère le ServiceContainer depuis app.state.

    Args:
        request: La requête HTTP courante.

    Returns:
        Le ServiceContainer initialisé.

    Raises:
        RuntimeError: Si le container n'a pas été initialisé dans le lifespan.
    """
    container = getattr(request.app.state, "container", None)
    if container is None:
        raise RuntimeError(
            "ServiceContainer not initialized in app.state. "
            "Ensure app.state.container is set in lifespan."
        )
    return container


def get_config_service(request: Request) -> ConfigurationService:
    """Retourne le service de configuration depuis le container."""
    return _get_container(request).get_config_service()


def get_context_builder(request: Request) -> ContextBuilder:
    """Retourne le ContextBuilder (charge les fichiers GDD au premier accès)."""
    return _get_container(request).get_context_builder()


def get_prompt_engine(request: Request) -> PromptEngine:
    """Retourne le PromptEngine depuis le container."""
    return _get_container(request).get_prompt_engine()


def get_dialogue_generation_service(
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    prompt_engine: Annotated[PromptEngine, Depends(get_prompt_engine)]
) -> DialogueGenerationService:
    """Retourne le service de génération de dialogues.
    
    Args:
        context_builder: ContextBuilder injecté.
        prompt_engine: PromptEngine injecté.
        
    Returns:
        Instance de DialogueGenerationService.
    """
    return DialogueGenerationService(
        context_builder=context_builder,
        prompt_engine=prompt_engine
    )


def get_llm_client(
    model_identifier: str,
    request: Request
) -> ILLMClient:
    """Crée un client LLM basé sur l'identifiant du modèle.
    
    Args:
        model_identifier: Identifiant du modèle LLM à utiliser.
        request: La requête HTTP (pour accéder au container).
        
    Returns:
        Instance de ILLMClient (OpenAI ou Dummy).
        
    Raises:
        RuntimeError: Si le ServiceContainer n'est pas initialisé dans app.state.
    """
    config_service = get_config_service(request)
    llm_config = config_service.get_llm_config()
    available_models = config_service.get_available_llm_models()
    
    return LLMClientFactory.create_client(
        model_id=model_identifier,
        config=llm_config,
        available_models=available_models
    )


def get_linked_selector_service(
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)]
) -> LinkedSelectorService:
    """Retourne le service de sélection d'éléments liés.
    
    Args:
        context_builder: ContextBuilder injecté.
        
    Returns:
        Instance de LinkedSelectorService.
    """
    return LinkedSelectorService(context_builder=context_builder)


def get_llm_usage_repository() -> FileLLMUsageRepository:
    """Crée un repository d'utilisation LLM basé sur fichiers.
    
    Returns:
        Instance de FileLLMUsageRepository.
    """
    storage_dir = str(DIALOGUE_GENERATOR_DIR / FilePaths.LLM_USAGE_DIR)
    os.makedirs(storage_dir, exist_ok=True)
    return FileLLMUsageRepository(storage_dir=storage_dir)


def get_cost_budget_repository() -> FileCostBudgetRepository:
    """Crée un repository de budgets LLM basé sur fichier JSON.
    
    Returns:
        Instance de FileCostBudgetRepository.
    """
    storage_file = str(DIALOGUE_GENERATOR_DIR / FilePaths.COST_BUDGETS_FILE)
    return FileCostBudgetRepository(storage_file=storage_file)


def get_cost_governance_service(
    repository: Annotated[FileCostBudgetRepository, Depends(get_cost_budget_repository)]
) -> CostGovernanceService:
    """Retourne le service de cost governance.
    
    Args:
        repository: Repository injecté via dépendance.
        
    Returns:
        Instance de CostGovernanceService.
    """
    return CostGovernanceService(repository=repository)


def create_llm_usage_service() -> LLMUsageService:
    """Crée un service de tracking d'utilisation LLM (sans dépendances FastAPI).
    
    Cette fonction peut être appelée directement sans passer par le système
    de dépendances FastAPI. Pour l'injection de dépendances dans les routes,
    utiliser get_llm_usage_service() avec Depends().
    
    Le service est configuré avec CostGovernanceService pour mettre à jour
    automatiquement le budget après chaque génération.
    
    Returns:
        Instance de LLMUsageService.
    """
    repository = get_llm_usage_repository()
    # Injecter CostGovernanceService pour mise à jour automatique du budget
    cost_repository = get_cost_budget_repository()
    cost_service = CostGovernanceService(repository=cost_repository)
    return LLMUsageService(
        repository=repository,
        cost_governance_service=cost_service
    )


def get_llm_usage_service(
    repository: Annotated[FileLLMUsageRepository, Depends(get_llm_usage_repository)],
    cost_service: Annotated[CostGovernanceService, Depends(get_cost_governance_service)]
) -> LLMUsageService:
    """Retourne le service de tracking d'utilisation LLM.
    
    Args:
        repository: Repository injecté via dépendance.
        cost_service: Service de cost governance injecté.
        
    Returns:
        Instance de LLMUsageService avec cost governance intégré.
    """
    return LLMUsageService(
        repository=repository,
        cost_governance_service=cost_service
    )


def get_request_id(request: Request) -> str:
    """Extrait le request_id de la requête.
    
    Args:
        request: La requête HTTP.
        
    Returns:
        Le request_id ou "unknown" si absent.
    """
    return getattr(request.state, "request_id", "unknown")


def require_debug_access(request: Request) -> None:
    """Bloque les endpoints de debug quand ils ne sont pas explicitement autorisés.

    Args:
        request: La requête HTTP courante.

    Raises:
        NotFoundException: Si les endpoints de debug sont désactivés.
    """
    security_config = get_security_config()
    if security_config.are_debug_endpoints_enabled:
        return

    raise NotFoundException(
        resource_type="Endpoint",
        resource_id=request.url.path,
        request_id=get_request_id(request)
    )


def get_vocabulary_service(request: Request) -> VocabularyService:
    """Retourne le service de vocabulaire depuis le container."""
    return _get_container(request).get_vocabulary_service()


def get_narrative_guides_service(request: Request) -> NarrativeGuidesService:
    """Retourne le service des guides narratifs depuis le container."""
    return _get_container(request).get_narrative_guides_service()


def get_notion_import_service() -> NotionImportService:
    """Retourne le service d'import Notion."""
    return NotionImportService()


def get_skill_catalog_service(request: Request) -> SkillCatalogService:
    """Retourne le service de catalogue des compétences depuis le container."""
    return _get_container(request).get_skill_catalog_service()


def get_trait_catalog_service(request: Request) -> TraitCatalogService:
    """Retourne le service de catalogue des traits depuis le container."""
    return _get_container(request).get_trait_catalog_service()


def get_preset_service(request: Request) -> PresetService:
    """Retourne le service de gestion des presets depuis le container."""
    return _get_container(request).get_preset_service()


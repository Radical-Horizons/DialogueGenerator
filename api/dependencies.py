"""Injection de dépendances pour l'API FastAPI.

Toutes les dépendances utilisent maintenant ServiceContainer depuis app.state.
Les singletons globaux ont été supprimés pour unifier le système d'injection.
"""
import logging
import os
import sys
import json
from pathlib import Path
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from starlette.requests import Request
from api.container import ServiceContainer
from api.config.security_config import get_security_config
from api.services.auth_service import AuthService
from core.context.context_builder import ContextBuilder
from core.prompt.prompt_engine import PromptEngine
from core.llm.llm_client import ILLMClient
from services.configuration_service import ConfigurationService
# InteractionService supprimé - système obsolète
from services.dialogue_generation_service import DialogueGenerationService
from services.linked_selector import LinkedSelectorService
# FileInteractionRepository supprimé - système obsolète
from services.repositories.llm_usage_repository import FileLLMUsageRepository
from services.repositories.cost_budget_repository import FileCostBudgetRepository
from services.llm_usage_service import LLMUsageService
from services.export_log_service import ExportLogService
from services.llm_pricing_service import LLMPricingService
from services.token_estimation_service import TokenEstimationService
from services.cost_governance_service import CostGovernanceService
from factories.llm_factory import LLMClientFactory
from services.vocabulary_service import VocabularyService
from services.narrative_guides_service import NarrativeGuidesService
from services.notion_import_service import NotionImportService
from services.context_rule_service import ContextRuleService
from services.context_dropping_rules_service import ContextDroppingRulesService
from services.prompt_enricher import PromptEnricher
from services.skill_catalog_service import SkillCatalogService
from services.trait_catalog_service import TraitCatalogService
from services.preset_service import PresetService
from services.repositories.sqlite import (
    AppSettingsRepository,
    DatabaseConnection,
    DialoguesIndexRepository,
    UserRepository,
)
from services.document_persistence_service import DocumentPersistenceService
from constants import FilePaths, Defaults

logger = logging.getLogger(__name__)

# Chemins par défaut
DIALOGUE_GENERATOR_DIR = Path(__file__).resolve().parent.parent
# DEFAULT_INTERACTIONS_STORAGE_DIR supprimé - système obsolète

# Les singletons globaux ont été supprimés.
# Tous les services sont maintenant gérés par ServiceContainer dans app.state.


def get_config_service(request: Request) -> ConfigurationService:
    """Retourne le service de configuration.
    
    Utilise le ServiceContainer depuis app.state (système unifié).
    
    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).
        
    Returns:
        Instance de ConfigurationService.
        
    Raises:
        RuntimeError: Si le ServiceContainer n'est pas initialisé dans app.state.
    """
    container = get_service_container(request)
    return container.get_config_service()


def get_database_connection(request: Request) -> DatabaseConnection:
    """Retourne la connexion SQLite partagée du container."""
    return get_service_container(request).get_database_connection()


def get_user_repository(request: Request) -> UserRepository:
    """Retourne le repository utilisateur partagé du container."""
    return get_service_container(request).get_user_repository()


def get_app_settings_repository(request: Request) -> AppSettingsRepository:
    """Retourne le repository des réglages applicatifs du container."""
    return get_service_container(request).get_app_settings_repository()


def get_dialogues_index_repository(request: Request) -> DialoguesIndexRepository:
    """Retourne le repository d'index des dialogues du container."""
    return get_service_container(request).get_dialogues_index_repository()


def get_document_persistence_service(request: Request) -> DocumentPersistenceService:
    """Retourne l'autorité de persistance et d'accès des dialogues."""
    return get_service_container(request).get_document_persistence_service()


def get_auth_service(request: Request) -> AuthService:
    """Retourne le service d'authentification du container."""
    return get_service_container(request).get_auth_service()


def require_admin(
    current_user: Optional[dict[str, object]] = None,
) -> dict[str, object]:
    """Vérifie que l'utilisateur courant possède le rôle administrateur.

    Args:
        current_user: Utilisateur résolu par la dépendance d'authentification.

    Returns:
        L'utilisateur administrateur validé.

    Raises:
        HTTPException: Si aucun utilisateur administrateur n'est disponible.
    """
    if current_user is None:
        security_config = get_security_config()
        if security_config.is_development and security_config.disable_auth:
            return {
                "username": "admin",
                "role": "admin",
                "is_active": True,
            }
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    if current_user.get("role") == "admin" and current_user.get("is_active") is True:
        return current_user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Admin role required",
    )


# _get_context_builder_singleton() supprimé - utilisez ServiceContainer via get_context_builder()


def get_context_builder(request: Request) -> ContextBuilder:
    """Retourne le ContextBuilder.
    
    Utilise le ServiceContainer depuis app.state (système unifié).
    
    Le ContextBuilder charge les fichiers GDD au premier accès.
    Les chemins GDD peuvent être configurés via les variables d'environnement :
    - GDD_CATEGORIES_PATH : Chemin vers le répertoire des catégories GDD
    - GDD_IMPORT_PATH : Chemin vers le répertoire contenant Vision.json (ou directement le fichier Vision.json)
    
    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).
        
    Returns:
        Instance de ContextBuilder avec données GDD chargées.
        
    Raises:
        RuntimeError: Si le ServiceContainer n'est pas initialisé dans app.state.
    """
    container = get_service_container(request)
    return container.get_context_builder()


def get_prompt_engine(request: Request) -> PromptEngine:
    """Retourne le PromptEngine.
    
    Utilise le ServiceContainer depuis app.state (système unifié).
    
    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).
        
    Returns:
        Instance de PromptEngine.
        
    Raises:
        RuntimeError: Si le ServiceContainer n'est pas initialisé dans app.state.
    """
    container = get_service_container(request)
    return container.get_prompt_engine()


# get_interaction_repository supprimé - système obsolète
# get_interaction_service supprimé - système obsolète

# reset_singletons() supprimé - le ServiceContainer gère déjà le reset via container.reset()


def get_dialogue_generation_service(
    request: Request
) -> DialogueGenerationService:
    """Retourne le service de génération de dialogues.
    
    Args:
        request: La requête HTTP (injecté par FastAPI).
        
    Returns:
        Instance de DialogueGenerationService.
    """
    container = get_service_container(request)
    return container.get_dialogue_generation_service()


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


def get_linked_selector_service(request: Request) -> LinkedSelectorService:
    """Retourne le service de sélection d'éléments liés.
    
    Utilise le ServiceContainer depuis app.state (système unifié).
    
    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).
        
    Returns:
        Instance de LinkedSelectorService.
    """
    container = get_service_container(request)
    return container.get_linked_selector_service()


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
    """Délègue à ``api.llm_usage_factory`` (évite cycle container ↔ dependencies)."""
    from api.llm_usage_factory import create_llm_usage_service as _factory_create

    return _factory_create()


def get_llm_usage_service(request: Request) -> LLMUsageService:
    """Retourne le service de tracking d'utilisation LLM (singleton du ``ServiceContainer``)."""
    return get_service_container(request).get_llm_usage_service()


def get_export_log_service(request: Request) -> ExportLogService:
    """Retourne le service de journalisation export Unity."""
    return get_service_container(request).get_export_log_service()


def get_request_id(request: Request) -> str:
    """Extrait le request_id de la requête.
    
    Args:
        request: La requête HTTP.
        
    Returns:
        Le request_id ou "unknown" si absent.
    """
    return getattr(request.state, "request_id", "unknown")


def get_service_container(request: Request) -> ServiceContainer:
    """Retourne le ServiceContainer depuis l'état de l'application.

    Centralise l'accès au container pour éviter les accès directs à
    ``request.app.state.container`` dans les dépendances métier.

    Args:
        request: La requête HTTP.

    Returns:
        Instance de ServiceContainer stockée dans app.state.container.

    Raises:
        RuntimeError: Si le ServiceContainer n'est pas initialisé.
    """
    container = getattr(request.app.state, "container", None)
    if container is None:
        raise RuntimeError(
            "ServiceContainer not initialized in app.state. Ensure app.state.container is set in lifespan."
        )
    return container


def get_unity_dialogue_orchestrator(
    request: Request,
    request_id: Annotated[str, Depends(get_request_id)]
) -> "UnityDialogueOrchestrator":
    """Retourne l'orchestrateur Unity Dialogue via le container.

    Le ``request_id`` de la requête est injecté pour homogénéiser les
    métadonnées de logs et faciliter les tests.

    Args:
        request: La requête HTTP.
        request_id: Identifiant de la requête.

    Returns:
        Instance de UnityDialogueOrchestrator.
    """
    container = get_service_container(request)
    return container.get_unity_dialogue_orchestrator(request_id=request_id)


def get_graph_node_orchestrator(request: Request) -> "GraphNodeOrchestrator":
    """Retourne l'orchestrateur de nœuds de graphe via le container.

    Args:
        request: La requête HTTP.

    Returns:
        Instance de GraphNodeOrchestrator avec dépendances injectées.
    """
    container = get_service_container(request)
    return container.get_graph_node_orchestrator()


def get_dialogue_tree_expansion_service(request: Request) -> "DialogueTreeExpansionService":
    """Retourne le service d'expansion BFS de dialogues complets."""
    container = get_service_container(request)
    return container.get_dialogue_tree_expansion_service()


def get_llm_quality_judge_service() -> "LLMQualityJudgeService":
    """Retourne le service juge qualité dialogue (stateless, FR42)."""
    from services.llm_quality_judge_service import LLMQualityJudgeService

    return LLMQualityJudgeService()


def get_token_estimation_service(request: Request) -> TokenEstimationService:
    """Retourne le service d'estimation de tokens (prompt + completion sans appel LLM).

    Args:
        request: La requête HTTP (non utilisé, pour cohérence Depends).

    Returns:
        Instance de TokenEstimationService.
    """
    return TokenEstimationService()


def get_llm_pricing_service(request: Request) -> LLMPricingService:
    """Retourne le service de calcul des prix LLM (config llm_pricing.json).

    Args:
        request: La requête HTTP (non utilisé, pour cohérence Depends).

    Returns:
        Instance de LLMPricingService.
    """
    return LLMPricingService()


# Variables globales _vocab_service et _guides_service supprimées - utilisez ServiceContainer


def get_vocabulary_service(request: Request) -> VocabularyService:
    """Retourne le service de vocabulaire.
    
    Utilise le ServiceContainer depuis app.state (système unifié).
    
    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).
        
    Returns:
        Instance de VocabularyService.
        
    Raises:
        RuntimeError: Si le ServiceContainer n'est pas initialisé dans app.state.
    """
    container = get_service_container(request)
    return container.get_vocabulary_service()


def get_narrative_guides_service(request: Request) -> NarrativeGuidesService:
    """Retourne le service des guides narratifs.
    
    Utilise le ServiceContainer depuis app.state (système unifié).
    
    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).
        
    Returns:
        Instance de NarrativeGuidesService.
        
    Raises:
        RuntimeError: Si le ServiceContainer n'est pas initialisé dans app.state.
    """
    container = get_service_container(request)
    return container.get_narrative_guides_service()


def get_notion_import_service(request: Request) -> NotionImportService:
    """Retourne le service d'import Notion.
    
    Utilise le ServiceContainer depuis app.state (système unifié).
    
    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).
        
    Returns:
        Instance de NotionImportService.
    """
    container = get_service_container(request)
    return container.get_notion_import_service()


def get_cd_rules_service(request: Request) -> ContextDroppingRulesService:
    """Retourne le service de règles anti-context-dropping (Story 4.10).

    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).

    Returns:
        Instance partagée de ContextDroppingRulesService depuis le ServiceContainer.
    """
    container = get_service_container(request)
    return container.get_cd_rules_service()


def get_context_rule_service(request: Request) -> ContextRuleService:
    """Retourne le service de règles de sélection de contexte GDD.

    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).

    Returns:
        Instance de ContextRuleService.
    """
    container = get_service_container(request)
    return container.get_context_rule_service()


def get_skill_catalog_service(request: Request) -> SkillCatalogService:
    """Retourne le service de catalogue des compétences.
    
    Utilise le ServiceContainer depuis app.state (système unifié).
    
    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).
        
    Returns:
        Instance de SkillCatalogService.
        
    Raises:
        RuntimeError: Si le ServiceContainer n'est pas initialisé dans app.state.
    """
    container = get_service_container(request)
    return container.get_skill_catalog_service()


def get_trait_catalog_service(request: Request) -> TraitCatalogService:
    """Retourne le service de catalogue des traits.
    
    Utilise le ServiceContainer depuis app.state (système unifié).
    
    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).
        
    Returns:
        Instance de TraitCatalogService.
        
    Raises:
        RuntimeError: Si le ServiceContainer n'est pas initialisé dans app.state.
    """
    container = get_service_container(request)
    return container.get_trait_catalog_service()


def get_preset_service(request: Request) -> PresetService:
    """Retourne le service de gestion des presets.
    
    Utilise le ServiceContainer depuis app.state (système unifié).
    
    Args:
        request: La requête HTTP (injecté automatiquement par FastAPI).
        
    Returns:
        Instance de PresetService.
        
    Raises:
        RuntimeError: Si le ServiceContainer n'est pas initialisé dans app.state.
    """
    container = get_service_container(request)
    return container.get_preset_service()


def get_gdd_notion_sync_service(request: Request):
    """Retourne le service de synchronisation GDD Notion (FR18).

    Args:
        request: Requête HTTP courante.

    Returns:
        Instance de GddNotionSyncService depuis le ServiceContainer.
    """
    from services.gdd_notion_sync_service import GddNotionSyncService

    container = get_service_container(request)
    svc: GddNotionSyncService = container.get_gdd_notion_sync_service()
    return svc


def get_dialogue_flags_service():
    """Fabrique un service validation des liaisons flags ↔ document (Story 9.1).

    Returns:
        Instance ``DialogueFlagsService`` avec catalogue CSV injecté.
    """
    from services.dialogue_flags_service import DialogueFlagsService
    from services.flag_catalog_service import FlagCatalogService

    return DialogueFlagsService(FlagCatalogService())


def get_visibility_condition_validation_service():
    """Fabrique la validation Story 9.2 (visibilityConditions vs catalogue).

    Returns:
        Instance ``VisibilityConditionValidationService`` avec catalogue CSV injecté.
    """
    from services.flag_catalog_service import FlagCatalogService
    from services.visibility_condition_validation import VisibilityConditionValidationService

    return VisibilityConditionValidationService(FlagCatalogService())


def get_choice_effect_validation_service():
    """Fabrique la validation Story 9.3 (choiceEffects vs catalogue)."""
    from services.choice_effect_validation import ChoiceEffectValidationService
    from services.flag_catalog_service import FlagCatalogService

    return ChoiceEffectValidationService(FlagCatalogService())


def get_dialogue_flag_reference_validation_service():
    """Fabrique la validation Story 9.5 (références flags vs dialogueFlags)."""
    from services.dialogue_flag_reference_validation_service import (
        DialogueFlagReferenceValidationService,
    )
    from services.flag_catalog_service import FlagCatalogService

    return DialogueFlagReferenceValidationService(FlagCatalogService())


def get_dialogue_preview_service(request: Request):
    """Retourne DialoguePreviewService (Story 9.4, preview état masque visibilité)."""
    from services.dialogue_preview_service import DialoguePreviewService

    container = get_service_container(request)
    svc: DialoguePreviewService = container.get_dialogue_preview_service()
    return svc


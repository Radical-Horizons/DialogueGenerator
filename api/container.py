"""Container de services pour l'application FastAPI.

Ce container stocke toutes les instances de services dans app.state,
permettant une meilleure gestion du cycle de vie et facilitant les tests.
"""
import logging
import os
import threading
from pathlib import Path
from typing import Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from services.dialogue_preview_service import DialoguePreviewService
    from services.gdd_notion_sync_service import GddNotionSyncService
from core.context.context_builder import ContextBuilder
from core.prompt.prompt_engine import PromptEngine
from services.configuration_service import ConfigurationService
from services.vocabulary_service import VocabularyService
from services.narrative_guides_service import NarrativeGuidesService
from services.prompt_enricher import PromptEnricher
from services.prompt_builder import PromptBuilder
from services.skill_catalog_service import SkillCatalogService
from services.trait_catalog_service import TraitCatalogService
from services.preset_service import PresetService
from services.template_service import TemplateService
from services.template_marketplace_service import TemplateMarketplaceService
from services.template_ab_testing_service import TemplateABTestingService
from api.services.template_ab_test_job_manager import TemplateABTestJobManager
from services.dialogue_generation_service import DialogueGenerationService
from services.llm_usage_service import LLMUsageService
from services.export_log_service import ExportLogService
from services.unity_dialogue_generation_service import UnityDialogueGenerationService
from services.linked_selector import LinkedSelectorService
from services.notion_import_service import NotionImportService
from services.context_rule_service import ContextRuleService
from services.context_dropping_rules_service import ContextDroppingRulesService
from services.repositories.sqlite.bootstrap import resolve_database_path
from services.repositories.sqlite import (
    AppSettingsRepository,
    AuditLogsRepository,
    CollectionsRepository,
    DatabaseConnection,
    DialogueSharesRepository,
    DialoguesIndexRepository,
    DialoguesSearchRepository,
    SharedTemplatesRepository,
    TemplateSharesRepository,
    UserRepository,
    UserSettingsRepository,
)
from services.repositories.sqlite.template_suggestion_usage_repository import (
    TemplateSuggestionUsageRepository,
)
from services.audit_log_service import AuditLogService
from services.collection_service import CollectionService
from services.dialogue_index_service import DialogueIndexService
from services.dialogue_metadata_service import DialogueMetadataService
from services.batch_validation_service import BatchValidationService
from services.document_persistence_service import DocumentPersistenceService
from services.dialogue_sharing_service import DialogueSharingService
from services.template_sharing_service import TemplateSharingService
from services.template_suggestion_service import TemplateSuggestionService
from api.services.auth_service import AuthService
from api.services.batch_validation_job_manager import BatchValidationJobManager
from api.services.batch_node_generation_job_manager import BatchNodeGenerationJobManager
from services.batch_node_generation_service import BatchNodeGenerationService

logger = logging.getLogger(__name__)


class ServiceContainer:
    """Container pour tous les services de l'application.
    
    Cette classe centralise la création et le stockage des services,
    remplaçant les singletons globaux par une instance unique dans app.state.
    """
    
    def __init__(
        self,
        database_connection: Optional[DatabaseConnection] = None,
        database_initialization_failed: bool = False,
    ):
        """Initialise le container avec tous les services None (lazy loading).
        
        Les services sont créés à la demande lors du premier accès via les méthodes
        get_* correspondantes. Cette approche de lazy loading permet :
        - D'éviter la création de services non utilisés
        - De réduire le temps de démarrage de l'application
        - De faciliter les tests en permettant l'injection de mocks
        
        Tous les services sont initialisés à None et seront créés au premier appel
        à leur méthode get_* respective.
        """
        self._config_service: Optional[ConfigurationService] = None
        self._context_builder: Optional[ContextBuilder] = None
        self._vocab_service: Optional[VocabularyService] = None
        self._guides_service: Optional[NarrativeGuidesService] = None
        self._prompt_engine: Optional[PromptEngine] = None
        self._skill_catalog_service: Optional[SkillCatalogService] = None
        self._trait_catalog_service: Optional[TraitCatalogService] = None
        self._preset_service: Optional[PresetService] = None
        self._template_service: Optional[TemplateService] = None
        self._template_marketplace_service: Optional[TemplateMarketplaceService] = None
        self._template_ab_testing_service: Optional[TemplateABTestingService] = None
        self._template_ab_test_job_manager: Optional[TemplateABTestJobManager] = None
        self._shared_templates_repository: Optional[SharedTemplatesRepository] = None
        self._dialogue_generation_service: Optional[DialogueGenerationService] = None
        self._llm_usage_service: Optional[LLMUsageService] = None
        self._export_log_service: Optional[ExportLogService] = None
        self._unity_generation_service: Optional[UnityDialogueGenerationService] = None
        self._graph_node_orchestrator: Optional["GraphNodeOrchestrator"] = None
        self._dialogue_tree_expansion_service: Optional["DialogueTreeExpansionService"] = None
        self._linked_selector_service: Optional[LinkedSelectorService] = None
        self._notion_import_service: Optional[NotionImportService] = None
        self._context_rule_service: Optional[ContextRuleService] = None
        self._cd_rules_service: Optional[ContextDroppingRulesService] = None
        self._gdd_notion_sync_service: Optional["GddNotionSyncService"] = None
        self._dialogue_preview_service: Optional["DialoguePreviewService"] = None
        self._global_relation_index: Optional[Dict[str, str]] = None
        self._database_connection: Optional[DatabaseConnection] = database_connection
        self._user_repository: Optional[UserRepository] = None
        self._user_settings_repository: Optional[UserSettingsRepository] = None
        self._app_settings_repository: Optional[AppSettingsRepository] = None
        self._dialogues_index_repository: Optional[DialoguesIndexRepository] = None
        self._dialogue_shares_repository: Optional[DialogueSharesRepository] = None
        self._template_shares_repository: Optional[TemplateSharesRepository] = None
        self._collections_repository: Optional[CollectionsRepository] = None
        self._collection_service: Optional[CollectionService] = None
        self._dialogues_search_repository: Optional[DialoguesSearchRepository] = None
        self._dialogue_index_service: Optional[DialogueIndexService] = None
        self._dialogue_metadata_service: Optional[DialogueMetadataService] = None
        self._batch_validation_service: Optional[BatchValidationService] = None
        self._batch_validation_job_manager: Optional[BatchValidationJobManager] = None
        self._batch_node_generation_service: Optional[BatchNodeGenerationService] = None
        self._batch_node_generation_job_manager: Optional[
            BatchNodeGenerationJobManager
        ] = None
        self._audit_logs_repository: Optional[AuditLogsRepository] = None
        self._audit_log_service: Optional[AuditLogService] = None
        self._document_persistence_service: Optional[DocumentPersistenceService] = None
        self._dialogue_sharing_service: Optional[DialogueSharingService] = None
        self._template_sharing_service: Optional[TemplateSharingService] = None
        self._template_suggestion_usage_repository: Optional[
            TemplateSuggestionUsageRepository
        ] = None
        self._template_suggestion_service: Optional[TemplateSuggestionService] = None
        self._auth_service: Optional[AuthService] = None
        self._database_initialization_failed = database_initialization_failed
        self._database_lock = threading.RLock()
        logger.debug("ServiceContainer initialisé (services à charger au premier accès)")

    def get_database_connection(self) -> DatabaseConnection:
        """Retourne la connexion SQLite partagée du processus."""
        with self._database_lock:
            if self._database_connection is None:
                if self._database_initialization_failed:
                    raise RuntimeError(
                        "La base SQLite est indisponible après un échec d'initialisation."
                    )
                self._database_connection = DatabaseConnection(resolve_database_path())
                logger.info(
                    "DatabaseConnection initialisée dans le container: %s",
                    self._database_connection.database_path,
                )
            return self._database_connection

    def get_user_repository(self) -> UserRepository:
        """Retourne le repository utilisateur partagé du processus."""
        with self._database_lock:
            if self._user_repository is None:
                self._user_repository = UserRepository(self.get_database_connection())
                logger.info("UserRepository initialisé dans le container.")
            return self._user_repository

    def get_user_settings_repository(self) -> UserSettingsRepository:
        """Retourne le repository des préférences utilisateur partagé."""
        with self._database_lock:
            if self._user_settings_repository is None:
                self._user_settings_repository = UserSettingsRepository(
                    self.get_database_connection()
                )
                logger.info("UserSettingsRepository initialisé dans le container.")
            return self._user_settings_repository

    def get_app_settings_repository(self) -> AppSettingsRepository:
        """Retourne le repository des réglages applicatifs partagé."""
        with self._database_lock:
            if self._app_settings_repository is None:
                self._app_settings_repository = AppSettingsRepository(
                    self.get_database_connection()
                )
                logger.info("AppSettingsRepository initialisé dans le container.")
            return self._app_settings_repository

    def get_dialogues_index_repository(self) -> DialoguesIndexRepository:
        """Retourne le repository d'index des dialogues partagé."""
        with self._database_lock:
            if self._dialogues_index_repository is None:
                self._dialogues_index_repository = DialoguesIndexRepository(
                    self.get_database_connection()
                )
                logger.info("DialoguesIndexRepository initialisé dans le container.")
            return self._dialogues_index_repository

    def get_dialogue_shares_repository(self) -> DialogueSharesRepository:
        """Retourne le repository des partages co-édition."""
        with self._database_lock:
            if self._dialogue_shares_repository is None:
                self._dialogue_shares_repository = DialogueSharesRepository(
                    self.get_database_connection()
                )
                logger.info("DialogueSharesRepository initialisé dans le container.")
            return self._dialogue_shares_repository

    def get_template_shares_repository(self) -> TemplateSharesRepository:
        """Retourne le repository des partages d'équipe de templates."""
        with self._database_lock:
            if self._template_shares_repository is None:
                self._template_shares_repository = TemplateSharesRepository(
                    self.get_database_connection()
                )
                logger.info("TemplateSharesRepository initialisé dans le container.")
            return self._template_shares_repository

    def get_shared_templates_repository(self) -> SharedTemplatesRepository:
        """Retourne le repository du marketplace de templates."""
        with self._database_lock:
            if self._shared_templates_repository is None:
                self._shared_templates_repository = SharedTemplatesRepository(
                    self.get_database_connection()
                )
                logger.info("SharedTemplatesRepository initialisé dans le container.")
            return self._shared_templates_repository

    def get_template_marketplace_service(self) -> TemplateMarketplaceService:
        """Retourne le service marketplace de templates."""
        with self._database_lock:
            if self._template_marketplace_service is None:
                self._template_marketplace_service = TemplateMarketplaceService(
                    repository=self.get_shared_templates_repository(),
                    template_service=self.get_template_service(),
                )
                logger.info("TemplateMarketplaceService initialisé dans le container.")
            return self._template_marketplace_service

    def get_template_ab_testing_service(self) -> TemplateABTestingService:
        """Retourne le service A/B testing de templates."""
        with self._database_lock:
            if self._template_ab_testing_service is None:
                self._template_ab_testing_service = TemplateABTestingService(
                    template_service=self.get_template_service(),
                    marketplace_service=self.get_template_marketplace_service(),
                )
                logger.info("TemplateABTestingService initialisé dans le container.")
            return self._template_ab_testing_service

    def get_template_ab_test_job_manager(self) -> TemplateABTestJobManager:
        """Retourne le gestionnaire de jobs A/B templates."""
        with self._database_lock:
            if self._template_ab_test_job_manager is None:
                self._template_ab_test_job_manager = TemplateABTestJobManager()
                logger.info("TemplateABTestJobManager initialisé dans le container.")
            return self._template_ab_test_job_manager

    def get_collections_repository(self) -> CollectionsRepository:
        """Retourne le repository des collections de dialogues."""
        with self._database_lock:
            if self._collections_repository is None:
                self._collections_repository = CollectionsRepository(
                    self.get_database_connection()
                )
                logger.info("CollectionsRepository initialisé dans le container.")
            return self._collections_repository

    def get_collection_service(self) -> CollectionService:
        """Retourne le service métier des collections de dialogues."""
        with self._database_lock:
            if self._collection_service is None:
                self._collection_service = CollectionService(
                    collections_repository=self.get_collections_repository(),
                    dialogues_index_repository=self.get_dialogues_index_repository(),
                )
                logger.info("CollectionService initialisé dans le container.")
            return self._collection_service

    def get_dialogues_search_repository(self) -> DialoguesSearchRepository:
        """Retourne le repository FTS5 de recherche dialogues."""
        with self._database_lock:
            if self._dialogues_search_repository is None:
                self._dialogues_search_repository = DialoguesSearchRepository(
                    self.get_database_connection()
                )
                logger.info("DialoguesSearchRepository initialisé dans le container.")
            return self._dialogues_search_repository

    def get_dialogue_index_service(self) -> DialogueIndexService:
        """Retourne le service d'indexation / recherche FTS."""
        with self._database_lock:
            if self._dialogue_index_service is None:
                self._dialogue_index_service = DialogueIndexService(
                    self.get_dialogues_search_repository()
                )
                logger.info("DialogueIndexService initialisé dans le container.")
            return self._dialogue_index_service

    def get_dialogue_metadata_service(self) -> DialogueMetadataService:
        """Retourne le service d'agrégation des métadonnées dialogue."""
        with self._database_lock:
            if self._dialogue_metadata_service is None:
                self._dialogue_metadata_service = DialogueMetadataService(
                    dialogues_index_repository=self.get_dialogues_index_repository(),
                    user_repository=self.get_user_repository(),
                    llm_usage_service=self.get_llm_usage_service(),
                    config_service=self.get_config_service(),
                )
                logger.info("DialogueMetadataService initialisé dans le container.")
            return self._dialogue_metadata_service

    def get_batch_validation_service(self) -> BatchValidationService:
        """Retourne le service de validation batch FR87."""
        with self._database_lock:
            if self._batch_validation_service is None:
                self._batch_validation_service = BatchValidationService(
                    config_service=self.get_config_service(),
                )
                logger.info("BatchValidationService initialisé dans le container.")
            return self._batch_validation_service

    def get_batch_validation_job_manager(self) -> BatchValidationJobManager:
        """Retourne le gestionnaire de jobs de validation batch."""
        with self._database_lock:
            if self._batch_validation_job_manager is None:
                self._batch_validation_job_manager = BatchValidationJobManager()
                logger.info("BatchValidationJobManager initialisé dans le container.")
            return self._batch_validation_job_manager

    def get_batch_node_generation_service(self) -> BatchNodeGenerationService:
        """Retourne le service de génération batch multi-parents FR88."""
        with self._database_lock:
            if self._batch_node_generation_service is None:
                self._batch_node_generation_service = BatchNodeGenerationService(
                    orchestrator=self.get_graph_node_orchestrator(),
                )
                logger.info("BatchNodeGenerationService initialisé dans le container.")
            return self._batch_node_generation_service

    def get_batch_node_generation_job_manager(self) -> BatchNodeGenerationJobManager:
        """Retourne le gestionnaire de jobs de génération batch FR88."""
        with self._database_lock:
            if self._batch_node_generation_job_manager is None:
                self._batch_node_generation_job_manager = BatchNodeGenerationJobManager()
                logger.info(
                    "BatchNodeGenerationJobManager initialisé dans le container."
                )
            return self._batch_node_generation_job_manager

    def get_audit_logs_repository(self) -> AuditLogsRepository:
        """Retourne le repository append-only des journaux d'audit."""
        with self._database_lock:
            if self._audit_logs_repository is None:
                self._audit_logs_repository = AuditLogsRepository(
                    self.get_database_connection()
                )
                logger.info("AuditLogsRepository initialisé dans le container.")
            return self._audit_logs_repository

    def get_audit_log_service(self) -> AuditLogService:
        """Retourne le service d'audit des mutations sensibles."""
        with self._database_lock:
            if self._audit_log_service is None:
                self._audit_log_service = AuditLogService(
                    self.get_audit_logs_repository()
                )
                logger.info("AuditLogService initialisé dans le container.")
            return self._audit_log_service

    def get_document_persistence_service(self) -> DocumentPersistenceService:
        """Retourne l'autorité injectée de persistance et d'accès dialogue."""
        with self._database_lock:
            if self._document_persistence_service is None:
                self._document_persistence_service = DocumentPersistenceService(
                    self.get_dialogues_index_repository(),
                    self.get_dialogue_shares_repository(),
                    audit_log_service=self.get_audit_log_service(),
                    dialogue_index_service=self.get_dialogue_index_service(),
                )
                logger.info("DocumentPersistenceService initialisé dans le container.")
            return self._document_persistence_service

    def get_dialogue_sharing_service(self) -> DialogueSharingService:
        """Retourne le service de partage co-édition entre writers."""
        with self._database_lock:
            if self._dialogue_sharing_service is None:
                self._dialogue_sharing_service = DialogueSharingService(
                    shares_repository=self.get_dialogue_shares_repository(),
                    dialogues_index_repository=self.get_dialogues_index_repository(),
                    user_repository=self.get_user_repository(),
                    persistence_service=self.get_document_persistence_service(),
                    audit_log_service=self.get_audit_log_service(),
                )
                logger.info("DialogueSharingService initialisé dans le container.")
            return self._dialogue_sharing_service

    def get_template_sharing_service(self) -> TemplateSharingService:
        """Retourne le service de partage d'équipe des templates custom."""
        with self._database_lock:
            if self._template_sharing_service is None:
                self._template_sharing_service = TemplateSharingService(
                    shares_repository=self.get_template_shares_repository(),
                    user_repository=self.get_user_repository(),
                )
                logger.info("TemplateSharingService initialisé dans le container.")
            return self._template_sharing_service

    def get_template_suggestion_usage_repository(
        self,
    ) -> TemplateSuggestionUsageRepository:
        """Retourne le repository des compteurs d'usage suggestions."""
        with self._database_lock:
            if self._template_suggestion_usage_repository is None:
                self._template_suggestion_usage_repository = (
                    TemplateSuggestionUsageRepository(self.get_database_connection())
                )
                logger.info(
                    "TemplateSuggestionUsageRepository initialisé dans le container."
                )
            return self._template_suggestion_usage_repository

    def get_template_suggestion_service(self) -> TemplateSuggestionService:
        """Retourne le service de suggestions de templates."""
        with self._database_lock:
            if self._template_suggestion_service is None:
                self._template_suggestion_service = TemplateSuggestionService(
                    usage_repository=self.get_template_suggestion_usage_repository(),
                    sharing_service=self.get_template_sharing_service(),
                    marketplace_service=self.get_template_marketplace_service(),
                )
                logger.info("TemplateSuggestionService initialisé dans le container.")
            return self._template_suggestion_service

    def get_auth_service(self) -> AuthService:
        """Retourne le service d'authentification avec son repository injecté."""
        with self._database_lock:
            if self._auth_service is None:
                self._auth_service = AuthService(
                    self.get_user_repository(),
                    audit_log_service=self.get_audit_log_service(),
                )
                logger.info("AuthService initialisé dans le container.")
            return self._auth_service
    
    def get_config_service(self) -> ConfigurationService:
        """Retourne le service de configuration.
        
        Returns:
            Instance de ConfigurationService.
        """
        if self._config_service is None:
            self._config_service = ConfigurationService()
            logger.info("ConfigurationService initialisé dans le container.")
        return self._config_service
    
    def get_context_builder(self) -> ContextBuilder:
        """Retourne le ContextBuilder.
        
        Le ContextBuilder charge les fichiers GDD au premier accès.
        Les chemins GDD peuvent être configurés via les variables d'environnement :
        - GDD_CATEGORIES_PATH : Chemin vers le répertoire des catégories GDD
        - GDD_IMPORT_PATH : Chemin vers le répertoire contenant Vision.json (ou directement le fichier Vision.json)
        
        Returns:
            Instance de ContextBuilder avec données GDD chargées.
        """
        if self._context_builder is None:
            from services.context_builder_factory import ContextBuilderFactory
            from core.context.context_builder import CONTEXT_BUILDER_DIR, PROJECT_ROOT_DIR
            
            self._context_builder = ContextBuilderFactory.create(
                context_builder_dir=CONTEXT_BUILDER_DIR,
                project_root_dir=PROJECT_ROOT_DIR
            )
            logger.info("Chargement des fichiers GDD...")
            self._context_builder.load_gdd_files()
            logger.info("ContextBuilder initialisé dans le container avec données GDD chargées.")
            self._inject_relation_index_into_context_builder()
        return self._context_builder
    
    def get_global_relation_index(self) -> Dict[str, str]:
        """Construit et met en cache l'index cross-catégorie UUID → Nom.

        Scanne ``data/GDD_categories/`` une seule fois ; le cache est invalidé après
        chaque sync Notion réussie via ``invalidate_global_relation_index()``.

        Returns:
            Dictionnaire ``{uuid_normalisé: Nom}`` pour tous les shards GDD sur disque.
        """
        if self._global_relation_index is None:
            from services.gdd_relation_resolver import build_global_relation_index
            gdd_dir = self._resolve_gdd_categories_path()
            self._global_relation_index = build_global_relation_index(gdd_dir)
            logger.info(
                "GlobalRelationIndex construit : %d entrées.",
                len(self._global_relation_index),
            )
        return self._global_relation_index

    def invalidate_global_relation_index(self) -> None:
        """Invalide le cache de l'index global (à appeler après une sync Notion réussie)."""
        self._global_relation_index = None

    def _inject_relation_index_into_context_builder(self) -> None:
        """Injecte l'index relation dans le ContextConstructionService du ContextBuilder."""
        if self._context_builder is None:
            return
        ccs = getattr(self._context_builder, "_context_construction_service", None)
        if ccs is not None:
            ccs._relation_index = self.get_global_relation_index()

    def get_vocabulary_service(self) -> VocabularyService:
        """Retourne le service de vocabulaire.
        
        Returns:
            Instance de VocabularyService.
        """
        if self._vocab_service is None:
            self._vocab_service = VocabularyService()
            logger.info("VocabularyService initialisé dans le container.")
        return self._vocab_service
    
    def get_narrative_guides_service(self) -> NarrativeGuidesService:
        """Retourne le service des guides narratifs.
        
        Returns:
            Instance de NarrativeGuidesService.
        """
        if self._guides_service is None:
            self._guides_service = NarrativeGuidesService()
            logger.info("NarrativeGuidesService initialisé dans le container.")
        return self._guides_service
    
    def get_prompt_engine(self) -> PromptEngine:
        """Retourne le PromptEngine.
        
        Returns:
            Instance de PromptEngine.
        """
        if self._prompt_engine is None:
            # Injecter ContextBuilder et services pour éviter les instanciations redondantes
            context_builder = self.get_context_builder()
            vocab_service = self.get_vocabulary_service()
            guides_service = self.get_narrative_guides_service()
            
            # Créer PromptEnricher avec les services injectés
            enricher = PromptEnricher(
                vocab_service=vocab_service,
                guides_service=guides_service
            )
            
            # Créer PromptBuilder avec les dépendances
            prompt_builder = PromptBuilder(
                context_builder=context_builder,
                enricher=enricher
            )
            
            self._prompt_engine = PromptEngine(
                context_builder=context_builder,
                vocab_service=vocab_service,
                guides_service=guides_service,
                enricher=enricher,
                prompt_builder=prompt_builder
            )
            logger.info("PromptEngine initialisé dans le container avec toutes les dépendances injectées.")
        return self._prompt_engine
    
    def get_skill_catalog_service(self) -> SkillCatalogService:
        """Retourne le service de catalogue des compétences.
        
        Returns:
            Instance de SkillCatalogService.
        """
        if self._skill_catalog_service is None:
            self._skill_catalog_service = SkillCatalogService()
            logger.info("SkillCatalogService initialisé dans le container.")
        return self._skill_catalog_service
    
    def get_trait_catalog_service(self) -> TraitCatalogService:
        """Retourne le service de catalogue des traits.
        
        Returns:
            Instance de TraitCatalogService.
        """
        if self._trait_catalog_service is None:
            self._trait_catalog_service = TraitCatalogService()
            logger.info("TraitCatalogService initialisé dans le container.")
        return self._trait_catalog_service
    
    def get_preset_service(self) -> PresetService:
        """Retourne le service de gestion des presets.
        
        Returns:
            Instance de PresetService.
        """
        if self._preset_service is None:
            config_service = self.get_config_service()
            context_builder = self.get_context_builder()
            self._preset_service = PresetService(
                config_service=config_service,
                context_builder=context_builder
            )
            logger.info("PresetService initialisé dans le container.")
        return self._preset_service

    def get_template_service(self) -> TemplateService:
        """Retourne le service de gestion des templates custom.

        Returns:
            Instance de TemplateService.
        """
        if self._template_service is None:
            self._template_service = TemplateService(
                preset_service=self.get_preset_service(),
            )
            logger.info("TemplateService initialisé dans le container.")
        return self._template_service
    
    def get_dialogue_generation_service(self) -> DialogueGenerationService:
        """Retourne le service de génération de dialogues.
        
        Returns:
            Instance de DialogueGenerationService.
        """
        if self._dialogue_generation_service is None:
            context_builder = self.get_context_builder()
            prompt_engine = self.get_prompt_engine()
            self._dialogue_generation_service = DialogueGenerationService(
                context_builder=context_builder,
                prompt_engine=prompt_engine
            )
            logger.info("DialogueGenerationService initialisé dans le container.")
        return self._dialogue_generation_service
    
    def get_llm_usage_service(self) -> LLMUsageService:
        """Retourne le service de tracking d'utilisation LLM.
        
        Returns:
            Instance de LLMUsageService.
        """
        if self._llm_usage_service is None:
            from api.llm_usage_factory import create_llm_usage_service

            self._llm_usage_service = create_llm_usage_service()
            logger.info("LLMUsageService initialisé dans le container.")
        return self._llm_usage_service
    
    def get_export_log_service(self) -> ExportLogService:
        """Retourne le service de logs export Unity.

        Returns:
            Instance de ExportLogService.
        """
        if self._export_log_service is None:
            self._export_log_service = ExportLogService()
            logger.info("ExportLogService initialisé dans le container.")
        return self._export_log_service
    
    def get_unity_dialogue_generation_service(self) -> UnityDialogueGenerationService:
        """Retourne le service de génération Unity Dialogue.
        
        Returns:
            Instance de UnityDialogueGenerationService.
        """
        if self._unity_generation_service is None:
            self._unity_generation_service = UnityDialogueGenerationService()
            logger.info("UnityDialogueGenerationService initialisé dans le container.")
        return self._unity_generation_service
    
    def get_graph_node_orchestrator(self) -> "GraphNodeOrchestrator":
        """Retourne l'orchestrateur de nœuds de graphe.
        
        Returns:
            Instance de GraphNodeOrchestrator avec dépendances injectées.
        """
        if self._graph_node_orchestrator is None:
            from services.graph_node_orchestrator import GraphNodeOrchestrator
            
            unity_service = self.get_unity_dialogue_generation_service()
            self._graph_node_orchestrator = GraphNodeOrchestrator(
                generation_service=unity_service
            )
            logger.info("GraphNodeOrchestrator initialisé dans le container.")
        return self._graph_node_orchestrator

    def get_dialogue_tree_expansion_service(self) -> "DialogueTreeExpansionService":
        """Retourne le service d'expansion BFS de dialogues complets."""
        if self._dialogue_tree_expansion_service is None:
            from services.dialogue_tree_expansion_service import DialogueTreeExpansionService

            self._dialogue_tree_expansion_service = DialogueTreeExpansionService(
                graph_orchestrator=self.get_graph_node_orchestrator(),
            )
            logger.info("DialogueTreeExpansionService initialisé dans le container.")
        return self._dialogue_tree_expansion_service
    
    def get_linked_selector_service(self) -> LinkedSelectorService:
        """Retourne le service de sélection d'éléments liés.
        
        Returns:
            Instance de LinkedSelectorService.
        """
        if self._linked_selector_service is None:
            context_builder = self.get_context_builder()
            self._linked_selector_service = LinkedSelectorService(
                context_builder=context_builder
            )
            logger.info("LinkedSelectorService initialisé dans le container.")
        return self._linked_selector_service
    
    def get_notion_import_service(self) -> NotionImportService:
        """Retourne le service d'import Notion.
        
        Returns:
            Instance de NotionImportService.
        """
        if self._notion_import_service is None:
            self._notion_import_service = NotionImportService()
            logger.info("NotionImportService initialisé dans le container.")
        return self._notion_import_service

    def get_cd_rules_service(self) -> ContextDroppingRulesService:
        """Retourne le service de règles anti-context-dropping (Story 4.10).

        Returns:
            Instance partagée de ``ContextDroppingRulesService`` (singleton container).
        """
        if self._cd_rules_service is None:
            from constants import FilePaths

            root = Path(__file__).resolve().parent.parent
            self._cd_rules_service = ContextDroppingRulesService(
                storage_file=root / FilePaths.CONTEXT_DROPPING_RULES_FILE
            )
            logger.info("ContextDroppingRulesService initialisé dans le container.")
        return self._cd_rules_service

    def get_context_rule_service(self) -> ContextRuleService:
        """Retourne le service de règles de sélection de contexte GDD.

        Returns:
            Instance de ContextRuleService.
        """
        if self._context_rule_service is None:
            from pathlib import Path
            from constants import FilePaths
            storage_file = Path(__file__).resolve().parent.parent / FilePaths.CONTEXT_RULES_FILE
            self._context_rule_service = ContextRuleService(storage_file=storage_file)
            logger.info("ContextRuleService initialisé dans le container.")
        return self._context_rule_service

    def get_gdd_notion_sync_service(self) -> "GddNotionSyncService":
        """Retourne le service de synchronisation GDD depuis Notion (FR18).

        Returns:
            Instance configurée avec chemins projet et data/.
        """
        if self._gdd_notion_sync_service is None:
            from constants import FilePaths
            from services.gdd_notion_sync_config_store import GddNotionSyncConfigStore
            from services.gdd_notion_sync_service import GddNotionSyncService

            root = Path(__file__).resolve().parent.parent
            store = GddNotionSyncConfigStore(
                settings_path=root / FilePaths.GDD_NOTION_SYNC_CONFIG_FILE,
                token_path=root / FilePaths.GDD_NOTION_SYNC_TOKEN_FILE,
            )
            gdd_dir = self._resolve_gdd_categories_path()
            manifest = root / FilePaths.GDD_NOTION_SYNC_MANIFEST_FILE
            status_path = root / FilePaths.GDD_NOTION_SYNC_DIR / "status.json"
            from services.gdd_context_refresh import reload_context_builder_if_loaded

            def _after_sync() -> None:
                self.invalidate_global_relation_index()
                reload_context_builder_if_loaded(self)
                self._inject_relation_index_into_context_builder()

            self._gdd_notion_sync_service = GddNotionSyncService(
                config_store=store,
                manifest_path=manifest,
                gdd_categories_path=gdd_dir,
                status_path=status_path,
                after_gdd_disk_mutation=_after_sync,
            )
            logger.info("GddNotionSyncService initialisé dans le container.")
        return self._gdd_notion_sync_service

    def _resolve_gdd_categories_path(self) -> Path:
        """Répertoire des catégories GDD (helper partagé ``services.gdd_paths``)."""
        from services.gdd_paths import resolve_gdd_categories_path

        root = Path(__file__).resolve().parent.parent
        return resolve_gdd_categories_path(root)

    def get_dialogue_preview_service(self) -> "DialoguePreviewService":
        """Retourne le service preview document (Story 9.4).

        Returns:
            Instance singleton de DialoguePreviewService.
        """
        if self._dialogue_preview_service is None:
            from services.dialogue_preview_service import DialoguePreviewService

            self._dialogue_preview_service = DialoguePreviewService()
            logger.info("DialoguePreviewService initialisé dans le container.")
        return self._dialogue_preview_service
    
    def get_unity_dialogue_orchestrator(self, request_id: str):
        """Crée un orchestrateur Unity Dialogue avec toutes les dépendances.
        
        Utilise le pattern Factory pour créer une nouvelle instance d'orchestrateur
        à chaque appel, injectant toutes les dépendances nécessaires depuis le container.
        Chaque requête obtient sa propre instance avec un request_id unique pour le logging.
        
        Args:
            request_id: ID unique de la requête pour le logging et le suivi.
            
        Returns:
            Instance de UnityDialogueOrchestrator configurée avec toutes les dépendances.
        """
        from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator
        
        return UnityDialogueOrchestrator(
            dialogue_service=self.get_dialogue_generation_service(),
            prompt_engine=self.get_prompt_engine(),
            skill_service=self.get_skill_catalog_service(),
            trait_service=self.get_trait_catalog_service(),
            config_service=self.get_config_service(),
            usage_service=self.get_llm_usage_service(),
            unity_generation_service=self.get_unity_dialogue_generation_service(),
            request_id=request_id
        )

    def close(self) -> None:
        """Ferme les ressources SQLite détenues par le container."""
        with self._database_lock:
            if self._database_connection is not None:
                self._database_connection.close()
            self._database_connection = None
            self._user_repository = None
            self._user_settings_repository = None
            self._app_settings_repository = None
            self._dialogues_index_repository = None
            self._dialogue_shares_repository = None
            self._template_shares_repository = None
            self._collections_repository = None
            self._collection_service = None
            self._dialogues_search_repository = None
            self._dialogue_index_service = None
            self._dialogue_metadata_service = None
            self._batch_validation_service = None
            self._batch_validation_job_manager = None
            self._batch_node_generation_service = None
            self._batch_node_generation_job_manager = None
            self._audit_logs_repository = None
            self._audit_log_service = None
            self._document_persistence_service = None
            self._dialogue_sharing_service = None
            self._template_sharing_service = None
            self._auth_service = None
    
    def reset(self) -> None:
        """Réinitialise tous les services (utile lors d'un reload uvicorn).
        
        Cette méthode doit être appelée au startup du lifespan pour garantir
        que les services sont réinitialisés après un reload d'uvicorn.
        """
        self._config_service = None
        self._context_builder = None
        self._vocab_service = None
        self._guides_service = None
        self._prompt_engine = None
        self._skill_catalog_service = None
        self._trait_catalog_service = None
        self._preset_service = None
        self._template_service = None
        self._dialogue_generation_service = None
        self._llm_usage_service = None
        self._dialogue_metadata_service = None
        self._unity_generation_service = None
        self._graph_node_orchestrator = None
        self._dialogue_tree_expansion_service = None
        self._linked_selector_service = None
        self._notion_import_service = None
        self._context_rule_service = None
        self._cd_rules_service = None
        self._gdd_notion_sync_service = None
        self._dialogue_preview_service = None
        self.close()
        self._database_initialization_failed = False
        logger.info("ServiceContainer réinitialisé (reload détecté).")
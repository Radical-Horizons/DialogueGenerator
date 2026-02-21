"""Container de services pour l'application FastAPI.

Ce container stocke toutes les instances de services dans app.state,
permettant une meilleure gestion du cycle de vie et facilitant les tests.
"""
import logging
from typing import Optional
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
from services.dialogue_generation_service import DialogueGenerationService
from services.llm_usage_service import LLMUsageService

logger = logging.getLogger(__name__)


class ServiceContainer:
    """Container pour tous les services de l'application.
    
    Cette classe centralise la création et le stockage des services,
    remplaçant les singletons globaux par une instance unique dans app.state.
    """
    
    def __init__(self):
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
        self._dialogue_generation_service: Optional[DialogueGenerationService] = None
        self._llm_usage_service: Optional[LLMUsageService] = None
        logger.debug("ServiceContainer initialisé (services à charger au premier accès)")
    
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
        return self._context_builder
    
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
            from api.dependencies import create_llm_usage_service
            self._llm_usage_service = create_llm_usage_service()
            logger.info("LLMUsageService initialisé dans le container.")
        return self._llm_usage_service
    
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
            request_id=request_id
        )
    
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
        self._dialogue_generation_service = None
        self._llm_usage_service = None
        logger.info("ServiceContainer réinitialisé (reload détecté).")
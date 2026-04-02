"""Factory pour la création de ContextBuilder.

Ce module centralise toute la logique d'initialisation complexe de ContextBuilder,
simplifiant ainsi le constructeur de ContextBuilder et améliorant la testabilité.
"""
import logging
import os
from pathlib import Path
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from core.context.context_builder import ContextBuilder
    from services.gdd_loader import GDDLoader
    from services.element_repository import ElementRepository
    from services.element_resolver import ElementResolver
    from services.context_formatter import ContextFormatter
    from services.context_serializer import ContextSerializer
    from services.context_truncator import ContextTruncator
    from services.context_field_manager import ContextFieldManager
    from services.element_linker import ElementLinker
    from services.gdd_data_accessor import GDDDataAccessor
    from services.previous_dialogue_manager import PreviousDialogueManager
    from services.context_construction_service import ContextConstructionService

logger = logging.getLogger(__name__)


class ContextBuilderFactory:
    """Factory pour créer et configurer ContextBuilder.
    
    Centralise toute la logique d'initialisation complexe :
    - Gestion des chemins GDD (variables d'environnement, valeurs par défaut)
    - Création et injection des dépendances
    - Ordre d'initialisation correct
    """
    
    @staticmethod
    def create(
        config_file_path: Optional[Path] = None,
        gdd_categories_path: Optional[Path] = None,
        gdd_import_path: Optional[Path] = None,
        context_builder_dir: Optional[Path] = None,
        project_root_dir: Optional[Path] = None
    ) -> 'ContextBuilder':
        """Crée et configure un ContextBuilder.
        
        Args:
            config_file_path: Chemin vers le fichier de configuration.
            gdd_categories_path: Chemin vers les catégories GDD (priorité sur env var).
            gdd_import_path: Chemin vers le répertoire import (priorité sur env var).
            context_builder_dir: Répertoire du context_builder.py (pour chemins relatifs).
            project_root_dir: Répertoire racine du projet (pour chemins relatifs).
            
        Returns:
            Instance de ContextBuilder configurée et prête à l'emploi.
        """
        from core.context.context_builder import ContextBuilder
        
        # Déterminer les chemins par défaut si non fournis
        if context_builder_dir is None:
            # Essayer d'importer depuis core.context.context_builder pour compatibilité
            try:
                from core.context.context_builder import CONTEXT_BUILDER_DIR
                context_builder_dir = CONTEXT_BUILDER_DIR
            except ImportError:
                context_builder_dir = Path(__file__).resolve().parent.parent
        if project_root_dir is None:
            try:
                from core.context.context_builder import PROJECT_ROOT_DIR
                project_root_dir = PROJECT_ROOT_DIR
            except ImportError:
                project_root_dir = context_builder_dir.parent
        
        # Déterminer le chemin de configuration
        if config_file_path is None:
            from core.context.context_builder import DEFAULT_CONFIG_FILE
            config_file_path = DEFAULT_CONFIG_FILE
        
        # Gérer les chemins GDD (priorité : paramètre > ConfigManager > valeur par défaut)
        if gdd_categories_path is None:
            from services.config_manager import get_config_manager
            config_manager = get_config_manager()
            gdd_categories_path = config_manager.get_gdd_categories_path()
            # Si toujours None, utilisera la valeur par défaut dans GDDLoader
        
        if gdd_import_path is None:
            from services.config_manager import get_config_manager
            config_manager = get_config_manager()
            gdd_import_path = config_manager.get_gdd_import_path()
            # Si toujours None, utilisera la valeur par défaut dans GDDLoader
        
        # Créer les dépendances dans l'ordre correct
        # 1. GDDLoader (nécessaire pour charger les données)
        from services.gdd_loader import GDDLoader
        gdd_loader = GDDLoader(
            categories_path=gdd_categories_path,
            import_path=gdd_import_path,
            context_builder_dir=context_builder_dir,
            project_root_dir=project_root_dir
        )
        
        # 2. ContextFormatter (nécessaire pour le formatage)
        from services.context_formatter import ContextFormatter
        context_config = ContextFormatter.load_config(config_file_path)
        context_formatter = ContextFormatter(context_config, config_file_path)
        
        # 3. ContextSerializer (sérialisation XML/JSON/texte)
        from services.context_serializer import ContextSerializer
        context_serializer = ContextSerializer()
        
        # 4. ContextTruncator (comptage et troncature de tokens)
        from services.context_truncator import ContextTruncator
        context_truncator = ContextTruncator()
        
        # 5. PreviousDialogueManager (gestion du dialogue précédent)
        from services.previous_dialogue_manager import PreviousDialogueManager
        previous_dialogue_manager = PreviousDialogueManager(context_truncator)
        
        # Créer ContextBuilder avec les dépendances de base
        # Les autres dépendances seront créées après load_gdd_files()
        context_builder = ContextBuilder(
            config_file_path=config_file_path,
            gdd_categories_path=gdd_categories_path,
            gdd_import_path=gdd_import_path,
            gdd_loader=gdd_loader,
            context_formatter=context_formatter,
            context_serializer=context_serializer,
            context_truncator=context_truncator,
            previous_dialogue_manager=previous_dialogue_manager
        )
        
        logger.info("ContextBuilder créé via ContextBuilderFactory")
        return context_builder

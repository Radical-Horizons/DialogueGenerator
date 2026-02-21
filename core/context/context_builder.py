# DialogueGenerator/context_builder.py
from pathlib import Path
import logging
import os
from typing import List, Optional, Dict, Any, TYPE_CHECKING
import time

if TYPE_CHECKING:
    import xml.etree.ElementTree as ET
    from models.prompt_structure import PromptStructure
    from services.gdd_loader import GDDLoader, GDDData
    from services.element_repository import ElementRepository
    from services.element_resolver import ElementResolver
    from services.context_formatter import ContextFormatter
    from services.context_serializer import ContextSerializer
    from services.context_truncator import ContextTruncator
    from services.context_field_manager import ContextFieldManager
    from services.element_linker import ElementLinker
    from services.gdd_data_accessor import GDDDataAccessor
    from services.previous_dialogue_manager import PreviousDialogueManager

try:
    import tiktoken
except ImportError:
    tiktoken = None

logger = logging.getLogger(__name__)

# Mise à jour des chemins pour le nouveau emplacement dans core/context/
CONTEXT_BUILDER_DIR = Path(os.path.dirname(os.path.abspath(__file__))).parent.parent  # Remonter à la racine du projet
PROJECT_ROOT_DIR = CONTEXT_BUILDER_DIR
DEFAULT_CONFIG_FILE = CONTEXT_BUILDER_DIR / "context_config.json"

from services.context_construction_service import (
    ElementBuildResult,
    CategoryBuildResult,
    ContextBuildResult
)


class ContextBuilder:
    """Facade léger pour la construction du contexte GDD pour les prompts de génération de dialogues.
    
    Cette classe agit comme un orchestrateur qui délègue les responsabilités à des services spécialisés :
    - GDDDataAccessor : Accès aux données GDD
    - ContextConstructionService : Construction du contexte
    - PreviousDialogueManager : Gestion du dialogue précédent
    - Autres services : Formatage, sérialisation, troncature, etc.
    
    Respecte les principes SOLID :
    - SRP : Orchestration uniquement
    - DIP : Dépend d'abstractions (services injectés)
    - ISP : Interface publique minimale, délégation aux services
    
    Cette classe coordonne les services spécialisés pour construire le contexte :
    - GDDLoader : Chargement des fichiers JSON
    - ElementRepository/ElementResolver : Accès et résolution des éléments
    - ContextFormatter : Formatage des champs
    - ContextOrganizer : Organisation du contexte
    - ContextSerializer : Sérialisation XML/JSON/texte
    - ContextTruncator : Troncature et comptage de tokens
    - ContextFieldManager : Gestion des champs
    - ElementLinker : Gestion des relations entre éléments
    
    IMPORTANT - Format du prompt généré :
    Le prompt généré par build_context_with_custom_fields() inclut des marqueurs explicites
    pour chaque élément dans chaque catégorie :
    - `--- PNJ 1 ---`, `--- PNJ 2 ---` pour les personnages
    - `--- LIEU 1 ---`, `--- LIEU 2 ---` pour les lieux
    - `--- OBJET 1 ---` pour les objets
    - `--- ESPÈCE 1 ---` pour les espèces
    - `--- COMMUNAUTÉ 1 ---` pour les communautés
    - `--- QUÊTE 1 ---` pour les quêtes
    
    Ces marqueurs sont ajoutés AVANT le contenu formaté de chaque élément (généré par
    ContextOrganizer). Ils permettent au frontend de parser la structure de manière fiable
    et garantissent une source de vérité unique entre le prompt brut et le mode structuré.
    
    Format des marqueurs : `--- {LABEL} {NUMÉRO} ---`
    - Les numéros commencent à 1 et sont séquentiels par catégorie
    - Le marqueur est sur une ligne complète
    - Le contenu de l'élément suit immédiatement après le marqueur
    
    Voir docs/PROMPT_STRUCTURE.md pour la spécification complète du format.
    """
    _last_no_config_log_time: dict = {}
    _no_config_log_interval: float = 5.0
    _last_info_log_time: dict = {}
    _info_log_interval: float = 5.0

    def __init__(
        self,
        config_file_path: Path = DEFAULT_CONFIG_FILE,
        gdd_categories_path: Optional[Path] = None,
        gdd_import_path: Optional[Path] = None,
        gdd_loader: Optional['GDDLoader'] = None,
        element_repository: Optional['ElementRepository'] = None,
        element_resolver: Optional['ElementResolver'] = None,
        context_formatter: Optional['ContextFormatter'] = None,
        context_serializer: Optional['ContextSerializer'] = None,
        context_truncator: Optional['ContextTruncator'] = None,
        context_field_manager: Optional['ContextFieldManager'] = None,
        element_linker: Optional['ElementLinker'] = None,
        gdd_data_accessor: Optional['GDDDataAccessor'] = None,
        previous_dialogue_manager: Optional['PreviousDialogueManager'] = None,
        context_construction_service: Optional['ContextConstructionService'] = None,
    ):
        """Initialise ContextBuilder avec injection optionnelle de dépendances.
        
        Args:
            config_file_path: Chemin vers le fichier de configuration.
            gdd_categories_path: Chemin vers les catégories GDD.
            gdd_import_path: Chemin vers le répertoire import.
            gdd_loader: Instance de GDDLoader (créée si None).
            element_repository: Instance de ElementRepository (créée après load_gdd_files si None).
            element_resolver: Instance de ElementResolver (créée après load_gdd_files si None).
            context_formatter: Instance de ContextFormatter (créée si None).
            context_serializer: Instance de ContextSerializer (créée si None).
            context_truncator: Instance de ContextTruncator (créée si None).
            context_field_manager: Instance de ContextFieldManager (créée après load_gdd_files si None).
            element_linker: Instance de ElementLinker (créée après load_gdd_files si None).
            gdd_data_accessor: Instance de GDDDataAccessor (créée après load_gdd_files si None).
            previous_dialogue_manager: Instance de PreviousDialogueManager (créée si None).
            context_construction_service: Instance de ContextConstructionService (créée après load_gdd_files si None).
        """
        self._config_file_path = config_file_path
        
        # Charger la configuration
        from services.context_formatter import ContextFormatter as CF
        self.context_config = CF.load_config(config_file_path)
        
        # Configuration des chemins GDD via ConfigManager ou paramètres
        # Priorité : paramètre > ConfigManager > valeur par défaut
        if gdd_categories_path is not None:
            self._gdd_categories_path = gdd_categories_path
        else:
            from services.config_manager import get_config_manager
            config_manager = get_config_manager()
            self._gdd_categories_path = config_manager.get_gdd_categories_path()
            # Si toujours None, utilisera la valeur par défaut dans GDDLoader
        
        if gdd_import_path is not None:
            self._gdd_import_path = gdd_import_path
        else:
            from services.config_manager import get_config_manager
            config_manager = get_config_manager()
            self._gdd_import_path = config_manager.get_gdd_import_path()
            # Si toujours None, utilisera la valeur par défaut dans GDDLoader

        # GDDLoader
        if gdd_loader is None:
            from services.gdd_loader import GDDLoader
            self._gdd_loader = GDDLoader(
                categories_path=self._gdd_categories_path,
                import_path=self._gdd_import_path,
                context_builder_dir=CONTEXT_BUILDER_DIR,
                project_root_dir=PROJECT_ROOT_DIR
            )
        else:
            self._gdd_loader = gdd_loader
        
        # GDDData (sera chargé par load_gdd_files)
        self._gdd_data: Optional['GDDData'] = None
        
        # ElementRepository (sera créé après load_gdd_files)
        self._element_repository: Optional['ElementRepository'] = element_repository
        
        # ElementResolver (sera créé après load_gdd_files)
        self._element_resolver: Optional['ElementResolver'] = element_resolver
        
        # ContextFormatter
        if context_formatter is None:
            from services.context_formatter import ContextFormatter
            self._context_formatter = ContextFormatter(self.context_config, config_file_path)
        else:
            self._context_formatter = context_formatter

        # ContextSerializer
        if context_serializer is None:
            from services.context_serializer import ContextSerializer
            self._context_serializer = ContextSerializer()
        else:
            self._context_serializer = context_serializer

        # ContextTruncator
        if context_truncator is None:
            from services.context_truncator import ContextTruncator
            # Laisser ContextTruncator gérer la création du tokenizer
            # Il détectera automatiquement si tiktoken est disponible
            self._context_truncator = ContextTruncator()
        else:
            self._context_truncator = context_truncator

        # Garder tokenizer pour compatibilité (délègue au truncator)
        self.tokenizer = self._context_truncator.tokenizer
        
        # ContextFieldManager (sera créé après load_gdd_files)
        self._context_field_manager: Optional['ContextFieldManager'] = context_field_manager
        
        # ElementLinker (sera créé après load_gdd_files)
        self._element_linker: Optional['ElementLinker'] = element_linker
        
        # GDDDataAccessor (sera créé après load_gdd_files)
        self._gdd_data_accessor: Optional['GDDDataAccessor'] = gdd_data_accessor
        
        # PreviousDialogueManager
        if previous_dialogue_manager is None:
            from services.previous_dialogue_manager import PreviousDialogueManager
            self._previous_dialogue_manager = PreviousDialogueManager(self._context_truncator)
        else:
            self._previous_dialogue_manager = previous_dialogue_manager
        
        # ContextConstructionService (sera créé après load_gdd_files)
        self._context_construction_service: Optional['ContextConstructionService'] = context_construction_service

    def _count_tokens(self, text: str) -> int:
        """Compte le nombre de tokens dans un texte.
        
        Délègue le comptage à ContextTruncator qui utilise tiktoken
        si disponible, sinon un comptage approximatif basé sur les mots.
        
        Args:
            text: Le texte pour lequel compter les tokens.
        
        Returns:
            Le nombre de tokens dans le texte.
        """
        return self._context_truncator.count_tokens(text)

    def load_gdd_files(self):
        """Charge les fichiers JSON du GDD depuis les chemins relatifs au projet.
        
        Délègue le chargement à GDDLoader et initialise ElementRepository et ElementResolver.
        Utilise un cache intelligent avec vérification mtime pour éviter les rechargements inutiles.
        """
        # Charger via GDDLoader
        self._gdd_data = self._gdd_loader.load_all()
        
        # Initialiser ElementRepository si nécessaire
        if self._element_repository is None:
            from services.element_repository import ElementRepository
            self._element_repository = ElementRepository(self._gdd_data)
        
        # Initialiser ElementResolver si nécessaire
        if self._element_resolver is None:
            from services.element_resolver import ElementResolver
            self._element_resolver = ElementResolver(self._element_repository)
        
        # Initialiser ContextFieldManager si nécessaire
        if self._context_field_manager is None:
            from services.context_field_manager import ContextFieldManager
            self._context_field_manager = ContextFieldManager(self.context_config, self)
        
        # Initialiser ElementLinker si nécessaire
        if self._element_linker is None:
            from services.element_linker import ElementLinker
            self._element_linker = ElementLinker(
                element_repository=self._element_repository,
                element_resolver=self._element_resolver
            )
        
        # Initialiser ou mettre à jour GDDDataAccessor
        if self._gdd_data_accessor is None:
            from services.gdd_data_accessor import GDDDataAccessor
            self._gdd_data_accessor = GDDDataAccessor(
                gdd_data=self._gdd_data,
                element_resolver=self._element_resolver,
                element_linker=self._element_linker
            )
        else:
            # Mettre à jour les références si accessor existe déjà
            self._gdd_data_accessor._gdd_data = self._gdd_data
            self._gdd_data_accessor._element_resolver = self._element_resolver
            self._gdd_data_accessor._element_linker = self._element_linker
        
        # Initialiser ContextConstructionService si nécessaire
        if self._context_construction_service is None:
            from services.context_construction_service import ContextConstructionService
            self._context_construction_service = ContextConstructionService(
                element_resolver=self._element_resolver,
                context_field_manager=self._context_field_manager,
                context_formatter=self._context_formatter,
                context_truncator=self._context_truncator,
                previous_dialogue_manager=self._previous_dialogue_manager,
                context_config=self.context_config
            )
        else:
            # Mettre à jour les références si service existe déjà
            self._context_construction_service._element_resolver = self._element_resolver
            self._context_construction_service._context_field_manager = self._context_field_manager
            self._context_construction_service._context_formatter = self._context_formatter
            self._context_construction_service._context_truncator = self._context_truncator
            self._context_construction_service._previous_dialogue_manager = self._previous_dialogue_manager
            self._context_construction_service._context_config = self.context_config
    
    # Propriétés pour compatibilité rétroactive (délèguent à GDDDataAccessor)
    @property
    def characters(self) -> List[Dict[str, Any]]:
        """Liste des personnages du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne une liste vide si les données GDD ne sont pas chargées.
        
        Returns:
            Liste des dictionnaires représentant les personnages.
        """
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.characters
    
    @property
    def locations(self) -> List[Dict[str, Any]]:
        """Liste des lieux du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne une liste vide si les données GDD ne sont pas chargées.
        
        Returns:
            Liste des dictionnaires représentant les lieux.
        """
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.locations
    
    @property
    def items(self) -> List[Dict[str, Any]]:
        """Liste des objets du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne une liste vide si les données GDD ne sont pas chargées.
        
        Returns:
            Liste des dictionnaires représentant les objets.
        """
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.items
    
    @property
    def species(self) -> List[Dict[str, Any]]:
        """Liste des espèces du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne une liste vide si les données GDD ne sont pas chargées.
        
        Returns:
            Liste des dictionnaires représentant les espèces.
        """
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.species
    
    @property
    def communities(self) -> List[Dict[str, Any]]:
        """Liste des communautés du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne une liste vide si les données GDD ne sont pas chargées.
        
        Returns:
            Liste des dictionnaires représentant les communautés.
        """
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.communities
    
    @property
    def quests(self) -> List[Dict[str, Any]]:
        """Liste des quêtes du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne une liste vide si les données GDD ne sont pas chargées.
        
        Returns:
            Liste des dictionnaires représentant les quêtes.
        """
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.quests
    
    @property
    def narrative_structures(self) -> List[Dict[str, Any]]:
        """Liste des structures narratives du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne une liste vide si les données GDD ne sont pas chargées.
        
        Returns:
            Liste des dictionnaires représentant les structures narratives.
        """
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.narrative_structures
    
    @property
    def macro_structure(self) -> Optional[Dict[str, Any]]:
        """Structure macro du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne None si les données GDD ne sont pas chargées.
        
        Returns:
            Dictionnaire représentant la structure macro, ou None.
        """
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.macro_structure
    
    @property
    def micro_structure(self) -> Optional[Dict[str, Any]]:
        """Structure micro du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne None si les données GDD ne sont pas chargées.
        
        Returns:
            Dictionnaire représentant la structure micro, ou None.
        """
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.micro_structure
    
    @property
    def dialogues_examples(self) -> List[Dict[str, Any]]:
        """Liste des exemples de dialogues du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne une liste vide si les données GDD ne sont pas chargées.
        
        Returns:
            Liste des dictionnaires représentant les exemples de dialogues.
        """
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.dialogues_examples
    
    @property
    def vision_data(self) -> Optional[Dict[str, Any]]:
        """Données Vision du GDD.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne None si les données GDD ne sont pas chargées.
        
        Returns:
            Dictionnaire représentant les données Vision, ou None.
        """
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.vision_data
    
    @property
    def gdd_data(self) -> Dict[str, Any]:
        """Données GDD complètes.
        
        Propriété de compatibilité qui délègue à GDDDataAccessor.
        Retourne un dictionnaire vide si les données GDD ne sont pas chargées.
        
        Returns:
            Dictionnaire contenant toutes les données GDD.
        """
        if self._gdd_data_accessor is None:
            return {}
        return self._gdd_data_accessor.gdd_data

    def get_characters_names(self):
        """Récupère la liste des noms de personnages."""
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.get_characters_names()

    def get_locations_names(self):
        """Récupère la liste des noms de lieux."""
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.get_locations_names()

    def get_items_names(self):
        """Récupère la liste des noms d'objets."""
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.get_items_names()

    def get_species_names(self):
        """Récupère la liste des noms d'espèces."""
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.get_species_names()

    def get_communities_names(self):
        """Récupère la liste des noms de communautés."""
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.get_communities_names()

    def get_quests_names(self):
        """Récupère la liste des noms de quêtes."""
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.get_quests_names()

    def get_narrative_structures(self):
        """Récupère les structures narratives."""
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.get_narrative_structures()

    def get_macro_structure(self):
        """Récupère la structure macro."""
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.get_macro_structure()

    def get_micro_structure(self):
        """Récupère la structure micro."""
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.get_micro_structure()
        
    def get_dialogue_examples_titles(self):
        """Récupère les titres des exemples de dialogues."""
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.get_dialogue_examples_titles()

    def get_character_details_by_name(self, name: str) -> dict | None:
        """Récupère les détails d'un personnage par nom."""
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.get_character_details_by_name(name)

    def get_location_details_by_name(self, name: str) -> dict | None:
        """Récupère les détails d'un lieu par nom."""
        # Lazy-load GDD files if not already loaded
        if self._gdd_data_accessor is None:
            logger.warning("GDD data accessor not initialized, attempting to load GDD files...")
            try:
                self.load_gdd_files()
            except Exception as e:
                logger.error(f"Failed to load GDD files: {e}", exc_info=True)
                return None
        
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.get_location_details_by_name(name)

    def get_item_details_by_name(self, name: str) -> dict | None:
        """Récupère les détails d'un objet par nom."""
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.get_item_details_by_name(name)

    def get_species_details_by_name(self, name: str) -> dict | None:
        """Récupère les détails d'une espèce par nom."""
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.get_species_details_by_name(name)

    def get_community_details_by_name(self, name: str) -> dict | None:
        """Récupère les détails d'une communauté par nom."""
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.get_community_details_by_name(name)

    def get_dialogue_example_details_by_title(self, title: str) -> dict | None:
        """Récupère les détails d'un exemple de dialogue par titre."""
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.get_dialogue_example_details_by_title(title)

    def get_quest_details_by_name(self, name: str) -> dict | None:
        """Récupère les détails d'une quête par nom."""
        if self._gdd_data_accessor is None:
            return None
        return self._gdd_data_accessor.get_quest_details_by_name(name)

    def set_previous_dialogue_context(self, preview_text: Optional[str]) -> None:
        """Définit le contexte du dialogue précédent (texte formaté Unity JSON).
        
        Args:
            preview_text: Texte formaté généré par preview_unity_dialogue_for_context, ou None pour réinitialiser.
        """
        self._previous_dialogue_manager.set_previous_dialogue_context(preview_text)

    def _format_previous_dialogue_for_context(self, max_tokens_for_history: int) -> str:
        """Formate le dialogue précédent stocké pour l'inclure dans le contexte LLM.
        
        Délègue à PreviousDialogueManager. Le texte est déjà formaté
        (généré par preview_unity_dialogue_for_context), on vérifie juste
        les tokens et tronque si nécessaire.
        
        Args:
            max_tokens_for_history: Nombre maximum de tokens autorisés pour l'historique.
        
        Returns:
            Le dialogue précédent formaté et tronqué si nécessaire.
        """
        return self._previous_dialogue_manager.format_previous_dialogue_for_context(max_tokens_for_history)
    
    @property
    def previous_dialogue_context(self) -> Optional[str]:
        """Récupère le contexte du dialogue précédent (compatibilité)."""
        return self._previous_dialogue_manager.previous_dialogue_context

    def _throttled_info_log(self, log_key: str, message: str) -> None:
        """Enregistre un message de log avec limitation de fréquence.
        
        Évite le spam de logs en limitant la fréquence d'enregistrement
        des messages pour une clé donnée. Un message avec la même clé
        ne sera loggé qu'une fois toutes les 5 secondes maximum.
        
        Args:
            log_key: Clé unique pour identifier le type de log (utilisée pour le throttling).
            message: Message à enregistrer dans les logs.
        """
        import time
        now = time.time()
        last_time = ContextBuilder._last_info_log_time.get(log_key, 0)
        if now - last_time > ContextBuilder._info_log_interval:
            logger.info(message)
            ContextBuilder._last_info_log_time[log_key] = now

    def _build_context_core(
        self,
        selected_elements: dict[str, list[str]],
        scene_instruction: str,
        field_configs: Optional[Dict[str, List[str]]] = None,
        organization_mode: str = "default",
        max_tokens: int = 70000,
        include_dialogue_type: bool = True,
        element_modes: Optional[Dict[str, Dict[str, str]]] = None,
        build_json_items: bool = False
    ) -> ContextBuildResult:
        """Construit la structure de données commune pour le contexte.
        
        Délègue la construction à ContextConstructionService qui assemble
        les éléments GDD sélectionnés selon les paramètres fournis.
        
        Args:
            selected_elements: Dictionnaire des éléments sélectionnés par catégorie
                (ex: {"characters": ["PNJ1"], "locations": ["Lieu1"]}).
            scene_instruction: Instructions de scène pour guider la génération.
            field_configs: Configuration optionnelle des champs à inclure par catégorie.
            organization_mode: Mode d'organisation du contexte ("default", "narrative", etc.).
            max_tokens: Nombre maximum de tokens pour le contexte généré.
            include_dialogue_type: Si True, inclut le type de dialogue dans le contexte.
            element_modes: Modes optionnels par élément (ex: {"characters": {"PNJ1": "summary"}}).
            build_json_items: Si True, construit également les items JSON.
        
        Returns:
            ContextBuildResult contenant la structure de données construite.
        
        Raises:
            RuntimeError: Si ContextConstructionService n'est pas initialisé.
                Appeler load_gdd_files() d'abord.
        """
        if self._context_construction_service is None:
            raise RuntimeError("ContextConstructionService n'est pas initialisé. Appelez load_gdd_files() d'abord.")
        return self._context_construction_service.build_context_core(
            selected_elements=selected_elements,
            scene_instruction=scene_instruction,
            field_configs=field_configs,
            organization_mode=organization_mode,
            max_tokens=max_tokens,
            include_dialogue_type=include_dialogue_type,
            element_modes=element_modes,
            build_json_items=build_json_items
        )

    def build_context_with_custom_fields(
        self,
        selected_elements: dict[str, list[str]],
        scene_instruction: str,
        field_configs: Optional[Dict[str, List[str]]] = None,
        organization_mode: str = "default",
        max_tokens: int = 70000,
        include_dialogue_type: bool = True,
        element_modes: Optional[Dict[str, Dict[str, str]]] = None,
        include_element_markers: bool = True
    ) -> str:
        """Construit un résumé contextuel avec champs personnalisés (délègue à ContextConstructionService)."""
        if self._context_construction_service is None:
            raise RuntimeError("ContextConstructionService n'est pas initialisé. Appelez load_gdd_files() d'abord.")
        self._throttled_info_log('start_build_custom', f"Début de la construction du contexte avec champs personnalisés (mode: {organization_mode}).")
        result = self._context_construction_service.build_context_with_custom_fields(
            selected_elements=selected_elements,
            scene_instruction=scene_instruction,
            field_configs=field_configs,
            organization_mode=organization_mode,
            max_tokens=max_tokens,
            include_dialogue_type=include_dialogue_type,
            element_modes=element_modes,
            include_element_markers=include_element_markers
        )
        self._throttled_info_log('context_summary_custom', f"Résumé du contexte construit (mode: {organization_mode}). Total tokens: {self._count_tokens(result)}")
        return result

    def build_context_json(
        self,
        selected_elements: dict[str, list[str]],
        scene_instruction: str,
        field_configs: Optional[Dict[str, List[str]]] = None,
        organization_mode: str = "default",
        max_tokens: int = 70000,
        include_dialogue_type: bool = True,
        element_modes: Optional[Dict[str, Dict[str, str]]] = None
    ) -> 'PromptStructure':  # type: ignore
        """Construit un contexte structuré en JSON (délègue à ContextConstructionService)."""
        if self._context_construction_service is None:
            raise RuntimeError("ContextConstructionService n'est pas initialisé. Appelez load_gdd_files() d'abord.")
        self._throttled_info_log('start_build_json', f"Début de la construction du contexte JSON (mode: {organization_mode}).")
        return self._context_construction_service.build_context_json(
            selected_elements=selected_elements,
            scene_instruction=scene_instruction,
            field_configs=field_configs,
            organization_mode=organization_mode,
            max_tokens=max_tokens,
            include_dialogue_type=include_dialogue_type,
            element_modes=element_modes
        )
    






    def build_context(self, selected_elements: dict[str, list[str]], scene_instruction: str, max_tokens: int = 70000, include_dialogue_type: bool = True) -> str:
        """Construit un résumé contextuel basé sur les éléments sélectionnés (délègue à ContextConstructionService)."""
        if self._context_construction_service is None:
            raise RuntimeError("ContextConstructionService n'est pas initialisé. Appelez load_gdd_files() d'abord.")
        self._throttled_info_log('start_build', f"Début de la construction du contexte avec max_tokens={max_tokens}.")
        self._throttled_info_log('selected_elements', f"Éléments sélectionnés: {selected_elements}")
        return self._context_construction_service.build_context(
            selected_elements=selected_elements,
            scene_instruction=scene_instruction,
            max_tokens=max_tokens,
            include_dialogue_type=include_dialogue_type
        )

    def get_regions(self) -> list[str]:
        """Retourne une liste de noms de régions uniques à partir des données de localisation."""
        # Lazy-load GDD files if not already loaded
        if self._gdd_data_accessor is None:
            logger.warning("GDD data accessor not initialized, attempting to load GDD files...")
            try:
                self.load_gdd_files()
            except Exception as e:
                logger.error(f"Failed to load GDD files: {e}", exc_info=True)
                return []
        
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.get_regions()

    def get_sub_locations(self, region_name: str) -> list[str]:
        """Récupère les sous-lieux d'une région."""
        # Lazy-load GDD files if not already loaded
        if self._gdd_data_accessor is None:
            logger.warning("GDD data accessor not initialized, attempting to load GDD files...")
            try:
                self.load_gdd_files()
            except Exception as e:
                logger.error(f"Failed to load GDD files: {e}", exc_info=True)
                return []
        
        if self._gdd_data_accessor is None:
            return []
        return self._gdd_data_accessor.get_sub_locations(region_name)

    def get_linked_elements(self, character_name: str | None = None, location_names: list[str] | None = None) -> dict[str, set[str]]:
        """Récupère les éléments liés à un personnage et/ou des lieux."""
        if self._gdd_data_accessor is None:
            return {
                "characters": set(),
                "locations": set(),
                "items": set(),
                "species": set(),
                "communities": set(),
                "quests": set()
            }
        return self._gdd_data_accessor.get_linked_elements(
            character_name=character_name,
            location_names=location_names
        )
    
    @staticmethod
    def potential_related_names_from_text(text: str, known_character_names: list[str]) -> set[str]:
        """Trouve les noms de personnages mentionnés dans un texte (méthode statique pour compatibilité)."""
        from services.element_linker import ElementLinker
        linker = ElementLinker()
        return linker.find_related_names_in_text(text, known_character_names)

if __name__ == '__main__':
    # Configuration du logging pour les tests en standalone
    if not logger.hasHandlers():
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    cb = ContextBuilder()
    cb.load_gdd_files()

    print(f"\n--- Personnages ({len(cb.characters)}) ---")
    for name in cb.get_characters_names()[:2]: print(f"  {name}")
    print(f"\n--- Lieux ({len(cb.locations)}) ---")
    for name in cb.get_locations_names()[:2]: print(f"  {name}")
    # ... (autres prints de test)

    if cb.vision_data:
        print(f"\n--- Vision Data ---")
        print(f"  Clés dans Vision: {list(cb.vision_data.keys())}")

    if tiktoken and cb.characters and cb.locations:
        print("\n--- Test build_context avec config --- ")
        selected_test_elements = {
            "characters": cb.get_characters_names()[:1], 
            "locations": cb.get_locations_names()[:1],
            "items": cb.get_items_names()[:1]
        }
        test_instruction = "Le personnage A doit convaincre le personnage B."
        context = cb.build_context(selected_test_elements, test_instruction, max_tokens=8000, include_dialogue_type=True)
        print(f"\nContexte Généré (avec config, Dialogue Type, limite 8000 tokens):\nNombre de tokens: {cb._count_tokens(context)}\n{context}")

        context_no_dt = cb.build_context(selected_test_elements, test_instruction, max_tokens=8000, include_dialogue_type=False)
        print(f"\nContexte Généré (avec config, SANS Dialogue Type, limite 8000 tokens):\nNombre de tokens: {cb._count_tokens(context_no_dt)}\n{context_no_dt}")
    else:
        print("\nSkipping build_context test: tiktoken non dispo ou pas assez de données de test.") 
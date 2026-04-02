"""Service de construction du contexte GDD pour les prompts."""
import logging
from typing import Dict, List, Optional, Any, TYPE_CHECKING
from dataclasses import dataclass, field
from datetime import datetime

if TYPE_CHECKING:
    from services.element_resolver import ElementResolver
    from services.context_field_manager import ContextFieldManager
    from services.context_organizer import ContextOrganizer
    from services.context_formatter import ContextFormatter
    from services.context_truncator import ContextTruncator
    from services.previous_dialogue_manager import PreviousDialogueManager
    from models.prompt_structure import PromptStructure, PromptSection, ContextCategory, PromptMetadata, ContextItem, ItemSection

logger = logging.getLogger(__name__)


@dataclass
class ElementBuildResult:
    """Résultat de construction d'un élément."""
    name: str
    element_data: Dict[str, Any]
    element_mode: str
    formatted_content: str  # Texte formaté
    context_item: Optional[Any] = None  # Structure JSON (ContextItem si disponible)
    token_count: int = 0


@dataclass
class CategoryBuildResult:
    """Résultat de construction d'une catégorie."""
    category_key: str
    category_title: str
    element_type: str
    element_label: str
    items: List[ElementBuildResult] = field(default_factory=list)


@dataclass
class ContextBuildResult:
    """Résultat intermédiaire de la construction de contexte."""
    previous_dialogue: Optional[str] = None
    previous_dialogue_tokens: int = 0
    categories: List[CategoryBuildResult] = field(default_factory=list)
    total_tokens: int = 0


class ContextConstructionService:
    """Service de construction du contexte GDD pour les prompts.
    
    Responsabilité unique : construction du contexte à partir des éléments sélectionnés.
    Respecte le principe SRP : uniquement construction de contexte.
    """
    
    def __init__(
        self,
        element_resolver: Optional['ElementResolver'] = None,
        context_field_manager: Optional['ContextFieldManager'] = None,
        context_formatter: Optional['ContextFormatter'] = None,
        context_truncator: Optional['ContextTruncator'] = None,
        previous_dialogue_manager: Optional['PreviousDialogueManager'] = None,
        context_config: Optional[Dict[str, Any]] = None
    ):
        """Initialise le service de construction de contexte.
        
        Args:
            element_resolver: Resolver d'éléments pour résolution par nom.
            context_field_manager: Manager de champs pour configuration.
            context_formatter: Formatter pour formatage des éléments.
            context_truncator: Truncator pour comptage et troncature de tokens.
            previous_dialogue_manager: Manager du dialogue précédent.
            context_config: Configuration de contexte (pour build_context).
        """
        self._element_resolver = element_resolver
        self._context_field_manager = context_field_manager
        self._context_formatter = context_formatter
        self._context_truncator = context_truncator
        self._previous_dialogue_manager = previous_dialogue_manager
        self._context_config = context_config or {}
    
    def _get_field_manager(self) -> 'ContextFieldManager':
        """Retourne le ContextFieldManager, en levant une erreur si non initialisé.
        
        Returns:
            ContextFieldManager instance.
            
        Raises:
            RuntimeError: Si le manager n'est pas initialisé.
        """
        if self._context_field_manager is None:
            raise RuntimeError(
                "ContextFieldManager n'est pas initialisé. "
                "Appelez load_gdd_files() avant d'utiliser les méthodes de construction de contexte."
            )
        return self._context_field_manager
    
    def _count_tokens(self, text: str) -> int:
        """Compte les tokens (délègue à ContextTruncator)."""
        if self._context_truncator is None:
            return 0
        return self._context_truncator.count_tokens(text)

    def _estimate_tokens(self, text: str) -> int:
        """Estimation rapide des tokens sans tiktoken (pour boucles par élément)."""
        if self._context_truncator is None:
            return max(1, len(text) // 4) if text else 0
        return self._context_truncator.estimate_tokens(text)
    
    def _format_element_content(
        self,
        element_data: Dict[str, Any],
        element_type: str,
        category_key: str,
        filtered_fields: Optional[List[str]],
        field_labels_map: Dict[str, str],
        organization_mode: str,
        element_mode: str,
        include_dialogue_type: bool,
        organizer: 'ContextOrganizer'
    ) -> str:
        """Formate le contenu d'un élément (via organizer ou fallback).
        
        Args:
            element_data: Données de l'élément.
            element_type: Type d'élément (character, location, etc.).
            category_key: Clé de catégorie.
            filtered_fields: Champs filtrés à inclure (None pour fallback).
            field_labels_map: Map des labels pour les champs.
            organization_mode: Mode d'organisation.
            element_mode: Mode de l'élément (full/excerpt).
            include_dialogue_type: Inclure le type de dialogue.
            organizer: Instance de ContextOrganizer.
            
        Returns:
            Contenu formaté de l'élément.
        """
        if filtered_fields:
            # Utiliser l'organisateur avec les champs personnalisés
            formatted_content = organizer.organize_context(
                element_data=element_data,
                element_type=element_type,
                fields_to_include=filtered_fields,
                organization_mode=organization_mode,
                field_labels_map=field_labels_map,
                element_mode=element_mode
            )
        else:
            # Fallback: utiliser la méthode standard
            if self._context_formatter is None:
                return ""
            formatted_content = self._context_formatter.format_element(
                element_data,
                category_key,
                3,  # level max
                include_dialogue_type=include_dialogue_type
            )
        
        # Appliquer la troncature si mode excerpt
        if element_mode == "excerpt" and self._context_formatter:
            formatted_content = self._context_formatter._apply_excerpt_truncation(formatted_content, element_type)
        
        return formatted_content
    
    def _build_context_item(
        self,
        element_data: Dict[str, Any],
        element_type: str,
        element_label: str,
        idx: int,
        name: str,
        filtered_fields: Optional[List[str]],
        field_labels_map: Dict[str, str],
        organization_mode: str,
        element_mode: str,
        formatted_content: str,
        token_count: int,
        organizer: 'ContextOrganizer'
    ) -> Optional[Any]:
        """Construit un ContextItem JSON depuis les données formatées.
        
        Args:
            element_data: Données de l'élément.
            element_type: Type d'élément.
            element_label: Label de l'élément (PNJ, LIEU, etc.).
            idx: Index de l'élément dans la catégorie.
            name: Nom réel de l'élément.
            filtered_fields: Champs filtrés (None pour extraire tous les champs).
            field_labels_map: Map des labels.
            organization_mode: Mode d'organisation.
            element_mode: Mode de l'élément.
            formatted_content: Contenu formaté.
            token_count: Nombre de tokens.
            organizer: Instance de ContextOrganizer.
            
        Returns:
            ContextItem ou None si contenu vide.
        """
        if not formatted_content:
            return None
        
        # Si filtered_fields est None, extraire tous les champs disponibles depuis element_data
        fields_to_use = filtered_fields
        if not fields_to_use and element_data:
            # Extraire récursivement tous les champs disponibles
            def extract_all_fields(data: Dict, prefix: str = "") -> List[str]:
                """Extrait récursivement tous les chemins de champs d'un dictionnaire.
                
                Ne retourne QUE les chemins vers des valeurs terminales (pas les dicts/lists intermédiaires)
                pour éviter les doublons entre "Background" et "Background.Context".
                """
                fields = []
                for key, value in data.items():
                    # Ignorer les champs techniques ou vides
                    if key.startswith("_") or value is None:
                        continue
                    
                    field_path = f"{prefix}.{key}" if prefix else key
                    
                    # Si la valeur est un dict, extraire récursivement (sans ajouter field_path lui-même)
                    if isinstance(value, dict):
                        # Ne PAS ajouter le chemin du dict parent, seulement ses enfants
                        fields.extend(extract_all_fields(value, field_path))
                    # Si la valeur est une liste de dicts, extraire depuis chaque élément
                    elif isinstance(value, list):
                        # Vérifier si la liste contient des dicts
                        has_dicts = any(isinstance(item, dict) for item in value)
                        if has_dicts:
                            # Ne PAS ajouter le chemin de la liste, seulement ses enfants
                            for item in value:
                                if isinstance(item, dict):
                                    fields.extend(extract_all_fields(item, field_path))
                        else:
                            # Liste de valeurs simples : ajouter le chemin
                            fields.append(field_path)
                    else:
                        # Valeur terminale (string, int, etc.) : ajouter le chemin
                        fields.append(field_path)
                return fields
            
            fields_to_use = extract_all_fields(element_data)
            logger.debug(f"Champs extraits automatiquement pour {element_type} '{name}': {len(fields_to_use)} champs")
        
        # Toujours créer des sections structurées via organize_context_json
        # (plus de fallback INFORMATIONS)
        context_item = organizer.organize_context_json(
            element_data=element_data,
            element_type=element_type,
            fields_to_include=fields_to_use or [],
            organization_mode=organization_mode,
            field_labels_map=field_labels_map,
            element_mode=element_mode
        )
        
        if context_item:
            # Définir l'ID et le nom
            context_item.id = f"{element_label}_{idx}"
            context_item.name = f"{element_label} {idx}"
            # Ajouter le nom réel dans les métadonnées
            if context_item.metadata:
                context_item.metadata["real_name"] = name
            else:
                context_item.metadata = {"real_name": name}
            context_item.tokenCount = token_count
        
        return context_item
    
    def build_context_core(
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
        """Construit la structure de données commune pour les deux formats de sortie.
        
        Args:
            selected_elements: Éléments sélectionnés par type.
            scene_instruction: Instruction de scène (non utilisée, conservée pour compatibilité).
            field_configs: Configuration des champs par type d'élément.
            organization_mode: Mode d'organisation ("default", "narrative", "minimal").
            max_tokens: Nombre maximum de tokens (pour formatage dialogue précédent).
            include_dialogue_type: Inclure le type de dialogue.
            element_modes: Modes par élément (ex: {"characters": {"PNJ 1": "full"}}).
            build_json_items: Si True, construit aussi les ContextItem JSON.
            
        Returns:
            ContextBuildResult avec toutes les données nécessaires pour les deux formats.
        """
        from services.context_organizer import ContextOrganizer
        
        organizer = ContextOrganizer()
        
        # Contexte du dialogue précédent
        previous_dialogue_formatted = ""
        previous_dialogue_tokens = 0
        if self._previous_dialogue_manager:
            previous_dialogue_formatted = self._previous_dialogue_manager.format_previous_dialogue_for_context(max_tokens)
            previous_dialogue_tokens = self._count_tokens(previous_dialogue_formatted) if previous_dialogue_formatted else 0
        
        # Informations sur le GDD avec champs personnalisés
        prioritized_elements_for_context = (
            self._element_resolver.prioritize_elements(selected_elements)
            if self._element_resolver
            else selected_elements
        )
        
        categories = []
        total_tokens = previous_dialogue_tokens
        
        for category_key, names_list in prioritized_elements_for_context.items():
            if not isinstance(names_list, list) or not names_list:
                continue
            
            category_title = category_key.replace('_', ' ').capitalize()
            # Utiliser ElementResolver pour obtenir type et label
            element_type = (
                self._element_resolver.get_element_type(category_key)
                if self._element_resolver
                else category_key
            )
            element_label = (
                self._element_resolver.get_element_label(category_key)
                if self._element_resolver
                else category_key.upper()
            )
            
            # Récupérer la configuration de champs pour ce type
            fields_to_include = None
            if field_configs and element_type in field_configs:
                fields_to_include = field_configs[element_type]
            
            items = []
            for idx, name in enumerate(names_list, start=1):
                # Résoudre les données de l'élément via ElementResolver
                element_data = (
                    self._element_resolver.resolve_element_data(category_key, name)
                    if self._element_resolver
                    else None
                )
                
                if not element_data:
                    logger.warning(f"Aucune donnée trouvée pour l'élément '{name}' dans la catégorie '{category_key}'.")
                    continue
                
                # Déterminer le mode de cet élément
                element_mode = "full"  # Par défaut
                if element_modes and category_key in element_modes and name in element_modes[category_key]:
                    element_mode = element_modes[category_key][name]
                
                # Gestion des champs via ContextFieldManager
                field_manager = self._get_field_manager()
                fields_for_element = field_manager.get_field_config_for_mode(
                    element_type,
                    element_mode,
                    fields_to_include
                )
                
                formatted_content = ""
                context_item = None
                token_count = 0
                
                # Filtrer les champs avec condition_flag via ContextFieldManager
                filtered_fields = None
                field_labels_map = {}
                
                if fields_for_element:
                    filtered_fields = field_manager.filter_fields_by_condition_flags(
                        element_type,
                        fields_for_element,
                        include_dialogue_type=include_dialogue_type
                    )
                    
                    if not filtered_fields:
                        # Aucun champ après filtrage, passer au suivant
                        continue
                    
                    # Récupérer les labels depuis context_config.json via ContextFieldManager
                    field_labels_map = field_manager.get_field_labels_map(element_type, filtered_fields)
                
                # Formatage (via organizer ou fallback)
                formatted_content = self._format_element_content(
                    element_data=element_data,
                    element_type=element_type,
                    category_key=category_key,
                    filtered_fields=filtered_fields,
                    field_labels_map=field_labels_map,
                    organization_mode=organization_mode,
                    element_mode=element_mode,
                    include_dialogue_type=include_dialogue_type,
                    organizer=organizer
                )
                
                token_count = self._estimate_tokens(formatted_content)
                
                # Construction ContextItem si demandé
                if build_json_items:
                    context_item = self._build_context_item(
                        element_data=element_data,
                        element_type=element_type,
                        element_label=element_label,
                        idx=idx,
                        name=name,
                        filtered_fields=filtered_fields,
                        field_labels_map=field_labels_map,
                        organization_mode=organization_mode,
                        element_mode=element_mode,
                        formatted_content=formatted_content,
                        token_count=token_count,
                        organizer=organizer
                    )
                
                if formatted_content:
                    items.append(ElementBuildResult(
                        name=name,
                        element_data=element_data,
                        element_mode=element_mode,
                        formatted_content=formatted_content,
                        context_item=context_item,
                        token_count=token_count
                    ))
                    total_tokens += token_count
            
            if items:
                categories.append(CategoryBuildResult(
                    category_key=category_key,
                    category_title=category_title,
                    element_type=element_type,
                    element_label=element_label,
                    items=items
                ))
        
        return ContextBuildResult(
            previous_dialogue=previous_dialogue_formatted,
            previous_dialogue_tokens=previous_dialogue_tokens,
            categories=categories,
            total_tokens=total_tokens
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
        """Construit un résumé contextuel avec champs personnalisés et marqueurs explicites.
        
        Le prompt généré inclut des marqueurs explicites (`--- PNJ 1 ---`, `--- LIEU 2 ---`, etc.)
        pour chaque élément, permettant au frontend de parser la structure de manière fiable.
        
        Args:
            selected_elements: Éléments sélectionnés par type.
            scene_instruction: Instruction de scène (non utilisée ici, conservée pour compatibilité).
            field_configs: Configuration des champs par type d'élément.
            organization_mode: Mode d'organisation ("default", "narrative", "minimal").
            max_tokens: Nombre maximum de tokens.
            include_dialogue_type: Inclure le type de dialogue.
            element_modes: Modes par élément (ex: {"characters": {"PNJ 1": "full"}}).
            include_element_markers: Inclure les marqueurs explicites pour chaque élément.
            
        Returns:
            Résumé du contexte formaté avec marqueurs explicites.
        """
        # Construire la structure commune
        build_result = self.build_context_core(
            selected_elements=selected_elements,
            scene_instruction=scene_instruction,
            field_configs=field_configs,
            organization_mode=organization_mode,
            max_tokens=max_tokens,
            include_dialogue_type=include_dialogue_type,
            element_modes=element_modes,
            build_json_items=False
        )
        
        # Formater en texte avec marqueurs
        context_parts = []
        
        # Contexte du dialogue précédent
        if build_result.previous_dialogue:
            context_parts.append(build_result.previous_dialogue)
            logger.info(f"Historique du dialogue précédent ajouté au contexte.")
        
        # Informations sur le GDD avec marqueurs
        for category in build_result.categories:
            context_parts.append(f"\n--- {category.category_title.upper()} ---")
            
            for idx, item in enumerate(category.items, start=1):
                # Ajouter le marqueur explicite AVANT le contenu de l'élément si demandé
                if include_element_markers:
                    context_parts.append(f"--- {category.element_label} {idx} ---")
                context_parts.append(item.formatted_content)
        
        # Construction finale
        context_summary = "\n".join(context_parts).strip()
        final_tokens = self._count_tokens(context_summary)
        
        if final_tokens > max_tokens and self._context_truncator:
            context_summary = self._context_truncator.truncate_context(context_summary, max_tokens)
        
        return context_summary
    
    def build_context_json(
        self,
        selected_elements: dict[str, list[str]],
        scene_instruction: str,
        field_configs: Optional[Dict[str, List[str]]] = None,
        organization_mode: str = "default",
        max_tokens: int = 70000,
        include_dialogue_type: bool = True,
        element_modes: Optional[Dict[str, Dict[str, str]]] = None
    ) -> 'PromptStructure':
        """Construit un contexte structuré en JSON avec champs personnalisés.
        
        Args:
            selected_elements: Éléments sélectionnés par type.
            scene_instruction: Instruction de scène.
            field_configs: Configuration des champs par type d'élément.
            organization_mode: Mode d'organisation ("default", "narrative", "minimal").
            max_tokens: Nombre maximum de tokens.
            include_dialogue_type: Inclure le type de dialogue.
            element_modes: Modes par élément (ex: {"characters": {"PNJ 1": "full"}}).
            
        Returns:
            PromptStructure avec sections et catégories organisées.
        """
        from models.prompt_structure import (
            PromptStructure, PromptSection, ContextCategory, PromptMetadata
        )
        
        # Construire la structure commune avec ContextItem JSON
        build_result = self.build_context_core(
            selected_elements=selected_elements,
            scene_instruction=scene_instruction,
            field_configs=field_configs,
            organization_mode=organization_mode,
            max_tokens=max_tokens,
            include_dialogue_type=include_dialogue_type,
            element_modes=element_modes,
            build_json_items=True
        )
        
        sections = []
        
        # Contexte du dialogue précédent
        if build_result.previous_dialogue:
            sections.append(PromptSection(
                type="context",
                title="Dialogue précédent",
                content=build_result.previous_dialogue,
                tokenCount=build_result.previous_dialogue_tokens
            ))
        
        # Construire les catégories JSON
        categories = []
        for category in build_result.categories:
            items = []
            for item in category.items:
                if item.context_item:
                    items.append(item.context_item)
            
            if items:
                category_token_count = sum(item.tokenCount or 0 for item in items)
                categories.append(ContextCategory(
                    type=category.category_key,
                    title=category.category_title.upper(),
                    items=items,
                    tokenCount=category_token_count
                ))
        
        # Créer la section de contexte
        if categories:
            context_token_count = sum(cat.tokenCount or 0 for cat in categories)
            sections.append(PromptSection(
                type="context",
                title="CONTEXTE GÉNÉRAL DE LA SCÈNE",
                content="",  # Le contenu sera généré par sérialisation
                tokenCount=context_token_count,
                categories=categories
            ))
        
        # Calculer le total de tokens
        total_tokens = sum(section.tokenCount or 0 for section in sections)
        
        # Créer la structure complète
        metadata = PromptMetadata(
            totalTokens=total_tokens,
            generatedAt=datetime.now().isoformat(),
            organizationMode=organization_mode
        )
        
        return PromptStructure(
            sections=sections,
            metadata=metadata
        )
    
    def build_context(
        self,
        selected_elements: dict[str, list[str]],
        scene_instruction: str,
        max_tokens: int = 70000,
        include_dialogue_type: bool = True
    ) -> str:
        """Construit un résumé contextuel basé sur les éléments sélectionnés et une instruction de scène.
        
        Utilise le mode "narrative" par défaut pour organiser le contexte en sections logiques.
        Extrait automatiquement les champs depuis context_config.json (niveaux 1-3).
        
        Args:
            selected_elements: Éléments sélectionnés par type.
            scene_instruction: Instruction de scène (non utilisée ici, conservée pour compatibilité).
            max_tokens: Nombre maximum de tokens.
            include_dialogue_type: Inclure le type de dialogue.
            
        Returns:
            Résumé du contexte formaté.
        """
        logger.info(f"[build_context] Personnages reçus dans selected_elements: {selected_elements.get('characters', [])}")
        logger.info(f"[build_context] Lieux reçus dans selected_elements: {selected_elements.get('locations', [])}")
        
        # Extraire les champs depuis context_config.json pour chaque type d'élément
        # (niveaux 1-3, en respectant include_dialogue_type)
        field_configs = {}
        prioritized_elements = (
            self._element_resolver.prioritize_elements(selected_elements)
            if self._element_resolver
            else selected_elements
        )
        
        for category_key in prioritized_elements.keys():
            element_type = (
                self._element_resolver.get_element_type(category_key)
                if self._element_resolver
                else category_key
            )
            config_for_type = self._context_config.get(element_type.lower(), {})
            fields_to_extract = []
            
            # Extraire les champs des niveaux 1-3
            for level in range(1, 4):
                for field_config in config_for_type.get(str(level), []):
                    path = field_config.get("path")
                    if not path:
                        continue
                    # Vérifier le condition_flag pour include_dialogue_type
                    condition_flag = field_config.get("condition_flag")
                    if condition_flag == "include_dialogue_type" and not include_dialogue_type:
                        continue
                    fields_to_extract.append(path)
            
            if fields_to_extract:
                field_configs[element_type] = fields_to_extract
        
        # Utiliser build_context_with_custom_fields avec les champs extraits
        # Note: build_context() n'ajoute pas de marqueurs d'éléments (compatibilité)
        return self.build_context_with_custom_fields(
            selected_elements=selected_elements,
            scene_instruction=scene_instruction,
            field_configs=field_configs if field_configs else None,
            organization_mode="narrative",
            max_tokens=max_tokens,
            include_dialogue_type=include_dialogue_type,
            element_modes=None,
            include_element_markers=False
        )

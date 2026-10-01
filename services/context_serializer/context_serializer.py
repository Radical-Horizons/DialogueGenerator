"""Sérialisation du contexte en XML et texte - Façade principale.

Ce module fournit la classe ContextSerializer qui orchestre la sérialisation
des structures de contexte en différents formats (XML, texte) en déléguant
aux composants spécialisés.
"""
import xml.etree.ElementTree as ET
import logging
from typing import Optional, TYPE_CHECKING

from services.context_serializer.field_normalizer import FieldNormalizer
from services.context_serializer.section_mapper import SectionMapper
from services.context_serializer.json_parser import JsonParser
from services.context_serializer.xml_element_builder import XmlElementBuilder
from services.context_serializer.informations_parser import InformationsSectionParser
from services.context_serializer.text_serializer import TextSerializer

if TYPE_CHECKING:
    from models.prompt_structure import PromptStructure

logger = logging.getLogger(__name__)


class ContextSerializer:
    """Sérialise une structure PromptStructure en XML ou texte formaté.
    
    Classe façade qui orchestre la sérialisation en déléguant aux composants
    spécialisés. Maintient la rétrocompatibilité avec l'API existante.
    """
    
    # Exposer les mappings pour rétrocompatibilité
    SECTION_TAG_MAP = SectionMapper.SECTION_TAG_MAP
    METADATA_FIELD_MAP = SectionMapper.METADATA_FIELD_MAP
    
    def __init__(
        self,
        field_normalizer: Optional[FieldNormalizer] = None,
        section_mapper: Optional[SectionMapper] = None,
        json_parser: Optional[JsonParser] = None,
        xml_builder: Optional[XmlElementBuilder] = None,
        informations_parser: Optional[InformationsSectionParser] = None,
        text_serializer: Optional[TextSerializer] = None
    ):
        """Initialise le serializer avec ses dépendances.
        
        Permet l'injection de dépendances pour les tests. Si None, des instances
        par défaut seront créées.
        
        Args:
            field_normalizer: Normaliseur de champs.
            section_mapper: Mapper de sections.
            json_parser: Parser JSON.
            xml_builder: Builder XML.
            informations_parser: Parser de sections INFORMATIONS.
            text_serializer: Sérialiseur texte.
        """
        # Initialiser les composants
        self._field_normalizer = field_normalizer or FieldNormalizer()
        self._section_mapper = section_mapper or SectionMapper(self._field_normalizer)
        self._json_parser = json_parser or JsonParser()
        self._xml_builder = xml_builder or XmlElementBuilder(self._field_normalizer)
        self._informations_parser = informations_parser or InformationsSectionParser(
            self._section_mapper,
            self._field_normalizer,
            self._xml_builder,
            self._json_parser
        )
        self._text_serializer = text_serializer or TextSerializer()
    
    # Méthodes publiques pour rétrocompatibilité avec l'ancienne API
    
    def get_section_tag(self, section_title: str) -> tuple[str, bool]:
        """Détermine le tag XML pour une section selon son titre.
        
        Délègue à SectionMapper pour rétrocompatibilité.
        
        Args:
            section_title: Titre de la section.
            
        Returns:
            Tuple (tag_xml, is_generic).
        """
        return self._section_mapper.get_section_tag(section_title)
    
    def categorize_metadata_field(self, field_label: str) -> tuple[str, str]:
        """Catégorise un champ métadonnée.
        
        Délègue à SectionMapper pour rétrocompatibilité.
        
        Args:
            field_label: Label du champ.
            
        Returns:
            Tuple (category, tag).
        """
        return self._section_mapper.categorize_field(field_label)
    
    def parse_json_content(self, content: str):
        """Détecte et parse le contenu JSON si présent.
        
        Délègue à JsonParser pour rétrocompatibilité.
        
        Args:
            content: Contenu à analyser.
            
        Returns:
            Dict ou List si JSON valide, None sinon.
        """
        return self._json_parser.parse(content)
    
    def dict_to_xml_elements(
        self, 
        parent_elem: ET.Element, 
        data: dict, 
        tag_mapping: Optional[dict] = None
    ) -> None:
        """Convertit un dict en éléments XML récursivement.
        
        Délègue à XmlElementBuilder pour rétrocompatibilité.
        
        Args:
            parent_elem: Élément XML parent.
            data: Dictionnaire à convertir.
            tag_mapping: Mapping optionnel de clés vers tags.
        """
        self._xml_builder.build_from_dict(parent_elem, data, tag_mapping)
    
    def parse_informations_section(
        self, 
        content: str, 
        parent_elem: ET.Element, 
        already_processed_fields: Optional[set] = None
    ) -> None:
        """Parse une section "INFORMATIONS" et crée une structure XML hiérarchique.
        
        Délègue à InformationsSectionParser pour rétrocompatibilité.
        
        Args:
            content: Contenu de la section.
            parent_elem: Élément XML parent.
            already_processed_fields: Champs déjà traités.
        """
        self._informations_parser.parse(content, parent_elem, already_processed_fields)
    
    def serialize_to_text(self, prompt_structure: 'PromptStructure') -> str:
        """Sérialise une structure PromptStructure en texte formaté pour le LLM.
        
        Args:
            prompt_structure: Structure JSON du prompt.
            
        Returns:
            Texte formaté avec marqueurs --- ... --- pour compatibilité.
        """
        return self._text_serializer.serialize(prompt_structure)
    
    def serialize_to_xml(self, prompt_structure: 'PromptStructure') -> ET.Element:
        """Sérialise une structure PromptStructure en XML hiérarchique pour le LLM.
        
        Format XML avec tags sémantiques :
        - <context> : conteneur principal
        - <characters>, <locations>, <items>, etc. : catégories
        - <character>, <location>, etc. : items individuels
        
        Args:
            prompt_structure: Structure JSON du prompt.
            
        Returns:
            Élément XML racine <context> (sans déclaration XML, sans indentation).
            L'indentation sera gérée par create_xml_document() dans prompt_engine.py.
            
        Raises:
            ValueError: Si la structure est invalide ou si la sérialisation échoue.
        """
        from models.prompt_structure import PromptSection, ContextCategory, ContextItem
        from utils.xml_utils import sanitize_xml_text
        
        try:
            # Créer l'élément racine
            root = ET.Element("context")
            
            # Mapper les types de catégories vers les tags XML
            category_tag_map = {
                "characters": "characters",
                "locations": "locations",
                "items": "items",
                "species": "species",
                "communities": "communities",
                "quests": "quests",
            }
            
            # Mapper les types d'items vers les tags XML
            item_tag_map = {
                "characters": "character",
                "locations": "location",
                "items": "item",
                "species": "species",
                "communities": "community",
                "quests": "quest",
            }
            
            # Parcourir les sections du prompt
            for section in prompt_structure.sections:
                if section.type == "context" and section.categories:
                    # Parcourir les catégories de contexte
                    for category in section.categories:
                        self._process_category(category, root, category_tag_map, item_tag_map)
            
            # Retourner directement l'élément XML (sans indentation, sans conversion en string)
            return root
        except ET.ParseError as e:
            logger.error(
                f"Erreur de parsing XML lors de la sérialisation du contexte: {e}. "
                f"Nombre de sections dans prompt_structure: {len(prompt_structure.sections) if prompt_structure.sections else 0}.",
                exc_info=True
            )
            raise ValueError(f"Erreur de parsing XML lors de la sérialisation: {e}") from e
        except Exception as e:
            # Logger avec contexte supplémentaire
            sections_info = "N/A"
            if prompt_structure and prompt_structure.sections:
                sections_info = f"{len(prompt_structure.sections)} sections"
                context_sections = [s for s in prompt_structure.sections if s.type == "context"]
                if context_sections:
                    categories_info = []
                    for cs in context_sections:
                        if cs.categories:
                            categories_info.extend([f"{cat.type}({len(cat.items)} items)" for cat in cs.categories])
                    if categories_info:
                        sections_info += f", catégories: {', '.join(categories_info[:5])}"
            
            logger.error(
                f"Erreur lors de la sérialisation du contexte en XML: {e}. "
                f"Type d'erreur: {type(e).__name__}. Structure: {sections_info}.",
                exc_info=True
            )
            raise ValueError(f"Erreur lors de la sérialisation du contexte en XML: {e}") from e
    
    def _process_category(
        self, 
        category, 
        root: ET.Element, 
        category_tag_map: dict, 
        item_tag_map: dict
    ) -> None:
        """Traite une catégorie de contexte et l'ajoute au root XML.
        
        Args:
            category: Catégorie à traiter.
            root: Élément XML racine.
            category_tag_map: Mapping types → tags catégories.
            item_tag_map: Mapping types → tags items.
        """
        from utils.xml_utils import sanitize_xml_text
        
        category_type = category.type.lower()
        category_tag = category_tag_map.get(category_type, "category")
        item_tag = item_tag_map.get(category_type, "item")
        
        # Créer l'élément de catégorie
        category_elem = ET.SubElement(root, category_tag)
        
        # Parcourir les items de la catégorie
        for item in category.items:
            self._process_item(item, category_elem, item_tag)
    
    def _process_item(self, item, category_elem: ET.Element, item_tag: str) -> None:
        """Traite un item et l'ajoute à la catégorie XML.
        
        Args:
            item: Item à traiter.
            category_elem: Élément XML de la catégorie.
            item_tag: Tag XML à utiliser pour l'item.
        """
        from utils.xml_utils import sanitize_xml_text
        
        # Créer l'élément item
        item_elem = ET.SubElement(category_elem, item_tag)
        
        # Le nom de la fiche en attribut. Il était lu sous `metadata["name"]`, clé que
        # personne n'écrit (le service pose `real_name`) : le modèle recevait des
        # blocs <character> anonymes, sans savoir lequel était le locuteur.
        metadata = item.metadata or {}
        name = metadata.get("name") or getattr(item, "name", None) or metadata.get("real_name")
        if name:
            item_elem.set("name", sanitize_xml_text(str(name)))
        
        # PREMIER PASSAGE : Collecter les champs déjà traités dans les sections structurées
        already_processed_fields = self._collect_processed_fields(item)
        
        # DEUXIÈME PASSAGE : Sérialiser les sections en XML
        for item_section in item.sections:
            self._serialize_item_section(item_section, item_elem, already_processed_fields)
    
    def _collect_processed_fields(self, item) -> set[str]:
        """Collecte les champs déjà traités dans les sections structurées.
        
        Args:
            item: Item dont on veut collecter les champs.
            
        Returns:
            Set de noms de champs normalisés.
        """
        already_processed_fields: set[str] = set()
        for item_section in item.sections:
            section_title = item_section.title or ""
            section_title_lower = section_title.lower()
            
            # Ignorer les sections "INFORMATIONS" ou "AUTRES INFORMATIONS" lors de la collecte
            if not section_title or section_title_lower in ("informations", "autres informations"):
                continue
            
            # Extraire les champs de cette section structurée
            structured_fields = self._informations_parser.extract_structured_fields(item_section)
            already_processed_fields.update(structured_fields)
        
        return already_processed_fields
    
    def _serialize_item_section(
        self, 
        item_section, 
        item_elem: ET.Element, 
        already_processed_fields: set[str]
    ) -> None:
        """Sérialise une section d'item en XML.
        
        Vérifie d'abord raw_content (structure Python) avant content (texte).
        
        Args:
            item_section: Section à sérialiser.
            item_elem: Élément XML de l'item.
            already_processed_fields: Champs déjà traités.
        """
        from utils.xml_utils import sanitize_xml_text
        section_title = item_section.title or ""
        section_title_lower = section_title.lower()
        
        # PRIORITÉ 1: Vérifier si raw_content existe (structure Python directe)
        if hasattr(item_section, 'raw_content') and item_section.raw_content is not None:
            # Sérialiser directement depuis raw_content (pas de re-parse JSON)
            self._serialize_raw_content_section(item_section, item_elem, section_title, already_processed_fields)
            return
        
        # PRIORITÉ 2: Fallback sur content (texte) - ancien format
        # Détecter les sections "INFORMATIONS" qui doivent être déstructurées
        if not section_title or section_title_lower in ("informations", "autres informations"):
            # Parser la section INFORMATIONS en structure XML hiérarchique
            self._informations_parser.parse(
                item_section.content, 
                item_elem,
                already_processed_fields=already_processed_fields
            )
            return
        
        # Déterminer le tag de section selon le titre
        tag_xml, is_generic = self._section_mapper.get_section_tag(item_section.title)
        
        # Vérifier si le contenu est du JSON à déstructurer
        json_data = self._json_parser.parse(item_section.content)
        
        if json_data:
            logger.debug(f"JSON détecté pour section '{section_title}' (tag: {tag_xml}), déstructuration en cours...")
            self._serialize_json_section(item_section, item_elem, tag_xml, json_data)
        else:
            logger.debug(f"Pas de JSON détecté pour section '{section_title}' (tag: {tag_xml})")
            self._serialize_text_section(item_section, item_elem, tag_xml, is_generic)
    
    def _serialize_json_section(
        self, 
        item_section, 
        item_elem: ET.Element, 
        tag_xml: str, 
        json_data
    ) -> None:
        """Sérialise une section contenant du JSON.
        
        Args:
            item_section: Section à sérialiser.
            item_elem: Élément XML de l'item.
            tag_xml: Tag XML à utiliser.
            json_data: Données JSON parsées.
        """
        from utils.xml_utils import sanitize_xml_text
        
        # Déstructurer le JSON en éléments XML
        section_elem = ET.SubElement(item_elem, tag_xml)
        
        # Mapping spécial pour certaines sections
        tag_mapping = self._get_tag_mapping(tag_xml)
        
        # Gérer les dicts et les listes
        try:
            if isinstance(json_data, dict):
                self._xml_builder.build_from_dict(section_elem, json_data, tag_mapping)
            elif isinstance(json_data, list):
                # Pour les listes, créer un élément pour chaque item
                for item in json_data:
                    if isinstance(item, dict):
                        self._xml_builder.build_from_dict(section_elem, item, tag_mapping)
                    else:
                        item_elem_child = ET.SubElement(section_elem, "item")
                        item_elem_child.text = sanitize_xml_text(str(item))
        except Exception as e:
            # En cas d'erreur, logger et ajouter le contenu brut
            logger.warning(f"Erreur lors de la déstructuration JSON pour section '{item_section.title}': {e}")
            section_elem.text = sanitize_xml_text(item_section.content)
    
    def _serialize_raw_content_section(
        self, 
        item_section, 
        item_elem: ET.Element, 
        section_title: str,
        already_processed_fields: set[str]
    ) -> None:
        """Sérialise une section depuis raw_content (structure Python directe).
        
        Nouveau chemin optimisé : pas de conversion texte → re-parse.
        
        Args:
            item_section: Section avec raw_content.
            item_elem: Élément XML de l'item.
            section_title: Titre de la section.
            already_processed_fields: Champs déjà traités.
        """
        from utils.xml_utils import sanitize_xml_text
        
        raw_content = item_section.raw_content
        
        # Déterminer le tag de section selon le titre
        if section_title:
            tag_xml, is_generic = self._section_mapper.get_section_tag(section_title)
        else:
            # Section sans titre : sérialiser directement les champs sous l'item
            # (pas de wrapper supplémentaire)
            if isinstance(raw_content, dict):
                for label, value in raw_content.items():
                    # Normaliser le label pour XML
                    field_tag = self._field_normalizer.normalize_for_xml_tag(label)
                    field_elem = ET.SubElement(item_elem, field_tag)
                    
                    # Sérialiser la valeur
                    if isinstance(value, (dict, list)):
                        self._xml_builder.build_from_dict(field_elem, value if isinstance(value, dict) else {"items": value}, None)
                    else:
                        field_elem.text = sanitize_xml_text(str(value))
            return
        
        # Créer l'élément de section
        section_elem = ET.SubElement(item_elem, tag_xml)
        
        # Si c'est un tag générique, ajouter l'attribut title
        if is_generic and section_title:
            section_elem.set("title", sanitize_xml_text(section_title))
        
        # Sérialiser le contenu
        tag_mapping = self._get_tag_mapping(tag_xml)
        
        try:
            if isinstance(raw_content, dict):
                self._xml_builder.build_from_dict(section_elem, raw_content, tag_mapping)
            elif isinstance(raw_content, list):
                for item in raw_content:
                    if isinstance(item, dict):
                        self._xml_builder.build_from_dict(section_elem, item, tag_mapping)
                    else:
                        item_elem_child = ET.SubElement(section_elem, "item")
                        item_elem_child.text = sanitize_xml_text(str(item))
            else:
                # Valeur simple
                section_elem.text = sanitize_xml_text(str(raw_content))
        except Exception as e:
            logger.warning(f"Erreur lors de la sérialisation de raw_content pour section '{section_title}': {e}")
            # Fallback: convertir en texte
            section_elem.text = sanitize_xml_text(str(raw_content))
    
    def _serialize_text_section(
        self, 
        item_section, 
        item_elem: ET.Element, 
        tag_xml: str, 
        is_generic: bool
    ) -> None:
        """Sérialise une section contenant du texte.
        
        Args:
            item_section: Section à sérialiser.
            item_elem: Élément XML de l'item.
            tag_xml: Tag XML à utiliser.
            is_generic: Si True, ajouter un attribut title.
        """
        from utils.xml_utils import sanitize_xml_text
        
        # Contenu texte normal
        section_elem = ET.SubElement(item_elem, tag_xml)
        
        # Si c'est un tag générique, ajouter l'attribut title
        if is_generic:
            section_elem.set("title", sanitize_xml_text(item_section.title))
        
        # Ajouter le contenu (échappé)
        section_elem.text = sanitize_xml_text(item_section.content)
    
    def _get_tag_mapping(self, tag_xml: str) -> dict:
        """Retourne le mapping de tags pour une section donnée.
        
        Args:
            tag_xml: Tag XML de la section.
            
        Returns:
            Dictionnaire de mapping clé → tag XML.
        """
        if tag_xml == "characterization":
            return {
                "Faiblesse": "weakness",
                "Compulsion": "compulsion",
                "Désir": "desire",
                "Désir Principal": "desire",
                "Weakness": "weakness",
                "Desire": "desire",
            }
        elif tag_xml == "summary" or tag_xml == "introduction":
            return {
                "Résumé de la fiche": "summary",
                "Résumé": "summary",
            }
        elif tag_xml == "background":
            return {
                "Contexte": "context",
                "Apparence": "appearance",
                "Relations": "relationships",
                "Centres d'intérêt": "interests",
            }
        elif tag_xml == "narrative_arcs":
            return {
                "Actions concrètes": "concrete_actions",
                "Quêtes annexes": "side_quests",
                "Conséquences de la Révélation": "revelation_consequences",
            }
        return {}


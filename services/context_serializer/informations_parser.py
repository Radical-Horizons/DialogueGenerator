"""Parsing des sections INFORMATIONS/AUTRES INFORMATIONS.

Ce module gère le parsing complexe des sections INFORMATIONS qui contiennent
des champs métadonnées au format "Label: Valeur", avec déduplication des
champs déjà présents dans les sections structurées.
"""
import xml.etree.ElementTree as ET
import logging
from typing import Any, Dict, Optional, Set, TYPE_CHECKING

from utils.xml_utils import sanitize_xml_text
from services.context_serializer.field_normalizer import FieldNormalizer
from services.context_serializer.section_mapper import SectionMapper
from services.context_serializer.xml_element_builder import XmlElementBuilder
from services.context_serializer.json_parser import JsonParser

if TYPE_CHECKING:
    from models.prompt_structure import ItemSection

logger = logging.getLogger(__name__)


class InformationsSectionParser:
    """Parse les sections INFORMATIONS/AUTRES INFORMATIONS en XML hiérarchique.
    
    Gère:
    - Parsing du format "Label: Valeur" ligne par ligne
    - Catégorisation des champs (identity/metadata/relationships)
    - Déduplication des champs déjà présents dans sections structurées
    - Extraction récursive des champs depuis JSON/dicts
    """
    
    def __init__(
        self,
        section_mapper: Optional[SectionMapper] = None,
        field_normalizer: Optional[FieldNormalizer] = None,
        xml_builder: Optional[XmlElementBuilder] = None,
        json_parser: Optional[JsonParser] = None
    ):
        """Initialise le parser avec ses dépendances.
        
        Args:
            section_mapper: Mapper pour catégoriser les champs.
            field_normalizer: Normaliseur pour comparer les champs.
            xml_builder: Builder pour créer les éléments XML.
            json_parser: Parser pour détecter le JSON dans les sections.
        """
        self._field_normalizer = field_normalizer or FieldNormalizer()
        self._section_mapper = section_mapper or SectionMapper(self._field_normalizer)
        self._xml_builder = xml_builder or XmlElementBuilder(self._field_normalizer)
        self._json_parser = json_parser or JsonParser()
    
    def parse(
        self, 
        content: str, 
        parent_elem: ET.Element, 
        already_processed_fields: Optional[Set[str]] = None
    ) -> None:
        """Parse une section "INFORMATIONS" et crée une structure XML hiérarchique.
        
        Parse le format "Label: Valeur\nLabel: Valeur" et crée des éléments XML
        organisés par catégorie (identity, metadata, relationships).
        
        IMPORTANT : Ignore les champs déjà traités dans les sections structurées
        pour éviter les duplications.
        
        Args:
            content: Contenu de la section "INFORMATIONS" (format texte).
            parent_elem: Élément XML parent où ajouter la structure parsée.
            already_processed_fields: Set de noms de champs normalisés déjà traités
                                     dans des sections structurées (optionnel).
        """
        if not content or not content.strip():
            return
        
        if already_processed_fields is None:
            already_processed_fields = set()
        
        # Structures pour organiser les champs par catégorie
        identity_elem = None
        metadata_elem = None
        relationships_elem = None
        
        # Parser ligne par ligne
        lines = content.split('\n')
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Détecter le format "Label: Valeur"
            if ':' in line:
                parts = line.split(':', 1)
                if len(parts) == 2:
                    field_label = parts[0].strip()
                    field_value = parts[1].strip()
                    
                    if field_label and field_value:
                        # Normaliser le nom du champ pour comparaison
                        normalized_field = self._field_normalizer.normalize_for_comparison(field_label)
                        
                        # Vérifier si la valeur est du JSON à déstructurer
                        json_in_value = self._json_parser.parse(field_value)
                        # Ignorer si le champ a déjà été traité dans une section structurée
                        if normalized_field in already_processed_fields:
                            logger.debug(
                                f"Champ '{field_label}' ignoré dans AUTRES INFORMATIONS "
                                f"(déjà traité dans une section structurée)"
                            )
                            continue
                        
                        # Catégoriser le champ pour déterminer où créer l'élément
                        category, tag = self._section_mapper.categorize_field(field_label)
                        
                        # Ignorer si c'est une section structurée (None indique qu'il faut ignorer)
                        if category is None or tag is None:
                            logger.debug(
                                f"Champ '{field_label}' ignoré dans INFORMATIONS "
                                f"(section structurée, sera créée séparément)"
                            )
                            continue
                        
                        # Si la valeur contient du JSON, déstructurer au lieu d'ajouter comme texte brut
                        if json_in_value:
                            # Vérifier si ce champ correspond à une section structurée
                            # Si oui, créer une section séparée au lieu de l'ajouter dans metadata
                            section_tag, _ = self._section_mapper.get_section_tag(field_label)
                            if section_tag not in ("informations", "section", "metadata"):
                                # C'est une section structurée (introduction, caracterisation, background, arcs_narratifs, etc.)
                                # Créer une section séparée directement sous parent_elem (pas dans metadata)
                                section_elem = ET.SubElement(parent_elem, section_tag)
                                if isinstance(json_in_value, dict):
                                    self._xml_builder.build_from_dict(section_elem, json_in_value, None)
                                else:
                                    section_elem.text = sanitize_xml_text(field_value)
                                continue  # Ne pas ajouter dans metadata
                            
                            # Sinon, traitement normal : créer l'élément de catégorie si nécessaire
                            if category == "identity":
                                if identity_elem is None:
                                    identity_elem = ET.SubElement(parent_elem, "identity")
                                target_elem = identity_elem
                            elif category == "relationships":
                                if relationships_elem is None:
                                    relationships_elem = ET.SubElement(parent_elem, "relationships")
                                target_elem = relationships_elem
                            else:  # metadata
                                if metadata_elem is None:
                                    metadata_elem = ET.SubElement(parent_elem, "metadata")
                                target_elem = metadata_elem
                            
                            # Créer l'élément pour ce champ et déstructurer le JSON
                            field_elem = ET.SubElement(target_elem, tag)
                            if isinstance(json_in_value, dict):
                                self._xml_builder.build_from_dict(field_elem, json_in_value, None)
                            else:
                                field_elem.text = sanitize_xml_text(field_value)
                        else:
                            # Pas de JSON, traitement normal
                            # Créer l'élément de catégorie si nécessaire
                            if category == "identity":
                                if identity_elem is None:
                                    identity_elem = ET.SubElement(parent_elem, "identity")
                                target_elem = identity_elem
                            elif category == "relationships":
                                if relationships_elem is None:
                                    relationships_elem = ET.SubElement(parent_elem, "relationships")
                                target_elem = relationships_elem
                            else:  # metadata
                                if metadata_elem is None:
                                    metadata_elem = ET.SubElement(parent_elem, "metadata")
                                target_elem = metadata_elem
                            
                            # Créer l'élément pour ce champ
                            field_elem = ET.SubElement(target_elem, tag)
                            field_elem.text = sanitize_xml_text(field_value)
    
    def extract_fields_from_dict(self, data: Dict[str, Any]) -> Set[str]:
        """Extrait récursivement tous les noms de champs d'un dictionnaire.
        
        Args:
            data: Dictionnaire à analyser.
            
        Returns:
            Set de noms de champs normalisés extraits récursivement.
        """
        fields = set()
        for key, value in data.items():
            # Ajouter la clé elle-même
            normalized_key = self._field_normalizer.normalize_for_comparison(key)
            fields.add(normalized_key)
            # Si la valeur est un dict, extraire récursivement
            if isinstance(value, dict):
                fields.update(self.extract_fields_from_dict(value))
            # Si la valeur est une liste, extraire depuis chaque élément dict
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        fields.update(self.extract_fields_from_dict(item))
        return fields
    
    def extract_structured_fields(self, item_section: 'ItemSection') -> Set[str]:
        """Extrait les noms de champs d'une section structurée (pas "AUTRES INFORMATIONS").
        
        Args:
            item_section: Section de l'item à analyser.
            
        Returns:
            Set de noms de champs normalisés extraits de la section.
        """
        fields = set()
        section_title = item_section.title or ""
        section_title_lower = section_title.lower()
        
        # Ignorer les sections "INFORMATIONS" ou "AUTRES INFORMATIONS"
        if not section_title or section_title_lower in ("informations", "autres informations"):
            return fields
        
        content = item_section.content or ""
        
        # Si le contenu est du JSON, extraire les clés récursivement
        json_data = self._json_parser.parse(content)
        if json_data:
            if isinstance(json_data, dict):
                fields.update(self.extract_fields_from_dict(json_data))
            elif isinstance(json_data, list):
                for item in json_data:
                    if isinstance(item, dict):
                        fields.update(self.extract_fields_from_dict(item))
        else:
            # Si le contenu est du texte formaté "Label: Valeur", extraire les labels
            lines = content.split('\n')
            for line in lines:
                line = line.strip()
                if ':' in line:
                    parts = line.split(':', 1)
                    if len(parts) == 2:
                        field_label = parts[0].strip()
                        # Ignorer les marqueurs de section comme "--- CARACTÉRISATION ---"
                        if field_label and not field_label.startswith('---'):
                            fields.add(self._field_normalizer.normalize_for_comparison(field_label))
        
        return fields


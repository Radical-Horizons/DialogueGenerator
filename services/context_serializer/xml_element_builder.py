"""Construction d'éléments XML à partir de structures Python.

Ce module fournit des utilitaires pour convertir des dictionnaires et listes
Python en éléments XML avec échappement approprié.
"""
import xml.etree.ElementTree as ET
import logging
from typing import Any, Dict, Optional

from utils.xml_utils import sanitize_xml_text
from services.context_serializer.field_normalizer import FieldNormalizer

logger = logging.getLogger(__name__)


class XmlElementBuilder:
    """Construit des éléments XML à partir de dicts/listes Python.
    
    Gère la conversion récursive de structures de données Python en éléments XML,
    avec gestion de l'échappement et des mappings de tags personnalisés.
    """
    
    def __init__(self, field_normalizer: Optional[FieldNormalizer] = None):
        """Initialise le builder avec un normaliseur de champs.
        
        Args:
            field_normalizer: Instance de FieldNormalizer à utiliser pour
                            créer des tags XML valides.
                            Si None, une nouvelle instance sera créée.
        """
        self._field_normalizer = field_normalizer or FieldNormalizer()
    
    def build_from_dict(
        self, 
        parent_elem: ET.Element, 
        data: Dict[str, Any], 
        tag_mapping: Optional[Dict[str, str]] = None
    ) -> None:
        """Convertit un dict en éléments XML récursivement.
        
        Pour chaque clé-valeur du dictionnaire:
        - Si la valeur est un dict: crée un élément et récurse
        - Si la valeur est une list: crée un élément par item
        - Sinon: crée un élément avec le texte de la valeur
        
        Args:
            parent_elem: Élément XML parent où ajouter les éléments.
            data: Dictionnaire à convertir.
            tag_mapping: Mapping optionnel de clés vers tags XML 
                        (ex: {"Faiblesse": "weakness"}).
                        
        Example:
            >>> builder = XmlElementBuilder()
            >>> parent = ET.Element("root")
            >>> data = {"name": "Test", "age": 30}
            >>> builder.build_from_dict(parent, data)
            >>> ET.tostring(parent, encoding='unicode')
            '<root><name>Test</name><age>30</age></root>'
        """
        if tag_mapping is None:
            tag_mapping = {}
        
        for key, value in data.items():
            # Mapper la clé vers un tag sémantique si disponible
            tag = tag_mapping.get(key)
            if tag is None:
                # Utiliser le normaliseur pour créer un tag valide
                tag = self._field_normalizer.normalize_for_xml_tag(key)
            
            # Validation finale du tag
            if not tag or (tag[0].isdigit() and not tag.startswith("field_")):
                tag = "field_" + (tag if tag else "unknown")
            
            if isinstance(value, dict):
                # Dict nested: créer un élément et récurser
                child_elem = ET.SubElement(parent_elem, tag)
                self.build_from_dict(child_elem, value, tag_mapping)
            elif isinstance(value, list):
                # List: créer un élément pour chaque item
                for item in value:
                    if isinstance(item, dict):
                        item_elem = ET.SubElement(parent_elem, tag)
                        self.build_from_dict(item_elem, item, tag_mapping)
                    else:
                        item_elem = ET.SubElement(parent_elem, tag)
                        item_elem.text = sanitize_xml_text(str(item))
            else:
                # Valeur simple: créer un élément avec texte
                child_elem = ET.SubElement(parent_elem, tag)
                child_elem.text = sanitize_xml_text(str(value))

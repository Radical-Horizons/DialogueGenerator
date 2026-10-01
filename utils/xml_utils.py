"""Utilitaires XML partagés pour la construction de prompts.

Ce module fournit des fonctions réutilisables pour :
- Le nettoyage du texte confié à ElementTree
- L'indentation d'éléments XML
- La validation de contenu XML
- La création de documents XML complets
"""
import xml.etree.ElementTree as ET
import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def sanitize_xml_text(text: Optional[str]) -> str:
    """Prépare un texte destiné à un élément ou un attribut ElementTree.

    Ne fait **qu'une** chose : retirer les caractères de contrôle interdits en XML
    (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F ; tabulation, LF et CR sont gardés).

    Il n'échappe **pas** ``&``, ``<`` et ``>`` : ElementTree le fait lui-même à la
    sérialisation. Cette fonction s'appelait ``escape_xml_text`` et les échappait
    aussi, si bien que chaque prompt envoyé au modèle portait des entités
    doublement échappées — ``&amp;lt;scene_instructions&amp;gt;`` dans les règles de
    priorité, ``&amp;lt;br&amp;gt;`` par centaines dans les fiches GDD (relevé sur les
    prompts de benchmark d'octobre 2026). Du bruit lu par le modèle, et payé.

    Args:
        text: Texte brut, ou ``None``.

    Returns:
        Le texte sans caractères de contrôle invalides ; chaîne vide pour ``None``.
    """
    if not text:
        return ""
    return re.sub(r"[\x00-\x08\x0B-\x0C\x0E-\x1F]", "", text)


def indent_xml_element(elem: ET.Element, level: int = 0) -> None:
    """Indente récursivement un élément XML.
    
    Modifie l'élément en place en ajoutant des sauts de ligne et des espaces
    pour une indentation lisible.
    
    Args:
        elem: Élément XML à indenter.
        level: Niveau d'indentation initial (0 par défaut).
    """
    i = "\n" + "  " * level
    if len(elem):
        # Ne pas modifier le texte existant s'il contient du contenu
        # Seulement ajouter l'indentation si le texte est None ou vide
        if elem.text is None or (elem.text and not elem.text.strip()):
            elem.text = i + "  "
        # Ne pas toucher au texte s'il existe déjà
        if not elem.tail or not elem.tail.strip():
            elem.tail = i
        for child in elem:
            indent_xml_element(child, level + 1)
            # Toujours définir le tail pour l'indentation après chaque enfant
            # Le tail est le texte après la balise fermante de l'enfant
            child.tail = i
        if not elem.tail or not elem.tail.strip():
            elem.tail = i
    else:
        # Élément sans enfants : définir le tail pour l'indentation
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = i


def validate_xml_content(xml_str: str) -> bool:
    """Valide basiquement le contenu XML.
    
    Vérifie que le XML peut être parsé sans erreur.
    Ne valide pas contre un schéma XSD, seulement la structure de base.
    
    Args:
        xml_str: Chaîne XML à valider.
        
    Returns:
        True si le XML est valide, False sinon.
    """
    if not xml_str or not xml_str.strip():
        return False
    
    try:
        # Enlever la déclaration XML si présente pour le parsing
        xml_content = xml_str
        if xml_content.startswith('<?xml'):
            xml_content = xml_content.split('?>', 1)[-1].strip()
        
        # Parser le XML
        ET.fromstring(xml_content)
        return True
    except ET.ParseError as e:
        logger.error(f"Erreur de parsing XML: {e}")
        logger.error(f"XML invalide (premiers 500 caractères): {xml_content[:500]}")
        # Logger plus de détails sur l'erreur
        # Extraire ligne et colonne depuis le message d'erreur (format: "line X, column Y")
        import re
        lineno = None
        offset = None
        msg = str(e)
        match = re.search(r'line (\d+), column (\d+)', msg)
        if match:
            lineno = int(match.group(1))
            offset = int(match.group(2))
        elif hasattr(e, 'position') and e.position:
            lineno, offset = e.position
        elif hasattr(e, 'lineno'):
            lineno = e.lineno
            offset = getattr(e, 'offset', None) or getattr(e, 'colno', None)
        
        if lineno and offset:
            lines = xml_content.split('\n')
            if lineno <= len(lines):
                error_line = lines[lineno - 1]
                logger.error(f"Ligne {lineno}, colonne {offset}: {repr(error_line)}")
                if offset <= len(error_line):
                    start = max(0, offset - 10)
                    end = min(len(error_line), offset + 10)
                    logger.error(f"Caractère problématique (colonne {offset}): {repr(error_line[start:end])}")
        return False
    except Exception as e:
        logger.error(f"Erreur lors de la validation XML: {e}")
        logger.error(f"XML invalide (premiers 500 caractères): {xml_content[:500]}")
        return False


def create_xml_document(root_elem: ET.Element) -> str:
    """Crée un document XML complet avec déclaration.
    
    Args:
        root_elem: Élément racine du document XML.
        
    Returns:
        Document XML complet avec déclaration XML et encodage UTF-8.
    """
    # Indenter l'élément racine
    indent_xml_element(root_elem)
    
    # Convertir en string
    xml_str = ET.tostring(root_elem, encoding='unicode', method='xml')
    
    # Ajouter la déclaration XML
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str


def parse_xml_element(xml_str: str) -> Optional[ET.Element]:
    """Parse une chaîne XML et retourne l'élément racine.
    
    Gère automatiquement la présence ou l'absence de déclaration XML.
    
    Args:
        xml_str: Chaîne XML à parser.
        
    Returns:
        Élément racine XML, ou None si le parsing échoue.
    """
    if not xml_str or not xml_str.strip():
        return None
    
    try:
        # Enlever la déclaration XML si présente
        xml_content = xml_str
        if xml_content.startswith('<?xml'):
            xml_content = xml_content.split('?>', 1)[-1].strip()
        
        return ET.fromstring(xml_content)
    except ET.ParseError as e:
        logger.warning(f"Erreur de parsing XML: {e}")
        return None
    except Exception as e:
        logger.warning(f"Erreur lors du parsing XML: {e}")
        return None


def extract_text_from_element(elem: ET.Element) -> str:
    """Extrait récursivement tout le texte d'un élément XML.
    
    Parcourt récursivement l'élément et ses enfants pour extraire
    tout le texte (`.text` et `.tail` de chaque élément).
    Préserve les sauts de ligne et la structure.
    
    Args:
        elem: Élément XML dont on veut extraire le texte.
        
    Returns:
        Texte brut sans balises XML, avec sauts de ligne préservés.
    """
    if elem is None:
        return ""
    
    parts = []
    
    # Ajouter le texte de l'élément lui-même
    if elem.text:
        parts.append(elem.text)
    
    # Parcourir récursivement les enfants
    for child in elem:
        child_text = extract_text_from_element(child)
        if child_text:
            parts.append(child_text)
        
        # Ajouter le texte après l'enfant (tail)
        if child.tail:
            parts.append(child.tail)
    
    return "".join(parts)

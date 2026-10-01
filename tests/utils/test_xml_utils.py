"""Tests pour les utilitaires XML partagés."""
import pytest
import xml.etree.ElementTree as ET
from utils.xml_utils import (
    sanitize_xml_text,
    indent_xml_element,
    validate_xml_content,
    create_xml_document,
    parse_xml_element
)


class TestSanitizeXmlText:
    """Tests pour sanitize_xml_text()."""

    def test_leaves_xml_special_characters_to_elementtree(self) -> None:
        """`&`, `<` et `>` passent tels quels : ElementTree les échappe lui-même."""
        assert sanitize_xml_text("A & <b>") == "A & <b>"

    def test_serialized_element_is_escaped_exactly_once(self) -> None:
        """Régression : le texte pré-échappé sortait en `&amp;lt;` une fois sérialisé."""
        elem = ET.Element("priority_rules")
        elem.text = sanitize_xml_text("Instructions de scène (<scene_instructions>) & co")
        xml_str = ET.tostring(elem, encoding="unicode")
        assert "&lt;scene_instructions&gt;" in xml_str
        assert "&amp;lt;" not in xml_str
        assert "&amp;amp;" not in xml_str
        assert ET.fromstring(xml_str).text == "Instructions de scène (<scene_instructions>) & co"

    def test_empty_values(self) -> None:
        """Chaîne vide et `None` donnent une chaîne vide."""
        assert sanitize_xml_text("") == ""
        assert sanitize_xml_text(None) == ""

    def test_strips_invalid_control_characters(self) -> None:
        """Les caractères de contrôle interdits en XML sont retirés, pas tab/LF/CR."""
        result = sanitize_xml_text("Test\x00\x01\x0B\x1F content")
        assert result == "Test content"
        assert sanitize_xml_text("Test\t\n\r") == "Test\t\n\r"


class TestIndentXmlElement:
    """Tests pour indent_xml_element()."""
    
    def test_indent_simple_element(self):
        """Test l'indentation d'un élément simple."""
        root = ET.Element("root")
        root.text = "content"
        indent_xml_element(root)
        
        # Vérifier que l'élément a été modifié
        assert root.text is not None
    
    def test_indent_nested_elements(self):
        """Test l'indentation d'éléments imbriqués."""
        root = ET.Element("root")
        child1 = ET.SubElement(root, "child1")
        child2 = ET.SubElement(root, "child2")
        grandchild = ET.SubElement(child1, "grandchild")
        
        indent_xml_element(root)
        
        # Vérifier que tous les éléments ont été indentés
        assert root.text is not None
        assert child1.tail is not None
        assert child2.tail is not None
        assert grandchild.tail is not None
    
    def test_indent_preserves_content(self):
        """Test que l'indentation préserve le contenu."""
        root = ET.Element("root")
        root.text = "original content"
        child = ET.SubElement(root, "child")
        child.text = "child content"
        
        indent_xml_element(root)
        
        # Le contenu original doit être préservé (mais peut être modifié pour l'indentation)
        assert "original" in root.text or "original" in (root.text or "")
        assert "child" in child.text or "child" in (child.text or "")


class TestValidateXmlContent:
    """Tests pour validate_xml_content()."""
    
    def test_validate_valid_xml(self):
        """Test avec un XML valide."""
        xml_str = "<root><child>content</child></root>"
        assert validate_xml_content(xml_str) is True
    
    def test_validate_xml_with_declaration(self):
        """Test avec une déclaration XML."""
        xml_str = '<?xml version="1.0" encoding="UTF-8"?><root>content</root>'
        assert validate_xml_content(xml_str) is True
    
    def test_validate_invalid_xml(self):
        """Test avec un XML invalide."""
        xml_str = "<root><child>content</root>"  # Balise non fermée
        assert validate_xml_content(xml_str) is False
    
    def test_validate_empty_string(self):
        """Test avec une chaîne vide."""
        assert validate_xml_content("") is False
        assert validate_xml_content(None) is False
    
    def test_validate_malformed_xml(self):
        """Test avec un XML malformé."""
        xml_str = "<root><child>content<invalid"
        assert validate_xml_content(xml_str) is False


class TestCreateXmlDocument:
    """Tests pour create_xml_document()."""
    
    def test_create_simple_document(self):
        """Test la création d'un document XML simple."""
        root = ET.Element("root")
        root.text = "content"
        
        result = create_xml_document(root)
        
        assert result.startswith('<?xml version="1.0" encoding="UTF-8"?>')
        assert "<root>" in result
        assert "content" in result
    
    def test_create_nested_document(self):
        """Test la création d'un document XML avec éléments imbriqués."""
        root = ET.Element("root")
        child = ET.SubElement(root, "child")
        child.text = "child content"
        
        result = create_xml_document(root)
        
        assert result.startswith('<?xml version="1.0" encoding="UTF-8"?>')
        assert "<root>" in result
        assert "<child>" in result
        assert "child content" in result
    
    def test_create_document_is_valid_xml(self):
        """Test que le document créé est un XML valide."""
        root = ET.Element("root")
        child = ET.SubElement(root, "child")
        child.text = "content"
        
        result = create_xml_document(root)
        
        # Parser le résultat pour vérifier qu'il est valide
        xml_content = result.split('?>', 1)[-1].strip()
        parsed = ET.fromstring(xml_content)
        assert parsed.tag == "root"
        assert len(parsed) == 1
        assert parsed[0].tag == "child"


class TestParseXmlElement:
    """Tests pour parse_xml_element()."""
    
    def test_parse_valid_xml(self):
        """Test le parsing d'un XML valide."""
        xml_str = "<root><child>content</child></root>"
        result = parse_xml_element(xml_str)
        
        assert result is not None
        assert result.tag == "root"
        assert len(result) == 1
        assert result[0].tag == "child"
    
    def test_parse_xml_with_declaration(self):
        """Test le parsing avec déclaration XML."""
        xml_str = '<?xml version="1.0" encoding="UTF-8"?><root>content</root>'
        result = parse_xml_element(xml_str)
        
        assert result is not None
        assert result.tag == "root"
    
    def test_parse_invalid_xml(self):
        """Test le parsing d'un XML invalide."""
        xml_str = "<root><child>content</root>"  # Balise non fermée
        result = parse_xml_element(xml_str)
        
        assert result is None
    
    def test_parse_empty_string(self):
        """Test avec une chaîne vide."""
        assert parse_xml_element("") is None
        assert parse_xml_element(None) is None

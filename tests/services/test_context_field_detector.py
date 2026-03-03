"""Tests pour le service ContextFieldDetector."""
import pytest
from unittest.mock import MagicMock
from services.context_field_detector import ContextFieldDetector, FieldInfo


class TestContextFieldDetector:
    """Tests pour ContextFieldDetector."""
    
    def test_detect_available_fields_simple(self):
        """Test de détection de champs simples."""
        detector = ContextFieldDetector()
        
        sample_data = [
            {"Nom": "Test", "Type": "Character", "Age": 25},
            {"Nom": "Test2", "Type": "Character", "Age": 30},
        ]
        
        fields = detector.detect_available_fields("character", sample_data)
        
        assert "Nom" in fields
        assert "Type" in fields
        assert "Age" in fields
        assert fields["Nom"].type == "string"
        assert fields["Nom"].frequency == 1.0
    
    def test_detect_available_fields_nested(self):
        """Test de détection de champs imbriqués."""
        detector = ContextFieldDetector()
        
        sample_data = [
            {
                "Nom": "Test",
                "Background": {
                    "Histoire": "Test history",
                    "Relations": ["Friend1", "Friend2"]
                }
            }
        ]
        
        fields = detector.detect_available_fields("character", sample_data)
        
        assert "Nom" in fields
        assert "Background" in fields
        assert "Background.Histoire" in fields
        assert "Background.Relations" in fields
        assert fields["Background"].type == "dict"
        assert fields["Background.Histoire"].type == "string"
    
    def test_classify_field_importance(self):
        """Test de classification de l'importance des champs."""
        detector = ContextFieldDetector()
        
        assert detector.classify_field_importance(0.9) == "essential"
        assert detector.classify_field_importance(0.5) == "common"
        assert detector.classify_field_importance(0.1) == "rare"
    
    def test_categorize_field(self):
        """Test de catégorisation des champs."""
        detector = ContextFieldDetector()
        
        assert detector._categorize_field("Nom", "character") == "identity"
        assert detector._categorize_field("Caractérisation.Désir", "character") == "characterization"
        # "Dialogue Type.Registre" devrait être catégorisé comme "voice" car "dialogue" a la priorité
        assert detector._categorize_field("Dialogue Type.Registre", "character") == "voice"
        assert detector._categorize_field("Dialogue Type", "character") == "voice"
        assert detector._categorize_field("Background.Histoire", "character") == "background"
        assert detector._categorize_field("Pouvoirs", "character") == "mechanics"

    def test_get_sample_data_public_api_delegates(self):
        """Test que get_sample_data délègue à l'implémentation interne."""
        detector = ContextFieldDetector()
        detector._get_sample_data = MagicMock(return_value=[{"Nom": "Test"}])  # type: ignore[method-assign]

        result = detector.get_sample_data("character")

        detector._get_sample_data.assert_called_once_with("character")
        assert result == [{"Nom": "Test"}]

    def test_identify_essential_fields_public_api_delegates(self):
        """Test que identify_essential_fields délègue à l'implémentation interne."""
        detector = ContextFieldDetector()
        detector._identify_essential_fields = MagicMock(return_value={"Nom"})  # type: ignore[method-assign]

        result = detector.identify_essential_fields("character", {"character": {}})

        detector._identify_essential_fields.assert_called_once_with("character", {"character": {}})
        assert result == {"Nom"}


class TestContextOrganizer:
    """Tests pour ContextOrganizer."""
    
    def test_organize_default(self):
        """Test d'organisation par défaut."""
        from services.context_organizer import ContextOrganizer
        
        organizer = ContextOrganizer()
        element_data = {
            "Nom": "Test",
            "Type": "Character",
            "Age": 25,
        }
        fields_to_include = ["Nom", "Type", "Age"]
        
        result = organizer.organize_context(
            element_data,
            "character",
            fields_to_include,
            "default"
        )
        
        assert "Nom" in result
        assert "Type" in result
        assert "Age" in result
    
    def test_organize_narrative(self):
        """Test d'organisation narrative."""
        from services.context_organizer import ContextOrganizer
        
        organizer = ContextOrganizer()
        element_data = {
            "Nom": "Test",
            "Caractérisation": {
                "Désir": "Test desire",
                "Faiblesse": "Test weakness",
            },
            "Dialogue Type": {
                "Registre": "Formel",
            }
        }
        fields_to_include = ["Nom", "Caractérisation.Désir", "Dialogue Type.Registre"]
        
        result = organizer.organize_context(
            element_data,
            "character",
            fields_to_include,
            "narrative"
        )
        
        assert "IDENTITÉ" in result or "Nom" in result
        assert "CARACTÉRISATION" in result or "Désir" in result
    
    def test_organize_minimal(self):
        """Test d'organisation minimale."""
        from services.context_organizer import ContextOrganizer
        
        organizer = ContextOrganizer()
        element_data = {
            "Nom": "Test",
            "Dialogue Type": {
                "Registre de langage du personnage": "Formel",
            },
            "Caractérisation": {
                "Désir": "Test desire",
            }
        }
        fields_to_include = ["Nom", "Dialogue Type.Registre de langage du personnage", "Caractérisation.Désir", "Autre"]
        
        result = organizer.organize_context(
            element_data,
            "character",
            fields_to_include,
            "minimal"
        )
        
        # Le mode minimal devrait filtrer pour ne garder que les champs essentiels
        assert "Registre" in result or "Registre de langage du personnage" in result
        assert "Désir" in result


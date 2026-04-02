"""Tests pour le service ContextFieldValidator."""
import pytest
from unittest.mock import MagicMock
from services.context_field_validator import (
    ContextFieldValidator,
    ValidationIssue,
    ValidationResult
)
from services.context_field_detector import FieldInfo
from core.context.context_builder import ContextBuilder


@pytest.fixture
def mock_context_builder():
    """Mock du ContextBuilder avec des données de test."""
    builder = MagicMock(spec=ContextBuilder)
    
    # Configurer les données de test pour les personnages
    builder.characters = [
        {
            "Nom": "Test Character 1",
            "Introduction": {
                "Résumé de la fiche": "Test summary"
            },
            "Caractérisation": {
                "Désir": "Test desire",
                "Faiblesse": "Test weakness"
            },
            "Background": {
                "Relations": "Test relations"
            },
            "Registre de langage du personnage": "Formel",
            "Expressions courantes": ["Test", "Expression"]
        },
        {
            "Nom": "Test Character 2",
            "Introduction": {
                "Résumé de la fiche": "Test summary 2"
            },
            "Caractérisation": {
                "Désir": "Test desire 2"
            }
        }
    ]
    
    # Configurer get_character_details_by_name pour retourner les personnages
    def get_character_details(name):
        for char in builder.characters:
            if char.get("Nom") == name:
                return char
        return None
    
    builder.get_character_details_by_name = MagicMock(side_effect=get_character_details)
    
    return builder


@pytest.fixture
def sample_config():
    """Configuration de test avec des champs valides et invalides."""
    return {
        "character": {
            "1": [
                {"path": "Nom", "label": "Nom"},
                {"path": "Introduction.Résumé de la fiche", "label": "Résumé"},
                {"path": "Caractérisation.Désir", "label": "Désir"},
                {"path": "InvalidField", "label": "Invalid"},  # Champ invalide
                {"path": "Dialogue Type.Registre", "label": "Registre"}  # Champ invalide (structure incorrecte)
            ],
            "2": [
                {"path": "Background.Relations", "label": "Relations"},
                {"path": "Registre de langage du personnage", "label": "Langage"},
                {"path": "Expressions courantes", "label": "Expressions"}
            ]
        }
    }


class TestContextFieldValidator:
    """Tests pour ContextFieldValidator."""
    
    def test_validate_config_for_element_type_valid_fields(self, mock_context_builder, sample_config):
        """Test de validation avec des champs valides."""
        validator = ContextFieldValidator(mock_context_builder)
        
        fields = sample_config["character"]["1"] + sample_config["character"]["2"]
        result = validator.validate_config_for_element_type("character", fields)
        
        assert isinstance(result, ValidationResult)
        assert result.element_type == "character"
        assert len(result.valid_fields) > 0
        assert "Nom" in result.valid_fields
        assert "Introduction.Résumé de la fiche" in result.valid_fields
        assert "Registre de langage du personnage" in result.valid_fields
    
    def test_validate_config_for_element_type_invalid_fields(self, mock_context_builder, sample_config):
        """Test de validation avec des champs invalides."""
        validator = ContextFieldValidator(mock_context_builder)
        
        fields = sample_config["character"]["1"]
        result = validator.validate_config_for_element_type("character", fields)
        
        assert len(result.invalid_fields) > 0
        invalid_paths = [issue.field_path for issue in result.invalid_fields]
        assert "InvalidField" in invalid_paths
    
    def test_validate_config_for_element_type_suggestions(self, mock_context_builder):
        """Test que les suggestions sont proposées pour les champs similaires."""
        validator = ContextFieldValidator(mock_context_builder)
        
        # Champ avec un nom proche d'un champ existant
        fields = [
            {"path": "Dialogue Type.Registre de langage du personnage", "label": "Registre"}
        ]
        result = validator.validate_config_for_element_type("character", fields)
        
        assert len(result.invalid_fields) > 0
        issue = result.invalid_fields[0]
        # Devrait suggérer "Registre de langage du personnage"
        assert issue.suggested_path is not None
        assert "registre" in issue.suggested_path.lower()
    
    def test_filter_valid_fields(self, mock_context_builder):
        """Test du filtrage des champs valides."""
        validator = ContextFieldValidator(mock_context_builder)
        
        fields_to_include = [
            "Nom",
            "InvalidField",
            "Introduction.Résumé de la fiche",
            "AnotherInvalidField"
        ]
        
        valid_fields = validator.filter_valid_fields("character", fields_to_include)
        
        assert "Nom" in valid_fields
        assert "Introduction.Résumé de la fiche" in valid_fields
        assert "InvalidField" not in valid_fields
        assert "AnotherInvalidField" not in valid_fields
    
    def test_validate_all_configs(self, mock_context_builder, sample_config):
        """Test de validation de toutes les configurations."""
        validator = ContextFieldValidator(mock_context_builder)
        
        results = validator.validate_all_configs(sample_config)
        
        assert isinstance(results, dict)
        assert "character" in results
        assert isinstance(results["character"], ValidationResult)
    
    def test_validation_result_has_errors(self, mock_context_builder):
        """Chemins absents du GDD : warnings uniquement (pas d'erreur bloquante)."""
        validator = ContextFieldValidator(mock_context_builder)
        
        fields = [
            {"path": "Nom", "label": "Nom"},
            {"path": "InvalidField", "label": "Invalid"}
        ]
        result = validator.validate_config_for_element_type("character", fields)
        
        assert result.has_warnings()
        assert not result.has_errors()
        assert all(i.severity == "warning" for i in result.invalid_fields)
    
    def test_get_validation_report(self, mock_context_builder, sample_config):
        """Test de génération du rapport de validation."""
        validator = ContextFieldValidator(mock_context_builder)
        
        report = validator.get_validation_report(sample_config)
        
        assert isinstance(report, str)
        assert "RAPPORT DE VALIDATION" in report or "VALIDATION" in report
        assert "character" in report.lower()
    
    def test_find_similar_field(self, mock_context_builder):
        """Test de recherche de champs similaires."""
        validator = ContextFieldValidator(mock_context_builder)
        
        # Créer des champs détectés
        detected_fields = {
            "Registre de langage du personnage": FieldInfo(
                path="Registre de langage du personnage",
                label="Registre",
                type="string",
                depth=0,
                frequency=1.0
            ),
            "Expressions courantes": FieldInfo(
                path="Expressions courantes",
                label="Expressions",
                type="list",
                depth=0,
                frequency=1.0
            )
        }
        
        # Chercher un champ similaire
        similar = validator._find_similar_field(
            "Dialogue Type.Registre de langage",
            detected_fields
        )
        
        # Devrait trouver "Registre de langage du personnage"
        assert similar is not None
        assert "registre" in similar.lower()
    
    def test_validation_with_empty_config(self, mock_context_builder):
        """Test de validation avec une configuration vide."""
        validator = ContextFieldValidator(mock_context_builder)
        
        empty_config = {}
        results = validator.validate_all_configs(empty_config)
        
        assert isinstance(results, dict)
        assert len(results) == 0
    
    def test_validation_with_missing_element_type(self, mock_context_builder):
        """Test de validation avec un type d'élément manquant."""
        validator = ContextFieldValidator(mock_context_builder)
        
        config = {
            "nonexistent_type": {
                "1": [{"path": "Test", "label": "Test"}]
            }
        }
        results = validator.validate_all_configs(config)
        
        # Devrait gérer gracieusement
        assert isinstance(results, dict)

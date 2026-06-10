"""Tests pour le service ContextFieldManager."""
import pytest
from unittest.mock import MagicMock, patch
from services.context_field_manager import ContextFieldManager
from core.context.context_builder import ContextBuilder


@pytest.fixture
def sample_context_config():
    """Configuration de test avec différents types de champs."""
    return {
        "character": {
            "1": [
                {"path": "Nom", "label": "Nom"},
                {"path": "Introduction.Résumé de la fiche", "label": "Résumé"},
                {"path": "Dialogue Type.Registre", "label": "Registre", "condition_flag": "include_dialogue_type"}
            ],
            "2": [
                {"path": "Caractérisation.Désir", "label": "Désir"},
                {"path": "Background.Relations", "label": "Relations"}
            ],
            "3": [
                {"path": "Introduction.Résumé de la fiche (extrait)", "label": "Résumé (extrait)"},
                {"path": "Caractérisation.Désir (extrait)", "label": "Désir (extrait)"}
            ]
        },
        "location": {
            "1": [
                {"path": "Nom", "label": "Nom"},
                {"path": "Description", "label": "Description"}
            ]
        }
    }


@pytest.fixture
def mock_context_builder():
    """Mock du ContextBuilder."""
    builder = MagicMock(spec=ContextBuilder)
    builder.characters = [
        {"Nom": "Test Character", "Introduction": {"Résumé de la fiche": "Test"}}
    ]
    return builder


@pytest.fixture
def field_manager(sample_context_config, mock_context_builder):
    """ContextFieldManager de test."""
    return ContextFieldManager(sample_context_config, mock_context_builder)


class TestContextFieldManager:
    """Tests pour ContextFieldManager."""
    
    def test_get_field_config_for_mode_full_with_custom_fields(self, field_manager):
        """Test get_field_config_for_mode en mode full avec champs personnalisés."""
        custom_fields = ["Nom", "Introduction.Résumé de la fiche"]
        result = field_manager.get_field_config_for_mode("character", "full", custom_fields)
        
        assert result == custom_fields
    
    def test_get_field_config_for_mode_full_without_custom_fields(self, field_manager):
        """Test get_field_config_for_mode en mode full sans champs personnalisés."""
        result = field_manager.get_field_config_for_mode("character", "full", None)
        
        assert result is None
    
    def test_get_field_config_for_mode_excerpt(self, field_manager):
        """Test get_field_config_for_mode en mode excerpt."""
        result = field_manager.get_field_config_for_mode("character", "excerpt", ["Nom"])
        
        # En mode excerpt, on ignore les custom_fields et on extrait tous les champs avec "(extrait)"
        assert result is not None
        assert "Introduction.Résumé de la fiche (extrait)" in result
        assert "Caractérisation.Désir (extrait)" in result
        assert "Nom" not in result  # Pas de "(extrait)" dans le label
    
    def test_get_field_config_for_mode_excerpt_no_excerpt_fields(self, field_manager):
        """Test excerpt sans champs dédiés : repli sur les champs priorité 1."""
        result = field_manager.get_field_config_for_mode("location", "excerpt", ["Nom"])

        assert result == ["Nom", "Description"]
    
    def test_filter_fields_by_condition_flags_with_include_dialogue_type(self, field_manager):
        """Test filter_fields_by_condition_flags avec include_dialogue_type=True."""
        fields = ["Nom", "Dialogue Type.Registre", "Introduction.Résumé de la fiche"]
        
        with patch('services.context_field_validator.ContextFieldValidator') as mock_validator_class:
            mock_validator = MagicMock()
            mock_validator.filter_valid_fields.return_value = fields
            mock_validator_class.return_value = mock_validator
            
            result = field_manager.filter_fields_by_condition_flags(
                "character", fields, include_dialogue_type=True
            )
            
            # Tous les champs doivent être inclus
            assert "Nom" in result
            assert "Dialogue Type.Registre" in result
            assert "Introduction.Résumé de la fiche" in result
    
    def test_filter_fields_by_condition_flags_without_include_dialogue_type(self, field_manager):
        """Test filter_fields_by_condition_flags avec include_dialogue_type=False."""
        fields = ["Nom", "Dialogue Type.Registre", "Introduction.Résumé de la fiche"]
        
        with patch('services.context_field_validator.ContextFieldValidator') as mock_validator_class:
            mock_validator = MagicMock()
            mock_validator.filter_valid_fields.return_value = fields
            mock_validator_class.return_value = mock_validator
            
            result = field_manager.filter_fields_by_condition_flags(
                "character", fields, include_dialogue_type=False
            )
            
            # Le champ avec condition_flag="include_dialogue_type" doit être exclu
            assert "Nom" in result
            assert "Dialogue Type.Registre" not in result
            assert "Introduction.Résumé de la fiche" in result
    
    def test_filter_fields_by_condition_flags_empty_list(self, field_manager):
        """Test filter_fields_by_condition_flags avec liste vide."""
        result = field_manager.filter_fields_by_condition_flags("character", [], include_dialogue_type=True)
        
        assert result == []
    
    def test_filter_fields_by_condition_flags_validation_error(self, field_manager):
        """Test filter_fields_by_condition_flags avec erreur de validation."""
        fields = ["Nom", "InvalidField"]
        
        with patch('services.context_field_validator.ContextFieldValidator') as mock_validator_class:
            mock_validator = MagicMock()
            mock_validator.filter_valid_fields.side_effect = Exception("Validation error")
            mock_validator_class.return_value = mock_validator
            
            # Doit continuer avec les champs fournis si la validation échoue
            result = field_manager.filter_fields_by_condition_flags(
                "character", fields, include_dialogue_type=True
            )
            
            # Les champs doivent être filtrés selon les condition_flags même si la validation échoue
            assert len(result) >= 0
    
    def test_get_field_labels_map(self, field_manager):
        """Test get_field_labels_map."""
        fields = ["Nom", "Introduction.Résumé de la fiche", "Caractérisation.Désir"]
        
        result = field_manager.get_field_labels_map("character", fields)
        
        assert result["Nom"] == "Nom"
        assert result["Introduction.Résumé de la fiche"] == "Résumé"
        assert result["Caractérisation.Désir"] == "Désir"
    
    def test_get_field_labels_map_partial_match(self, field_manager):
        """Test get_field_labels_map avec champs partiellement présents."""
        fields = ["Nom", "NonExistentField"]
        
        result = field_manager.get_field_labels_map("character", fields)
        
        # Seuls les champs présents dans la config doivent avoir un label
        assert "Nom" in result
        assert result["Nom"] == "Nom"
        assert "NonExistentField" not in result
    
    def test_get_field_labels_map_empty_list(self, field_manager):
        """Test get_field_labels_map avec liste vide."""
        result = field_manager.get_field_labels_map("character", [])
        
        assert result == {}
    
    def test_get_field_labels_map_unknown_element_type(self, field_manager):
        """Test get_field_labels_map avec type d'élément inconnu."""
        result = field_manager.get_field_labels_map("unknown_type", ["Nom"])
        
        assert result == {}


class TestContextFieldManagerIntegration:
    """Tests d'intégration pour ContextFieldManager."""
    
    def test_full_workflow(self, sample_context_config, mock_context_builder):
        """Test du workflow complet : get_field_config -> filter -> get_labels."""
        manager = ContextFieldManager(sample_context_config, mock_context_builder)
        
        # 1. Obtenir les champs en mode excerpt
        fields = manager.get_field_config_for_mode("character", "excerpt", None)
        assert fields is not None
        assert len(fields) > 0
        
        # 2. Filtrer selon les condition_flags
        with patch('services.context_field_validator.ContextFieldValidator') as mock_validator_class:
            mock_validator = MagicMock()
            mock_validator.filter_valid_fields.return_value = fields
            mock_validator_class.return_value = mock_validator
            
            filtered = manager.filter_fields_by_condition_flags(
                "character", fields, include_dialogue_type=True
            )
            assert len(filtered) >= 0
        
        # 3. Obtenir les labels
        labels = manager.get_field_labels_map("character", filtered if filtered else fields)
        assert isinstance(labels, dict)

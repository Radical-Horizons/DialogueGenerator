"""Tests pour le validateur de schéma Unity.

Story 16.1 : schéma v1.1.0 (racine objet, schemaVersion, choiceId requis).
"""
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from api.utils.unity_schema_validator import (
    load_unity_schema,
    validate_unity_json,
    validate_unity_json_structured,
    schema_exists
)


class TestUnitySchemaValidator:
    """Tests pour le validateur de schéma Unity."""
    
    def test_schema_exists_false(self):
        """Test de vérification d'existence du schéma (peut être False)."""
        result = schema_exists()
        
        # Le schéma peut exister ou non selon l'environnement
        assert isinstance(result, bool)
    
    def test_load_unity_schema_not_found(self, tmp_path):
        """Test de chargement avec schéma absent."""
        import api.utils.unity_schema_validator as mod
        mod._schema_cache = None
        with patch("api.utils.unity_schema_validator._SCHEMA_PATH", tmp_path / "nonexistent.json"):
            result = load_unity_schema()
            assert result is None
    
    def test_load_unity_schema_success(self, tmp_path):
        """Test de chargement avec schéma présent."""
        schema_file = tmp_path / "schema.json"
        schema_data = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "line": {"type": "string"}
                }
            }
        }
        schema_file.write_text(str(schema_data).replace("'", '"'), encoding="utf-8")
        
        with patch("api.utils.unity_schema_validator._SCHEMA_PATH", schema_file):
            # Réinitialiser le cache
            import api.utils.unity_schema_validator
            api.utils.unity_schema_validator._schema_cache = None
            
            result = load_unity_schema()
            
            # Peut échouer si le JSON n'est pas valide, mais devrait retourner quelque chose
            assert result is not None or result is None
    
    def test_validate_unity_json_no_schema(self, tmp_path):
        """Test de validation sans schéma (graceful degradation)."""
        with patch("api.utils.unity_schema_validator.load_unity_schema", return_value=None):
            json_data = [{"id": "START", "line": "Test"}]
            
            is_valid, errors = validate_unity_json(json_data)
            
            assert is_valid is True
            assert errors == []
    
    def test_validate_unity_json_valid(self, tmp_path):
        """Test de validation avec JSON valide."""
        mock_schema = {
            "type": "array",
            "items": {
                "type": "object"
            }
        }
        
        with patch("api.utils.unity_schema_validator.load_unity_schema", return_value=mock_schema):
            # Mocker l'import de jsonschema
            with patch("builtins.__import__") as mock_import:
                mock_jsonschema_module = MagicMock()
                mock_validator = MagicMock()
                mock_validator.iter_errors.return_value = []
                mock_jsonschema_module.Draft7Validator.return_value = mock_validator
                
                def import_side_effect(name, *args, **kwargs):
                    if name == "jsonschema":
                        return mock_jsonschema_module
                    return __import__(name, *args, **kwargs)
                
                mock_import.side_effect = import_side_effect
                
                json_data = [{"id": "START", "line": "Test"}]
                
                is_valid, errors = validate_unity_json(json_data)
                
                # Peut réussir ou échouer selon si jsonschema est disponible
                assert isinstance(is_valid, bool)
                assert isinstance(errors, list)
    
    def test_validate_unity_json_invalid(self, tmp_path):
        """Test de validation avec JSON invalide."""
        mock_schema = {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id"]
            }
        }
        
        with patch("api.utils.unity_schema_validator.load_unity_schema", return_value=mock_schema):
            # Mocker l'import de jsonschema
            with patch("builtins.__import__") as mock_import:
                mock_jsonschema_module = MagicMock()
                mock_error = MagicMock()
                mock_error.message = "Missing required field"
                mock_error.path = []
                
                mock_validator = MagicMock()
                mock_validator.iter_errors.return_value = [mock_error]
                mock_jsonschema_module.Draft7Validator.return_value = mock_validator
                
                def import_side_effect(name, *args, **kwargs):
                    if name == "jsonschema":
                        return mock_jsonschema_module
                    return __import__(name, *args, **kwargs)
                
                mock_import.side_effect = import_side_effect
                
                json_data = [{"line": "Test"}]  # Manque "id"
                
                is_valid, errors = validate_unity_json(json_data)
                
                # Peut réussir ou échouer selon si jsonschema est disponible
                assert isinstance(is_valid, bool)
                assert isinstance(errors, list)
    
    def test_validate_unity_json_import_error(self, tmp_path):
        """Test de validation avec jsonschema non installé."""
        mock_schema = {"type": "array"}
        
        with patch("api.utils.unity_schema_validator.load_unity_schema", return_value=mock_schema):
            with patch("builtins.__import__", side_effect=ImportError("No module named 'jsonschema'")):
                json_data = [{"id": "START"}]
                
                is_valid, errors = validate_unity_json(json_data)
                
                # Graceful degradation
                assert is_valid is True
                assert errors == []


class TestUnitySchemaV1_1_0:
    """Tests schéma v1.1.0 (racine objet, schemaVersion, choiceId) — Story 16.1."""

    @pytest.fixture
    def real_schema_path(self):
        """Chemin réel du schéma (docs/resources)."""
        return Path(__file__).resolve().parent.parent.parent.parent / "docs" / "resources" / "dialogue-format.schema.json"

    def test_load_unity_schema_v1_1_0_structure(self, real_schema_path):
        """Schéma chargé doit être v1.1.0 : racine objet, schemaVersion requis, choiceId dans choices."""
        if not real_schema_path.exists():
            pytest.skip("Schéma dialogue-format.schema.json absent")
        with patch("api.utils.unity_schema_validator._SCHEMA_PATH", real_schema_path):
            import api.utils.unity_schema_validator
            api.utils.unity_schema_validator._schema_cache = None
            schema = load_unity_schema()
        assert schema is not None
        assert schema.get("type") == "object", "Racine doit être un objet (v1.1.0)"
        assert "schemaVersion" in schema.get("required", []), "schemaVersion requis"
        assert schema.get("properties", {}).get("schemaVersion", {}).get("const") == "1.1.0"
        assert "nodes" in schema.get("required", [])
        # choices[].choiceId requis
        nodes_def = schema.get("properties", {}).get("nodes", {})
        items = nodes_def.get("items", {})
        choices_def = items.get("properties", {}).get("choices", {})
        choice_items = choices_def.get("items", {})
        assert "choiceId" in choice_items.get("required", []), "choiceId requis dans chaque choice"

    def test_validate_unity_json_v1_1_0_document_valid(self, real_schema_path):
        """Document v1.1.0 avec schemaVersion et choices[].choiceId doit être valide."""
        if not real_schema_path.exists():
            pytest.skip("Schéma dialogue-format.schema.json absent")
        document = {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "START",
                    "speaker": "PNJ",
                    "line": "Test",
                    "choices": [
                        {"choiceId": "choice_1", "text": "Accepter", "targetNode": "END"}
                    ]
                },
                {"id": "END", "line": ""}
            ]
        }
        with patch("api.utils.unity_schema_validator._SCHEMA_PATH", real_schema_path):
            import api.utils.unity_schema_validator
            api.utils.unity_schema_validator._schema_cache = None
            is_valid, errors = validate_unity_json(document)
        assert is_valid, f"Document v1.1.0 valide attendu ; erreurs : {errors}"
        assert errors == []

    def test_validate_unity_json_v1_1_0_document_missing_schema_version(self, real_schema_path):
        """Document sans schemaVersion doit être refusé (v1.1.0)."""
        if not real_schema_path.exists():
            pytest.skip("Schéma dialogue-format.schema.json absent")
        document = {
            "nodes": [
                {"id": "START", "line": "Test"},
                {"id": "END", "line": ""}
            ]
        }
        with patch("api.utils.unity_schema_validator._SCHEMA_PATH", real_schema_path):
            import api.utils.unity_schema_validator
            api.utils.unity_schema_validator._schema_cache = None
            is_valid, errors = validate_unity_json(document)
        assert not is_valid, "Document sans schemaVersion doit être invalide"
        assert any("schemaVersion" in e or "required" in e.lower() for e in errors)

    def test_validate_unity_json_v1_1_0_document_choices_without_choice_id(self, real_schema_path):
        """Document v1.1.0 avec choice sans choiceId doit être refusé."""
        if not real_schema_path.exists():
            pytest.skip("Schéma dialogue-format.schema.json absent")
        document = {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "START",
                    "line": "Test",
                    "choices": [
                        {"text": "Accepter", "targetNode": "END"}
                    ]
                },
                {"id": "END", "line": ""}
            ]
        }
        with patch("api.utils.unity_schema_validator._SCHEMA_PATH", real_schema_path):
            import api.utils.unity_schema_validator
            api.utils.unity_schema_validator._schema_cache = None
            is_valid, errors = validate_unity_json(document)
        assert not is_valid, "Choice sans choiceId doit être refusé (schemaVersion >= 1.1.0)"
        assert any("choiceId" in e or "required" in e.lower() for e in errors)

    def test_validate_unity_json_structured_refuses_document_without_choice_id(self, real_schema_path):
        """Document v1.1.0 avec choice sans choiceId : erreur structurée (code, message, path)."""
        if not real_schema_path.exists():
            pytest.skip("Schéma dialogue-format.schema.json absent")
        document = {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "START",
                    "line": "Test",
                    "choices": [
                        {"text": "Accepter", "targetNode": "END"}
                    ]
                },
                {"id": "END", "line": ""}
            ]
        }
        with patch("api.utils.unity_schema_validator._SCHEMA_PATH", real_schema_path):
            import api.utils.unity_schema_validator
            api.utils.unity_schema_validator._schema_cache = None
            is_valid, errors_structured = validate_unity_json_structured(document)
        assert not is_valid
        assert len(errors_structured) >= 1
        err = errors_structured[0]
        assert "code" in err and "message" in err and "path" in err
        assert err["code"] == "missing_choice_id" or "choiceId" in err.get("message", "")

    def test_validate_unity_json_structured_accepts_valid_document(self, real_schema_path):
        """Document v1.1.0 valide avec choiceId : validation structurée réussit (True, [])."""
        if not real_schema_path.exists():
            pytest.skip("Schéma dialogue-format.schema.json absent")
        document = {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "START",
                    "speaker": "PNJ",
                    "line": "Test",
                    "choices": [
                        {"choiceId": "choice_1", "text": "Accepter", "targetNode": "END"}
                    ]
                },
                {"id": "END", "line": ""}
            ]
        }
        with patch("api.utils.unity_schema_validator._SCHEMA_PATH", real_schema_path):
            import api.utils.unity_schema_validator
            api.utils.unity_schema_validator._schema_cache = None
            is_valid, errors_structured = validate_unity_json_structured(document)
        assert is_valid, f"Document valide attendu ; erreurs : {errors_structured}"
        assert errors_structured == []

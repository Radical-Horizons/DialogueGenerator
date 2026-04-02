"""Tests intégration pour les endpoints /api/v1/presets."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from pathlib import Path
from uuid import uuid4

from api.main import app
from api.schemas.preset import Preset, PresetMetadata, PresetConfiguration, PresetValidationResult
from services.preset_service import PresetService


@pytest.fixture
def mock_preset_service(tmp_path: Path) -> MagicMock:
    """Mock PresetService pour tests API."""
    service = MagicMock(spec=PresetService)
    
    # Mock presets de test
    test_preset_id = str(uuid4())
    test_preset = Preset(
        id=test_preset_id,
        name="Test Preset",
        icon="🎭",
        metadata=PresetMetadata.model_validate({
            "created": "2026-01-17T10:00:00Z",
            "modified": "2026-01-17T10:00:00Z"
        }),
        configuration=PresetConfiguration(
            characters=["char-001"],
            locations=["loc-001"],
            region="Test Region",
            subLocation="Test SubLocation",
            sceneType="Première rencontre",
            instructions="Test instructions"
        )
    )
    
    # Mock méthodes
    # create_preset et update_preset retournent un tuple (preset, cleanup_message)
    service.create_preset = MagicMock(return_value=(test_preset, None))
    service.list_presets = MagicMock(return_value=[test_preset])
    service.load_preset = MagicMock(return_value=test_preset)
    service.update_preset = MagicMock(return_value=(test_preset, None))
    service.delete_preset = MagicMock(return_value=None)
    service.validate_preset_references = MagicMock(return_value=PresetValidationResult(
        valid=True,
        warnings=[],
        obsoleteRefs=[]
    ))
    
    return service


@pytest.fixture
def client(mock_preset_service: MagicMock):
    """Client de test avec mock PresetService."""
    from api.dependencies import get_preset_service
    
    # Override dependency
    app.dependency_overrides[get_preset_service] = lambda: mock_preset_service
    
    yield TestClient(app)
    
    # Cleanup
    app.dependency_overrides.clear()


class TestPresetsEndpoints:
    """Tests pour les endpoints /api/v1/presets."""
    
    def test_list_presets_success(self, client: TestClient, mock_preset_service: MagicMock):
        """GET /api/v1/presets : liste tous les presets."""
        response = client.get("/api/v1/presets")
        
        assert response.status_code == 200
        presets = response.json()
        assert isinstance(presets, list)
        assert len(presets) == 1
        assert presets[0]["name"] == "Test Preset"
        
        mock_preset_service.list_presets.assert_called_once()
    
    def test_list_presets_empty(self, client: TestClient, mock_preset_service: MagicMock):
        """GET /api/v1/presets : liste vide si aucun preset."""
        mock_preset_service.list_presets.return_value = []
        
        response = client.get("/api/v1/presets")
        
        assert response.status_code == 200
        assert response.json() == []
    
    def test_create_preset_success(self, client: TestClient, mock_preset_service: MagicMock):
        """POST /api/v1/presets : créer nouveau preset."""
        preset_data = {
            "name": "New Preset",
            "icon": "🎨",
            "configuration": {
                "characters": ["char-001"],
                "locations": ["loc-001"],
                "region": "Avili",
                "sceneType": "Confrontation",
                "instructions": "Test scene"
            }
        }
        
        response = client.post("/api/v1/presets", json=preset_data)
        
        assert response.status_code == 201
        created = response.json()
        assert "id" in created
        assert created["name"] == "Test Preset"  # Mock retourne test_preset
        
        mock_preset_service.create_preset.assert_called_once()
    
    def test_create_preset_validation_error(self, client: TestClient, mock_preset_service: MagicMock):
        """POST /api/v1/presets : validation error si données invalides."""
        invalid_data = {
            "name": "",  # Nom vide (invalide)
            "configuration": {}  # Configuration incomplete
        }
        
        response = client.post("/api/v1/presets", json=invalid_data)
        
        assert response.status_code == 422
        # Custom error format : {"error": {"code": ..., "message": ..., "details": ...}}
        assert "error" in response.json()
    
    def test_load_preset_success(self, client: TestClient, mock_preset_service: MagicMock):
        """GET /api/v1/presets/{id} : charger preset spécifique."""
        preset_id = "test-id-123"
        
        response = client.get(f"/api/v1/presets/{preset_id}")
        
        assert response.status_code == 200
        preset = response.json()
        assert preset["name"] == "Test Preset"
        
        mock_preset_service.load_preset.assert_called_once_with(preset_id)
    
    def test_load_preset_not_found(self, client: TestClient, mock_preset_service: MagicMock):
        """GET /api/v1/presets/{id} : 404 si preset inexistant."""
        mock_preset_service.load_preset.side_effect = FileNotFoundError("Preset not found")
        
        response = client.get("/api/v1/presets/non-existent-id")
        
        assert response.status_code == 404
        assert "not found" in response.json()["error"]["message"].lower()
    
    def test_update_preset_success(self, client: TestClient, mock_preset_service: MagicMock):
        """PUT /api/v1/presets/{id} : mettre à jour preset."""
        preset_id = "test-id-123"
        update_data = {
            "name": "Updated Name",
            "icon": "🔥"
        }
        
        response = client.put(f"/api/v1/presets/{preset_id}", json=update_data)
        
        assert response.status_code == 200
        updated = response.json()
        assert "id" in updated
        
        mock_preset_service.update_preset.assert_called_once()
    
    def test_update_preset_not_found(self, client: TestClient, mock_preset_service: MagicMock):
        """PUT /api/v1/presets/{id} : 404 si preset inexistant."""
        mock_preset_service.update_preset.side_effect = FileNotFoundError("Preset not found")
        
        response = client.put("/api/v1/presets/non-existent-id", json={"name": "Test"})
        
        assert response.status_code == 404
    
    def test_delete_preset_success(self, client: TestClient, mock_preset_service: MagicMock):
        """DELETE /api/v1/presets/{id} : supprimer preset."""
        preset_id = "test-id-123"
        
        response = client.delete(f"/api/v1/presets/{preset_id}")
        
        assert response.status_code == 204
        
        mock_preset_service.delete_preset.assert_called_once_with(preset_id)
    
    def test_delete_preset_not_found(self, client: TestClient, mock_preset_service: MagicMock):
        """DELETE /api/v1/presets/{id} : 404 si preset inexistant."""
        mock_preset_service.delete_preset.side_effect = FileNotFoundError("Preset not found")
        
        response = client.delete("/api/v1/presets/non-existent-id")
        
        assert response.status_code == 404
    
    def test_validate_preset_all_valid(self, client: TestClient, mock_preset_service: MagicMock):
        """GET /api/v1/presets/{id}/validate : valider références GDD."""
        preset_id = "test-id-123"
        
        response = client.get(f"/api/v1/presets/{preset_id}/validate")
        
        assert response.status_code == 200
        result = response.json()
        assert result["valid"] is True
        assert result["warnings"] == []
        assert result["obsoleteRefs"] == []
        
        # Vérifier que load_preset puis validate sont appelés
        mock_preset_service.load_preset.assert_called_once_with(preset_id)
        mock_preset_service.validate_preset_references.assert_called_once()
    
    def test_validate_preset_with_obsolete_refs(self, client: TestClient, mock_preset_service: MagicMock):
        """GET /api/v1/presets/{id}/validate : validation échoue avec warnings."""
        preset_id = "test-id-123"
        mock_preset_service.validate_preset_references.return_value = PresetValidationResult(
            valid=False,
            warnings=["Character 'char-999' not found"],
            obsoleteRefs=["char-999"]
        )
        
        response = client.get(f"/api/v1/presets/{preset_id}/validate")
        
        assert response.status_code == 200
        result = response.json()
        assert result["valid"] is False
        assert len(result["warnings"]) == 1
        assert "char-999" in result["warnings"][0]
        assert result["obsoleteRefs"] == ["char-999"]
    
    def test_validate_preset_not_found(self, client: TestClient, mock_preset_service: MagicMock):
        """GET /api/v1/presets/{id}/validate : 404 si preset inexistant."""
        mock_preset_service.load_preset.side_effect = FileNotFoundError("Preset not found")
        
        response = client.get("/api/v1/presets/non-existent-id/validate")
        
        assert response.status_code == 404


class TestPresetsErrorHandling:
    """Tests pour gestion erreurs API presets."""
    
    def test_create_preset_permission_error(self, client: TestClient, mock_preset_service: MagicMock):
        """POST /api/v1/presets : 500 si permissions insuffisantes."""
        mock_preset_service.create_preset.side_effect = PermissionError("Access denied")
        
        preset_data = {
            "name": "Test",
            "configuration": {
                "characters": [],
                "locations": [],
                "region": "Test",
                "sceneType": "Test",
                "instructions": ""
            }
        }
        
        response = client.post("/api/v1/presets", json=preset_data)
        
        assert response.status_code == 500
        assert "permission" in response.json()["error"]["message"].lower()
    
    def test_create_preset_disk_full_error(self, client: TestClient, mock_preset_service: MagicMock):
        """POST /api/v1/presets : 500 si disque plein."""
        mock_preset_service.create_preset.side_effect = OSError("No space left on device")
        
        preset_data = {
            "name": "Test",
            "configuration": {
                "characters": [],
                "locations": [],
                "region": "Test",
                "sceneType": "Test",
                "instructions": ""
            }
        }
        
        response = client.post("/api/v1/presets", json=preset_data)
        
        assert response.status_code == 500

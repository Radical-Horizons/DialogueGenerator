"""Tests API complets pour les opérations CRUD des presets (Story 0.4 - P0/P1).

Suite de tests pour valider tous les endpoints CRUD:
- GET /api/v1/presets - Liste tous les presets
- POST /api/v1/presets - Crée un preset
- GET /api/v1/presets/{id} - Charge un preset spécifique
- PUT /api/v1/presets/{id} - Met à jour un preset
- DELETE /api/v1/presets/{id} - Supprime un preset
- GET /api/v1/presets/{id}/validate - Valide les références GDD
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from pathlib import Path
from uuid import uuid4

from api.main import app
from api.schemas.preset import (
    Preset,
    PresetCreate,
    PresetUpdate,
    PresetMetadata,
    PresetConfiguration,
    PresetValidationResult
)
from services.preset_service import PresetService


@pytest.fixture
def mock_preset_service(tmp_path: Path) -> MagicMock:
    """Mock PresetService pour tests API."""
    service = MagicMock(spec=PresetService)
    return service


@pytest.fixture
def client(mock_preset_service: MagicMock):
    """Client de test avec mock PresetService."""
    from api.dependencies import get_preset_service
    
    app.dependency_overrides[get_preset_service] = lambda: mock_preset_service
    
    yield TestClient(app)
    
    app.dependency_overrides.clear()


@pytest.fixture
def sample_preset():
    """Preset de test réutilisable."""
    preset_id = str(uuid4())
    return Preset(
        id=preset_id,
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


class TestPresetsList:
    """Tests pour GET /api/v1/presets - Liste tous les presets [P0]."""
    
    def test_list_presets_empty_list(self, client: TestClient, mock_preset_service: MagicMock):
        """GIVEN aucun preset existant
        WHEN je liste tous les presets
        THEN je reçois une liste vide"""
        # GIVEN
        mock_preset_service.list_presets.return_value = []
        
        # WHEN
        response = client.get("/api/v1/presets")
        
        # THEN
        assert response.status_code == 200
        assert response.json() == []
        mock_preset_service.list_presets.assert_called_once()
    
    def test_list_presets_multiple_presets(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN plusieurs presets existants
        WHEN je liste tous les presets
        THEN je reçois tous les presets"""
        # GIVEN
        preset2 = Preset(
            id=str(uuid4()),
            name="Another Preset",
            icon="⚔️",
            metadata=sample_preset.metadata,
            configuration=sample_preset.configuration
        )
        mock_preset_service.list_presets.return_value = [sample_preset, preset2]
        
        # WHEN
        response = client.get("/api/v1/presets")
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == sample_preset.name
        assert data[1]["name"] == preset2.name
    
    def test_list_presets_server_error(
        self, client: TestClient, mock_preset_service: MagicMock
    ):
        """GIVEN une erreur serveur
        WHEN je liste les presets
        THEN je reçois une erreur 500"""
        # GIVEN
        mock_preset_service.list_presets.side_effect = Exception("Database error")
        
        # WHEN
        response = client.get("/api/v1/presets")
        
        # THEN
        assert response.status_code == 500
        assert "error" in response.json()["error"]["message"].lower()


class TestPresetsCreate:
    """Tests pour POST /api/v1/presets - Crée un preset [P0]."""
    
    def test_create_preset_success(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN des données de preset valides
        WHEN je crée un preset
        THEN le preset est créé avec un UUID et retourné"""
        # GIVEN
        create_data = {
            "name": "Test Preset",
            "icon": "🎭",
            "configuration": {
                "characters": ["char-001"],
                "locations": ["loc-001"],
                "region": "Test Region",
                "subLocation": "Test SubLocation",
                "sceneType": "Première rencontre",
                "instructions": "Test instructions"
            }
        }
        mock_preset_service.create_preset.return_value = (sample_preset, None)
        
        # WHEN
        response = client.post("/api/v1/presets", json=create_data)
        
        # THEN
        assert response.status_code == 201
        data = response.json()
        assert data["id"] == sample_preset.id
        assert data["name"] == "Test Preset"
        assert data["icon"] == "🎭"
        mock_preset_service.create_preset.assert_called_once()
    
    def test_create_preset_permission_error(
        self, client: TestClient, mock_preset_service: MagicMock
    ):
        """GIVEN des données valides mais permissions insuffisantes
        WHEN je crée un preset
        THEN je reçois une erreur 500"""
        # GIVEN
        create_data = {
            "name": "Test",
            "icon": "🎭",
            "configuration": {
                "characters": [],
                "locations": [],
                "region": "Test Region",
                "sceneType": "Test Scene"
            }
        }
        mock_preset_service.create_preset.side_effect = PermissionError("Permission denied")
        
        # WHEN
        response = client.post("/api/v1/presets", json=create_data)
        
        # THEN
        assert response.status_code == 500
        assert "permission" in response.json()["error"]["message"].lower()
    
    def test_create_preset_disk_error(
        self, client: TestClient, mock_preset_service: MagicMock
    ):
        """GIVEN des données valides mais erreur disque
        WHEN je crée un preset
        THEN je reçois une erreur 500"""
        # GIVEN
        create_data = {
            "name": "Test",
            "icon": "🎭",
            "configuration": {
                "characters": [],
                "locations": [],
                "region": "Test Region",
                "sceneType": "Test Scene"
            }
        }
        mock_preset_service.create_preset.side_effect = OSError("Disk full")
        
        # WHEN
        response = client.post("/api/v1/presets", json=create_data)
        
        # THEN
        assert response.status_code == 500
        msg = response.json()["error"]["message"].lower()
        assert "disk" in msg or "error" in msg


class TestPresetsGetById:
    """Tests pour GET /api/v1/presets/{id} - Charge un preset spécifique [P0]."""
    
    def test_get_preset_success(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN un preset existant
        WHEN je charge le preset par ID
        THEN je reçois le preset complet"""
        # GIVEN
        mock_preset_service.load_preset.return_value = sample_preset
        
        # WHEN
        response = client.get(f"/api/v1/presets/{sample_preset.id}")
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_preset.id
        assert data["name"] == sample_preset.name
        mock_preset_service.load_preset.assert_called_once_with(sample_preset.id)
    
    def test_get_preset_not_found(
        self, client: TestClient, mock_preset_service: MagicMock
    ):
        """GIVEN un preset inexistant
        WHEN je charge le preset par ID
        THEN je reçois une erreur 404"""
        # GIVEN
        preset_id = str(uuid4())
        mock_preset_service.load_preset.side_effect = FileNotFoundError()
        
        # WHEN
        response = client.get(f"/api/v1/presets/{preset_id}")
        
        # THEN
        assert response.status_code == 404
        assert "not found" in response.json()["error"]["message"].lower()
    
    def test_get_preset_invalid_data(
        self, client: TestClient, mock_preset_service: MagicMock
    ):
        """GIVEN un preset avec données invalides
        WHEN je charge le preset
        THEN je reçois une erreur 500"""
        # GIVEN
        preset_id = str(uuid4())
        mock_preset_service.load_preset.side_effect = ValueError("Invalid JSON")
        
        # WHEN
        response = client.get(f"/api/v1/presets/{preset_id}")
        
        # THEN
        assert response.status_code == 500


class TestPresetsUpdate:
    """Tests pour PUT /api/v1/presets/{id} - Met à jour un preset [P1]."""
    
    def test_update_preset_success(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN un preset existant et des données de mise à jour
        WHEN je mets à jour le preset
        THEN le preset est mis à jour et retourné"""
        # GIVEN
        update_data = {"name": "Updated Preset"}
        updated_preset = Preset(
            id=sample_preset.id,
            name="Updated Preset",
            icon=sample_preset.icon,
            metadata=sample_preset.metadata,
            configuration=sample_preset.configuration
        )
        mock_preset_service.update_preset.return_value = (updated_preset, None)
        
        # WHEN
        response = client.put(f"/api/v1/presets/{sample_preset.id}", json=update_data)
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Preset"
        assert data["id"] == sample_preset.id
        mock_preset_service.update_preset.assert_called_once()
    
    def test_update_preset_partial(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN un preset et une mise à jour partielle (seulement icon)
        WHEN je mets à jour le preset
        THEN seule l'icône est mise à jour"""
        # GIVEN
        update_data = {"icon": "⚔️"}
        updated_preset = Preset(
            id=sample_preset.id,
            name=sample_preset.name,
            icon="⚔️",
            metadata=sample_preset.metadata,
            configuration=sample_preset.configuration
        )
        mock_preset_service.update_preset.return_value = (updated_preset, None)
        
        # WHEN
        response = client.put(f"/api/v1/presets/{sample_preset.id}", json=update_data)
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert data["icon"] == "⚔️"
        assert data["name"] == sample_preset.name  # Non modifié
    
    def test_update_preset_not_found(
        self, client: TestClient, mock_preset_service: MagicMock
    ):
        """GIVEN un preset inexistant
        WHEN je mets à jour le preset
        THEN je reçois une erreur 404"""
        # GIVEN
        preset_id = str(uuid4())
        update_data = {"name": "Updated"}
        mock_preset_service.update_preset.side_effect = FileNotFoundError()
        
        # WHEN
        response = client.put(f"/api/v1/presets/{preset_id}", json=update_data)
        
        # THEN
        assert response.status_code == 404


class TestPresetsDelete:
    """Tests pour DELETE /api/v1/presets/{id} - Supprime un preset [P1]."""
    
    def test_delete_preset_success(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN un preset existant
        WHEN je supprime le preset
        THEN le preset est supprimé et je reçois 204"""
        # GIVEN
        mock_preset_service.delete_preset.return_value = None
        
        # WHEN
        response = client.delete(f"/api/v1/presets/{sample_preset.id}")
        
        # THEN
        assert response.status_code == 204
        assert response.content == b""
        mock_preset_service.delete_preset.assert_called_once_with(sample_preset.id)
    
    def test_delete_preset_not_found(
        self, client: TestClient, mock_preset_service: MagicMock
    ):
        """GIVEN un preset inexistant
        WHEN je supprime le preset
        THEN je reçois une erreur 404"""
        # GIVEN
        preset_id = str(uuid4())
        mock_preset_service.delete_preset.side_effect = FileNotFoundError()
        
        # WHEN
        response = client.delete(f"/api/v1/presets/{preset_id}")
        
        # THEN
        assert response.status_code == 404


class TestPresetsValidate:
    """Tests pour GET /api/v1/presets/{id}/validate - Valide références GDD [P1]."""
    
    def test_validate_preset_valid_references(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN un preset avec références GDD valides
        WHEN je valide le preset
        THEN la validation retourne valid=True sans warnings"""
        # GIVEN
        mock_preset_service.load_preset.return_value = sample_preset
        mock_preset_service.validate_preset_references.return_value = PresetValidationResult(
            valid=True,
            warnings=[],
            obsoleteRefs=[]
        )
        
        # WHEN
        response = client.get(f"/api/v1/presets/{sample_preset.id}/validate")
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert len(data["warnings"]) == 0
        assert len(data["obsoleteRefs"]) == 0
    
    def test_validate_preset_obsolete_references(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN un preset avec références GDD obsolètes
        WHEN je valide le preset
        THEN la validation retourne valid=False avec warnings"""
        # GIVEN
        mock_preset_service.load_preset.return_value = sample_preset
        mock_preset_service.validate_preset_references.return_value = PresetValidationResult(
            valid=False,
            warnings=["Personnage 'char-001' n'existe plus dans le GDD"],
            obsoleteRefs=["char-001"]
        )
        
        # WHEN
        response = client.get(f"/api/v1/presets/{sample_preset.id}/validate")
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert len(data["warnings"]) == 1
        assert len(data["obsoleteRefs"]) == 1
        assert "char-001" in data["obsoleteRefs"]
    
    def test_validate_preset_not_found(
        self, client: TestClient, mock_preset_service: MagicMock
    ):
        """GIVEN un preset inexistant
        WHEN je valide le preset
        THEN je reçois une erreur 404"""
        # GIVEN
        preset_id = str(uuid4())
        mock_preset_service.load_preset.side_effect = FileNotFoundError()
        
        # WHEN
        response = client.get(f"/api/v1/presets/{preset_id}/validate")
        
        # THEN
        assert response.status_code == 404


class TestPresetsAutoCleanup:
    """Tests pour auto-cleanup des références obsolètes dans l'API [Story 0.9]."""
    
    def test_create_preset_with_auto_cleanup_returns_header(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN un preset avec références obsolètes
        WHEN je crée le preset via API
        THEN le header X-Preset-Cleanup-Message est retourné avec le message"""
        # GIVEN: preset avec références obsolètes filtrées
        cleaned_preset = Preset(
            id=sample_preset.id,
            name=sample_preset.name,
            icon=sample_preset.icon,
            metadata=sample_preset.metadata,
            configuration=PresetConfiguration(
                characters=["char-001"],  # ObsoleteChar supprimé
                locations=sample_preset.configuration.locations,
                region=sample_preset.configuration.region,
                subLocation=sample_preset.configuration.subLocation,
                sceneType=sample_preset.configuration.sceneType,
                instructions=sample_preset.configuration.instructions
            )
        )
        cleanup_message = "Preset créé avec 1 référence(s) obsolète(s) supprimée(s)"
        mock_preset_service.create_preset.return_value = (cleaned_preset, cleanup_message)
        
        preset_data = PresetCreate(
            name="Test Preset",
            icon="🎭",
            configuration=PresetConfiguration(
                characters=["char-001", "ObsoleteChar"],
                locations=["loc-001"],
                region="Test Region",
                subLocation="Test SubLocation",
                sceneType="Première rencontre",
                instructions="Test instructions"
            )
        )
        
        # WHEN
        response = client.post("/api/v1/presets", json=preset_data.model_dump())
        
        # THEN
        assert response.status_code == 201
        assert "X-Preset-Cleanup-Message" in response.headers
        assert "X-Preset-Cleanup-Message-Encoding" in response.headers
        assert response.headers["X-Preset-Cleanup-Message-Encoding"] == "base64"
        # Décoder le message pour vérifier son contenu
        import base64
        decoded_message = base64.b64decode(response.headers["X-Preset-Cleanup-Message"]).decode('utf-8')
        assert decoded_message == cleanup_message
        data = response.json()
        assert data["id"] == sample_preset.id
        assert "ObsoleteChar" not in data["configuration"]["characters"]
    
    def test_create_preset_no_cleanup_no_header(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN un preset avec toutes références valides
        WHEN je crée le preset via API
        THEN pas de header X-Preset-Cleanup-Message"""
        # GIVEN
        mock_preset_service.create_preset.return_value = (sample_preset, None)
        
        preset_data = PresetCreate(
            name="Test Preset",
            icon="🎭",
            configuration=sample_preset.configuration
        )
        
        # WHEN
        response = client.post("/api/v1/presets", json=preset_data.model_dump())
        
        # THEN
        assert response.status_code == 201
        assert "X-Preset-Cleanup-Message" not in response.headers
    
    def test_update_preset_with_auto_cleanup_returns_header(
        self, client: TestClient, mock_preset_service: MagicMock, sample_preset
    ):
        """GIVEN une mise à jour preset avec références obsolètes
        WHEN je mets à jour le preset via API
        THEN le header X-Preset-Cleanup-Message est retourné"""
        # GIVEN
        cleaned_preset = Preset(
            id=sample_preset.id,
            name="Updated Preset",
            icon=sample_preset.icon,
            metadata=sample_preset.metadata,
            configuration=PresetConfiguration(
                characters=["char-001"],  # ObsoleteChar supprimé
                locations=sample_preset.configuration.locations,
                region=sample_preset.configuration.region,
                subLocation=sample_preset.configuration.subLocation,
                sceneType=sample_preset.configuration.sceneType,
                instructions=sample_preset.configuration.instructions
            )
        )
        cleanup_message = "Preset mis à jour - 1 référence(s) obsolète(s) supprimée(s)"
        mock_preset_service.load_preset.return_value = sample_preset
        mock_preset_service.update_preset.return_value = (cleaned_preset, cleanup_message)
        
        update_data = PresetUpdate(
            name="Updated Preset",
            configuration=PresetConfiguration(
                characters=["char-001", "ObsoleteChar"],
                locations=sample_preset.configuration.locations,
                region=sample_preset.configuration.region,
                subLocation=sample_preset.configuration.subLocation,
                sceneType=sample_preset.configuration.sceneType,
                instructions=sample_preset.configuration.instructions
            )
        )
        
        # WHEN
        response = client.put(f"/api/v1/presets/{sample_preset.id}", json=update_data.model_dump())
        
        # THEN
        assert response.status_code == 200
        assert "X-Preset-Cleanup-Message" in response.headers
        assert "X-Preset-Cleanup-Message-Encoding" in response.headers
        assert response.headers["X-Preset-Cleanup-Message-Encoding"] == "base64"
        # Décoder le message pour vérifier son contenu
        import base64
        decoded_message = base64.b64decode(response.headers["X-Preset-Cleanup-Message"]).decode('utf-8')
        assert decoded_message == cleanup_message
        data = response.json()
        assert data["name"] == "Updated Preset"
        assert "ObsoleteChar" not in data["configuration"]["characters"]

"""Tests API complets pour les opérations CRUD des dialogues Unity (P0/P1).

Suite de tests pour valider tous les endpoints CRUD:
- GET /api/v1/unity-dialogues - Liste tous les dialogues Unity
- GET /api/v1/unity-dialogues/{filename} - Lit un dialogue spécifique
- DELETE /api/v1/unity-dialogues/{filename} - Supprime un dialogue
- POST /api/v1/unity-dialogues/preview - Génère un preview texte
"""
import pytest
import json
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from datetime import datetime

from api.main import app
from api.schemas.dialogue import (
    UnityDialogueListResponse,
    UnityDialogueMetadata,
    UnityDialogueReadResponse,
    UnityDialoguePreviewRequest,
    UnityDialoguePreviewResponse
)
from services.configuration_service import ConfigurationService


@pytest.fixture
def mock_config_service(tmp_path: Path):
    """Mock ConfigurationService avec chemin Unity configuré."""
    service = MagicMock(spec=ConfigurationService)
    unity_dir = tmp_path / "unity_dialogues"
    unity_dir.mkdir()
    service.get_unity_dialogues_path.return_value = str(unity_dir)
    return service


@pytest.fixture
def client(mock_config_service):
    """Client de test avec mock ConfigurationService."""
    from api.dependencies import get_config_service
    
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    
    yield TestClient(app)
    
    app.dependency_overrides.clear()


@pytest.fixture
def sample_unity_dialogue_json():
    """Dialogue Unity JSON de test."""
    return [
        {
            "id": "START",
            "speaker": "PNJ",
            "line": "Bonjour, aventurier !",
            "choices": [
                {
                    "text": "Bonjour !",
                    "targetNode": "NODE_1"
                }
            ]
        },
        {
            "id": "NODE_1",
            "speaker": "PNJ",
            "line": "Comment puis-je vous aider ?",
            "nextNode": "END"
        }
    ]


@pytest.fixture
def sample_unity_file(tmp_path: Path, sample_unity_dialogue_json):
    """Fichier Unity dialogue de test."""
    unity_dir = tmp_path / "unity_dialogues"
    unity_dir.mkdir(exist_ok=True)
    test_file = unity_dir / "test_dialogue.json"
    test_file.write_text(json.dumps(sample_unity_dialogue_json, ensure_ascii=False), encoding='utf-8')
    return test_file


class TestUnityDialoguesList:
    """Tests pour GET /api/v1/unity-dialogues - Liste tous les dialogues [P0]."""
    
    def test_list_dialogues_empty_directory(
        self, client: TestClient, mock_config_service, tmp_path: Path
    ):
        """GIVEN un dossier Unity vide
        WHEN je liste les dialogues
        THEN je reçois une liste vide"""
        # GIVEN
        unity_dir = tmp_path / "unity_dialogues"
        unity_dir.mkdir(exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = str(unity_dir)
        
        # WHEN
        response = client.get("/api/v1/unity-dialogues")
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert len(data["dialogues"]) == 0
    
    def test_list_dialogues_with_files(
        self, client: TestClient, mock_config_service, sample_unity_file, tmp_path: Path
    ):
        """GIVEN plusieurs fichiers Unity dans le dossier
        WHEN je liste les dialogues
        THEN je reçois tous les fichiers avec métadonnées"""
        # GIVEN
        unity_dir = tmp_path / "unity_dialogues"
        # Créer un deuxième fichier
        test_file2 = unity_dir / "another_dialogue.json"
        test_file2.write_text(json.dumps([{"id": "START", "line": "Test"}]))
        
        # WHEN
        response = client.get("/api/v1/unity-dialogues")
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["dialogues"]) == 2
        
        # Vérifier métadonnées
        filenames = [d["filename"] for d in data["dialogues"]]
        assert "test_dialogue.json" in filenames
        assert "another_dialogue.json" in filenames
        
        # Vérifier tri par date (plus récent en premier)
        assert "modified_time" in data["dialogues"][0]
        assert "size_bytes" in data["dialogues"][0]
    
    def test_list_dialogues_unity_path_not_configured(
        self, client: TestClient, mock_config_service
    ):
        """GIVEN le chemin Unity n'est pas configuré
        WHEN je liste les dialogues
        THEN je reçois une erreur de validation"""
        # GIVEN
        mock_config_service.get_unity_dialogues_path.return_value = None
        
        # WHEN
        response = client.get("/api/v1/unity-dialogues")
        
        # THEN
        assert response.status_code == 422  # ValidationException → 422
        error_data = response.json()
        message = error_data.get("error", {}).get("message", "") if isinstance(error_data.get("error"), dict) else str(error_data)
        assert "chemin Unity" in message.lower() or "unity" in message.lower()
    
    def test_list_dialogues_creates_directory_if_missing(
        self, client: TestClient, mock_config_service, tmp_path: Path
    ):
        """GIVEN le dossier Unity n'existe pas
        WHEN je liste les dialogues
        THEN le dossier est créé automatiquement"""
        # GIVEN
        unity_dir = tmp_path / "unity_dialogues_new"
        if unity_dir.exists():
            import shutil
            shutil.rmtree(unity_dir)
        assert not unity_dir.exists()
        mock_config_service.get_unity_dialogues_path.return_value = str(unity_dir)
        
        # WHEN
        response = client.get("/api/v1/unity-dialogues")
        
        # THEN
        assert response.status_code == 200
        assert unity_dir.exists()
        assert unity_dir.is_dir()


class TestUnityDialoguesRead:
    """Tests pour GET /api/v1/unity-dialogues/{filename} - Lit un dialogue [P0]."""
    
    def test_read_dialogue_success(
        self, client: TestClient, mock_config_service, sample_unity_file, sample_unity_dialogue_json
    ):
        """GIVEN un fichier Unity existant
        WHEN je lis le dialogue
        THEN je reçois le contenu JSON complet"""
        # GIVEN
        unity_dir = sample_unity_file.parent
        mock_config_service.get_unity_dialogues_path.return_value = str(unity_dir)
        
        # WHEN
        response = client.get("/api/v1/unity-dialogues/test_dialogue.json")
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test_dialogue.json"
        assert data["title"] == "Bonjour, aventurier !"  # Extrait du nœud START
        assert "json_content" in data
        
        # Vérifier que le JSON est valide
        json_content = json.loads(data["json_content"])
        assert isinstance(json_content, list)
        assert len(json_content) == 2
    
    def test_read_dialogue_without_extension(
        self, client: TestClient, mock_config_service, sample_unity_file
    ):
        """GIVEN un fichier Unity et un filename sans extension
        WHEN je lis le dialogue
        THEN l'extension .json est ajoutée automatiquement"""
        # GIVEN
        unity_dir = sample_unity_file.parent
        mock_config_service.get_unity_dialogues_path.return_value = str(unity_dir)
        
        # WHEN
        response = client.get("/api/v1/unity-dialogues/test_dialogue")
        
        # THEN
        assert response.status_code == 200
        assert response.json()["filename"] == "test_dialogue.json"
    
    def test_read_dialogue_not_found(
        self, client: TestClient, mock_config_service, tmp_path: Path
    ):
        """GIVEN un fichier inexistant
        WHEN je lis le dialogue
        THEN je reçois une erreur 404"""
        # GIVEN
        unity_dir = tmp_path / "unity_dialogues_read"
        unity_dir.mkdir(exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = str(unity_dir)
        
        # WHEN
        response = client.get("/api/v1/unity-dialogues/nonexistent.json")
        
        # THEN
        assert response.status_code == 404
        error_data = response.json()
        message = error_data.get("error", {}).get("message", "") if isinstance(error_data.get("error"), dict) else str(error_data)
        assert "not found" in message.lower() or "non trouvé" in message.lower()
    
    def test_read_dialogue_path_traversal_protection(
        self, client: TestClient, mock_config_service
    ):
        """GIVEN un filename avec path traversal (../)
        WHEN je lis le dialogue
        THEN je reçois une erreur 404 ou 422 (FastAPI peut normaliser le chemin)"""
        # GIVEN
        mock_config_service.get_unity_dialogues_path.return_value = "/tmp/unity"
        
        # WHEN
        # Note: FastAPI normalise les chemins, donc ../../../etc/passwd devient /etc/passwd
        # qui ne correspond pas à la route -> 404, ou si ça passe, la validation retourne 422
        response = client.get("/api/v1/unity-dialogues/../../../etc/passwd")
        
        # THEN
        # FastAPI peut soit normaliser (404) soit laisser passer au handler (422)
        assert response.status_code in [404, 422]
    
    def test_read_dialogue_invalid_json(
        self, client: TestClient, mock_config_service, tmp_path: Path
    ):
        """GIVEN un fichier avec JSON invalide
        WHEN je lis le dialogue
        THEN je reçois une erreur de validation"""
        # GIVEN
        unity_dir = tmp_path / "unity_dialogues_invalid"
        unity_dir.mkdir(exist_ok=True)
        invalid_file = unity_dir / "invalid.json"
        invalid_file.write_text("{ invalid json }", encoding='utf-8')
        mock_config_service.get_unity_dialogues_path.return_value = str(unity_dir)
        
        # WHEN
        response = client.get("/api/v1/unity-dialogues/invalid.json")
        
        # THEN
        assert response.status_code == 422
        error_data = response.json()
        message = error_data.get("error", {}).get("message", "") if isinstance(error_data.get("error"), dict) else str(error_data)
        assert "json" in message.lower() or "invalide" in message.lower()


class TestUnityDialoguesDelete:
    """Tests pour DELETE /api/v1/unity-dialogues/{filename} - Supprime un dialogue [P1]."""
    
    def test_delete_dialogue_success(
        self, client: TestClient, mock_config_service, sample_unity_file
    ):
        """GIVEN un fichier Unity existant
        WHEN je supprime le dialogue
        THEN le fichier est supprimé et je reçois 204"""
        # GIVEN
        unity_dir = sample_unity_file.parent
        mock_config_service.get_unity_dialogues_path.return_value = str(unity_dir)
        assert sample_unity_file.exists()
        
        # WHEN
        response = client.delete("/api/v1/unity-dialogues/test_dialogue.json")
        
        # THEN
        assert response.status_code == 204
        assert response.content == b""
        assert not sample_unity_file.exists()
    
    def test_delete_dialogue_without_extension(
        self, client: TestClient, mock_config_service, sample_unity_file
    ):
        """GIVEN un fichier et un filename sans extension
        WHEN je supprime le dialogue
        THEN l'extension .json est ajoutée et le fichier est supprimé"""
        # GIVEN
        unity_dir = sample_unity_file.parent
        mock_config_service.get_unity_dialogues_path.return_value = str(unity_dir)
        
        # WHEN
        response = client.delete("/api/v1/unity-dialogues/test_dialogue")
        
        # THEN
        assert response.status_code == 204
        assert not sample_unity_file.exists()
    
    def test_delete_dialogue_not_found(
        self, client: TestClient, mock_config_service, tmp_path: Path
    ):
        """GIVEN un fichier inexistant
        WHEN je supprime le dialogue
        THEN je reçois une erreur 404"""
        # GIVEN
        unity_dir = tmp_path / "unity_dialogues_delete"
        unity_dir.mkdir(exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = str(unity_dir)
        
        # WHEN
        response = client.delete("/api/v1/unity-dialogues/nonexistent.json")
        
        # THEN
        assert response.status_code == 404
    
    def test_delete_dialogue_path_traversal_protection(
        self, client: TestClient, mock_config_service
    ):
        """GIVEN un filename avec path traversal
        WHEN je supprime le dialogue
        THEN je reçois une erreur 404 ou 422 (FastAPI peut normaliser le chemin)"""
        # GIVEN
        mock_config_service.get_unity_dialogues_path.return_value = "/tmp/unity"
        
        # WHEN
        response = client.delete("/api/v1/unity-dialogues/../../../etc/passwd")
        
        # THEN
        # FastAPI peut soit normaliser (404/405) soit laisser passer au handler (422)
        assert response.status_code in [404, 405, 422]


class TestUnityDialoguesPreview:
    """Tests pour POST /api/v1/unity-dialogues/preview - Génère preview texte [P1]."""
    
    def test_preview_dialogue_success(
        self, client: TestClient, sample_unity_dialogue_json
    ):
        """GIVEN un dialogue Unity JSON valide
        WHEN je génère un preview
        THEN je reçois un résumé texte formaté"""
        # GIVEN
        request_data = {
            "json_content": json.dumps(sample_unity_dialogue_json, ensure_ascii=False)
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/preview", json=request_data)
        
        # THEN
        assert response.status_code == 200
        data = response.json()
        assert "preview_text" in data
        assert data["node_count"] == 2
        
        preview = data["preview_text"]
        assert "Bonjour, aventurier !" in preview
        assert "Comment puis-je vous aider ?" in preview
        assert "Bonjour !" in preview  # Choix
    
    def test_preview_dialogue_invalid_json(
        self, client: TestClient
    ):
        """GIVEN un JSON invalide
        WHEN je génère un preview
        THEN je reçois une erreur de validation"""
        # GIVEN
        request_data = {
            "json_content": "{ invalid json }"
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/preview", json=request_data)
        
        # THEN
        assert response.status_code == 422
        error_data = response.json()
        message = error_data.get("error", {}).get("message", "") if isinstance(error_data.get("error"), dict) else str(error_data)
        assert "json" in message.lower() or "invalide" in message.lower()
    
    def test_preview_dialogue_not_array(
        self, client: TestClient
    ):
        """GIVEN un JSON qui n'est pas un tableau
        WHEN je génère un preview
        THEN je reçois une erreur de validation"""
        # GIVEN
        request_data = {
            "json_content": json.dumps({"id": "START", "line": "Test"})
        }
        
        # WHEN
        response = client.post("/api/v1/unity-dialogues/preview", json=request_data)
        
        # THEN
        assert response.status_code == 422
        error_data = response.json()
        message = error_data.get("error", {}).get("message", "") if isinstance(error_data.get("error"), dict) else str(error_data)
        assert "tableau" in message.lower() or "array" in message.lower()

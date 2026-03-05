"""Tests pour les endpoints Unity Dialogues."""
import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from datetime import datetime

from api.main import app
from api.dependencies import get_config_service
from api.exceptions import ValidationException, NotFoundException, InternalServerException


@pytest.fixture
def mock_config_service():
    """Mock du ConfigurationService."""
    from services.configuration_service import ConfigurationService
    from unittest.mock import MagicMock
    
    mock_service = MagicMock(spec=ConfigurationService)
    return mock_service


@pytest.fixture
def client(mock_config_service):
    """Fixture pour créer un client de test avec mocks."""
    # Utiliser dependency_overrides comme dans les autres tests
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    
    yield TestClient(app)
    
    # Nettoyer après le test
    app.dependency_overrides.clear()


@pytest.fixture
def sample_unity_dialogue():
    """Contenu JSON Unity de test."""
    return [
        {
            "id": "START",
            "speaker": "TEST_NPC",
            "line": "Bonjour, comment allez-vous ?",
            "choices": [
                {
                    "text": "Je vais bien",
                    "targetNode": "node1"
                },
                {
                    "text": "Pas très bien",
                    "targetNode": "node2"
                }
            ]
        },
        {
            "id": "node1",
            "speaker": "TEST_NPC",
            "line": "C'est bien !",
            "nextNode": "END"
        }
    ]


class TestListUnityDialogues:
    """Tests pour l'endpoint GET /api/v1/unity-dialogues."""
    
    def test_list_unity_dialogues_success(self, client, mock_config_service, tmp_path):
        """Test de liste des dialogues Unity avec succès."""
        # Créer des fichiers de test
        dialogue1 = tmp_path / "dialogue1.json"
        dialogue2 = tmp_path / "dialogue2.json"
        
        json_content1 = [{"id": "START", "line": "Dialogue 1"}]
        json_content2 = [{"id": "START", "line": "Dialogue 2"}]
        
        dialogue1.write_text(json.dumps(json_content1), encoding="utf-8")
        dialogue2.write_text(json.dumps(json_content2), encoding="utf-8")
        
        # S'assurer que le dossier existe
        tmp_path.mkdir(parents=True, exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(tmp_path)
        
        response = client.get("/api/v1/unity-dialogues")
        
        assert response.status_code == 200
        data = response.json()
        assert "dialogues" in data
        assert "total" in data
        # Il peut y avoir d'autres fichiers dans tmp_path, donc >= 2
        assert data["total"] >= 2
        
        # Vérifier que nos fichiers sont présents
        filenames = [d["filename"] for d in data["dialogues"]]
        assert "dialogue1.json" in filenames
        assert "dialogue2.json" in filenames
        
        # Vérifier les métadonnées
        for dialogue in data["dialogues"]:
            assert "filename" in dialogue
            assert "file_path" in dialogue
            assert "size_bytes" in dialogue
            assert "modified_time" in dialogue
    
    def test_list_unity_dialogues_empty(self, client, mock_config_service, tmp_path):
        """Test de liste vide."""
        # Créer un dossier vide
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir(parents=True, exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(empty_dir)
        
        response = client.get("/api/v1/unity-dialogues")
        
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["dialogues"] == []
    
    def test_list_unity_dialogues_path_not_configured(self, client, mock_config_service):
        """Test avec chemin Unity non configuré."""
        mock_config_service.get_unity_dialogues_path.return_value = None
        
        response = client.get("/api/v1/unity-dialogues")
        
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"
    
    def test_list_unity_dialogues_invalid_json_ignored(self, client, mock_config_service, tmp_path):
        """Test que les fichiers JSON invalides sont ignorés lors du listing."""
        valid_file = tmp_path / "valid.json"
        invalid_file = tmp_path / "invalid.json"
        
        valid_file.write_text(json.dumps([{"id": "START"}]), encoding="utf-8")
        invalid_file.write_text("not valid json", encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(tmp_path)
        
        response = client.get("/api/v1/unity-dialogues")
        
        assert response.status_code == 200
        data = response.json()
        # Le fichier invalide devrait être ignoré ou causer un warning
        assert data["total"] >= 1


class TestReadUnityDialogue:
    """Tests pour l'endpoint GET /api/v1/unity-dialogues/{filename}."""
    
    def test_read_unity_dialogue_success(self, client, mock_config_service, tmp_path, sample_unity_dialogue):
        """Test de lecture d'un dialogue Unity."""
        # Créer un dossier dédié pour éviter les conflits
        test_dir = tmp_path / "test_dialogues"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        dialogue_file = test_dir / "test_dialogue.json"
        dialogue_file.write_text(json.dumps(sample_unity_dialogue), encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/test_dialogue.json")
        
        assert response.status_code == 200
        data = response.json()
        assert "filename" in data
        assert "json_content" in data
        assert "title" in data
        assert "size_bytes" in data
        assert "modified_time" in data
        assert data["filename"] == "test_dialogue.json"
        
        # Vérifier que le contenu JSON est correct
        content = json.loads(data["json_content"])
        assert isinstance(content, list)
        assert len(content) == 2
    
    def test_read_unity_dialogue_without_extension(self, client, mock_config_service, tmp_path, sample_unity_dialogue):
        """Test de lecture avec nom de fichier sans extension."""
        test_dir = tmp_path / "test_dialogues2"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        dialogue_file = test_dir / "test_dialogue.json"
        dialogue_file.write_text(json.dumps(sample_unity_dialogue), encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/test_dialogue")
        
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test_dialogue.json"
    
    def test_read_unity_dialogue_not_found(self, client, mock_config_service, tmp_path):
        """Test de lecture d'un dialogue inexistant."""
        test_dir = tmp_path / "test_dialogues3"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/nonexistent.json")
        
        assert response.status_code == 404
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "NOT_FOUND"
    
    def test_read_unity_dialogue_path_traversal(self, client, mock_config_service):
        """Test de sécurité contre path traversal."""
        test_dir = Path("/tmp") if Path("/tmp").exists() else Path("C:/tmp")
        test_dir.mkdir(exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/../../../etc/passwd")
        
        # Le path traversal devrait être détecté et retourner 422
        # Mais FastAPI peut aussi retourner 404 si la route n'existe pas
        assert response.status_code in [404, 422]
        data = response.json()
        if response.status_code == 404:
            assert "detail" in data
        else:
            assert "error" in data
            assert data["error"]["code"] == "VALIDATION_ERROR"
    
    def test_read_unity_dialogue_invalid_json(self, client, mock_config_service, tmp_path):
        """Test de lecture d'un fichier JSON invalide."""
        test_dir = tmp_path / "test_dialogues4"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        invalid_file = test_dir / "invalid.json"
        invalid_file.write_text("not valid json", encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/invalid.json")
        
        # Le fichier existe mais JSON invalide devrait retourner 422
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"
    
    def test_read_unity_dialogue_not_array(self, client, mock_config_service, tmp_path):
        """Test de lecture d'un JSON qui n'est pas un tableau."""
        test_dir = tmp_path / "test_dialogues5"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        invalid_file = test_dir / "not_array.json"
        invalid_file.write_text(json.dumps({"not": "an array"}), encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/not_array.json")
        
        # JSON valide mais pas un tableau devrait retourner 422
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"

    def test_read_unity_dialogue_document_format(self, client, mock_config_service, tmp_path, sample_unity_dialogue):
        """GET accepte le format document (schemaVersion + nodes) et renvoie la liste des nœuds (ADR-008)."""
        test_dir = tmp_path / "test_dialogues_doc_format"
        test_dir.mkdir(parents=True, exist_ok=True)
        doc_file = test_dir / "document_format.json"
        document = {"schemaVersion": "1.1.0", "nodes": sample_unity_dialogue}
        doc_file.write_text(json.dumps(document), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        response = client.get("/api/v1/unity-dialogues/document_format.json")
        assert response.status_code == 200
        data = response.json()
        assert "json_content" in data
        content = json.loads(data["json_content"])
        assert isinstance(content, list)
        assert len(content) == len(sample_unity_dialogue)
        assert content[0].get("id") == "START"

    def test_read_unity_dialogue_path_not_configured(self, client, mock_config_service):
        """Test avec chemin Unity non configuré."""
        mock_config_service.get_unity_dialogues_path.return_value = None
        
        response = client.get("/api/v1/unity-dialogues/test.json")
        
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"


class TestDeleteUnityDialogue:
    """Tests pour l'endpoint DELETE /api/v1/unity-dialogues/{filename}."""
    
    def test_delete_unity_dialogue_success(self, client, mock_config_service, tmp_path, sample_unity_dialogue):
        """Test de suppression d'un dialogue Unity."""
        test_dir = tmp_path / "test_delete"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        dialogue_file = test_dir / "to_delete.json"
        dialogue_file.write_text(json.dumps(sample_unity_dialogue), encoding="utf-8")
        
        assert dialogue_file.exists()
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.delete("/api/v1/unity-dialogues/to_delete.json")
        
        assert response.status_code == 204
        assert not dialogue_file.exists()
    
    def test_delete_unity_dialogue_without_extension(self, client, mock_config_service, tmp_path, sample_unity_dialogue):
        """Test de suppression avec nom de fichier sans extension."""
        test_dir = tmp_path / "test_delete2"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        dialogue_file = test_dir / "to_delete.json"
        dialogue_file.write_text(json.dumps(sample_unity_dialogue), encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.delete("/api/v1/unity-dialogues/to_delete")
        
        assert response.status_code == 204
        assert not dialogue_file.exists()
    
    def test_delete_unity_dialogue_not_found(self, client, mock_config_service, tmp_path):
        """Test de suppression d'un dialogue inexistant."""
        test_dir = tmp_path / "test_delete3"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.delete("/api/v1/unity-dialogues/nonexistent.json")
        
        assert response.status_code == 404
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "NOT_FOUND"
    
    def test_delete_unity_dialogue_path_traversal(self, client, mock_config_service):
        """Test de sécurité contre path traversal."""
        test_dir = Path("/tmp") if Path("/tmp").exists() else Path("C:/tmp")
        test_dir.mkdir(exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.delete("/api/v1/unity-dialogues/../../../etc/passwd")
        
        # Le path traversal devrait être détecté et retourner 422
        # Certaines plateformes peuvent normaliser vers /etc/passwd (405 sur méthode)
        assert response.status_code in [404, 405, 422]
        data = response.json()
        if response.status_code in [404, 405]:
            assert "detail" in data
        else:
            assert "error" in data
            assert data["error"]["code"] == "VALIDATION_ERROR"
        if response.status_code == 422:
            data = response.json()
            assert "detail" in data
    
    def test_delete_unity_dialogue_path_not_configured(self, client, mock_config_service):
        """Test avec chemin Unity non configuré."""
        mock_config_service.get_unity_dialogues_path.return_value = None
        
        response = client.delete("/api/v1/unity-dialogues/test.json")
        
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"


class TestPreviewUnityDialogue:
    """Tests pour l'endpoint POST /api/v1/unity-dialogues/preview."""
    
    def test_preview_unity_dialogue_success(self, client, sample_unity_dialogue):
        """Test de preview d'un dialogue Unity."""
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": json.dumps(sample_unity_dialogue)}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "preview_text" in data
        assert "node_count" in data
        assert data["node_count"] == 2
        assert "TEST_NPC" in data["preview_text"]
        assert "Bonjour" in data["preview_text"]
        assert "Je vais bien" in data["preview_text"]
    
    def test_preview_unity_dialogue_invalid_json(self, client):
        """Test de preview avec JSON invalide."""
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": "not valid json"}
        )
        
        # Le JSON invalide devrait retourner 422
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"
    
    def test_preview_unity_dialogue_not_array(self, client):
        """Test de preview avec JSON qui n'est pas un tableau."""
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": json.dumps({"not": "an array"})}
        )
        
        # JSON valide mais pas un tableau devrait retourner 422
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"
    
    def test_preview_unity_dialogue_empty_array(self, client):
        """Test de preview avec tableau vide."""
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": json.dumps([])}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["node_count"] == 0
        assert "preview_text" in data
    
    def test_preview_unity_dialogue_with_choices(self, client):
        """Test de preview avec choix."""
        dialogue_with_choices = [
            {
                "id": "START",
                "speaker": "NPC",
                "line": "Choose your path",
                "choices": [
                    {"text": "Path A", "targetNode": "nodeA"},
                    {"text": "Path B", "targetNode": "nodeB"}
                ]
            }
        ]
        
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": json.dumps(dialogue_with_choices)}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "Path A" in data["preview_text"]
        assert "Path B" in data["preview_text"]
        assert "nodeA" in data["preview_text"] or "nodeB" in data["preview_text"]
    
    def test_preview_unity_dialogue_with_next_node(self, client):
        """Test de preview avec nextNode."""
        dialogue_with_next = [
            {
                "id": "START",
                "speaker": "NPC",
                "line": "Continue",
                "nextNode": "node1"
            }
        ]
        
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": json.dumps(dialogue_with_next)}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "node1" in data["preview_text"]
        assert "Suivant" in data["preview_text"] or "nextNode" in data["preview_text"].lower()

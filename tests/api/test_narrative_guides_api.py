"""Tests pour les endpoints API Narrative Guides."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime

from api.main import app
from api.dependencies import get_narrative_guides_service, get_notion_import_service
from services.narrative_guides_service import NarrativeGuidesService
from services.notion_import_service import NotionImportService


@pytest.fixture
def mock_guides_service():
    """Mock du NarrativeGuidesService."""
    mock_service = MagicMock(spec=NarrativeGuidesService)
    mock_service.load_guides = MagicMock(return_value={
        "dialogue_guide": "Guide des dialogues de test",
        "narrative_guide": "Guide de narration de test"
    })
    mock_service.extract_rules = MagicMock(return_value={
        "ton": ["Ton formel"],
        "structure": ["Structure narrative"],
        "interdits": ["Pas de violence"],
        "principes": ["Respect du lore"]
    })
    return mock_service


@pytest.fixture
def mock_notion_import_service():
    """Mock du NotionImportService."""
    mock_service = MagicMock(spec=NotionImportService)
    mock_service.sync_guide = AsyncMock(return_value="Contenu synchronisé")
    return mock_service


@pytest.fixture
def mock_notion_cache(tmp_path):
    """Mock du NotionCache."""
    from shared.caches import NotionCache
    cache = NotionCache(cache_dir=tmp_path / "notion_cache")
    return cache


@pytest.fixture
def client(mock_guides_service, mock_notion_import_service):
    """Fixture pour créer un client de test avec mocks."""
    app.dependency_overrides[get_narrative_guides_service] = lambda: mock_guides_service
    app.dependency_overrides[get_notion_import_service] = lambda: mock_notion_import_service
    
    yield TestClient(app)
    
    app.dependency_overrides.clear()


class TestGetNarrativeGuides:
    """Tests pour l'endpoint GET /api/narrative-guides."""
    
    @patch('api.routers.narrative_guides.get_notion_cache')
    def test_get_narrative_guides_success(self, mock_get_cache, client, mock_guides_service, mock_notion_cache):
        """Test de récupération des guides narratifs avec succès."""
        # Configurer le cache avec metadata
        mock_notion_cache.set("dialogue_guide", {"content": "Guide des dialogues"})
        metadata = mock_notion_cache.get_metadata()
        metadata["dialogue_guide"] = {"last_sync": "2024-01-01T00:00:00"}
        mock_get_cache.return_value = mock_notion_cache
        
        response = client.get("/api/narrative-guides")
        
        assert response.status_code == 200
        data = response.json()
        assert "dialogue_guide" in data
        assert "narrative_guide" in data
        assert "rules" in data
        assert "last_sync" in data
        assert data["dialogue_guide"] == "Guide des dialogues de test"
        assert data["narrative_guide"] == "Guide de narration de test"
        assert "ton" in data["rules"]
        assert "structure" in data["rules"]
    
    @patch('api.routers.narrative_guides.get_notion_cache')
    def test_get_narrative_guides_no_last_sync(self, mock_get_cache, client, mock_guides_service, mock_notion_cache):
        """Test de récupération sans last_sync."""
        mock_get_cache.return_value = mock_notion_cache
        
        response = client.get("/api/narrative-guides")
        
        assert response.status_code == 200
        data = response.json()
        assert data["last_sync"] is None
    
    @patch('api.routers.narrative_guides.get_notion_cache')
    def test_get_narrative_guides_service_error(self, mock_get_cache, client, mock_guides_service, mock_notion_cache):
        """Test avec erreur du service."""
        mock_guides_service.load_guides.side_effect = Exception("Erreur de chargement")
        mock_get_cache.return_value = mock_notion_cache
        
        response = client.get("/api/narrative-guides")
        
        assert response.status_code == 500
        data = response.json()
        # L'API retourne "error" avec code, message, details
        assert "error" in data or "detail" in data


class TestGetExtractedRules:
    """Tests pour l'endpoint GET /api/narrative-guides/rules."""
    
    @patch('api.routers.narrative_guides.get_notion_cache')
    def test_get_extracted_rules_success(self, mock_get_cache, client, mock_guides_service, mock_notion_cache):
        """Test de récupération des règles extraites."""
        mock_get_cache.return_value = mock_notion_cache
        
        response = client.get("/api/narrative-guides/rules")
        
        assert response.status_code == 200
        data = response.json()
        assert "ton" in data
        assert "structure" in data
        assert "interdits" in data
        assert "principes" in data
        assert isinstance(data["ton"], list)
        assert isinstance(data["structure"], list)
    
    @patch('api.routers.narrative_guides.get_notion_cache')
    def test_get_extracted_rules_service_error(self, mock_get_cache, client, mock_guides_service, mock_notion_cache):
        """Test avec erreur du service."""
        mock_guides_service.load_guides.side_effect = Exception("Erreur de chargement")
        mock_get_cache.return_value = mock_notion_cache
        
        response = client.get("/api/narrative-guides/rules")
        
        assert response.status_code == 500
        data = response.json()
        # L'API retourne "error" avec code, message, details
        assert "error" in data or "detail" in data


class TestSyncNarrativeGuides:
    """Tests pour l'endpoint POST /api/narrative-guides/sync."""
    
    @patch('api.routers.narrative_guides.get_notion_cache')
    @patch('api.routers.narrative_guides.NotionImportService.get_dialogue_guide_page_id')
    @patch('api.routers.narrative_guides.NotionImportService.get_narrative_guide_page_id')
    def test_sync_narrative_guides_success(
        self, 
        mock_get_narrative_id, 
        mock_get_dialogue_id,
        mock_get_cache,
        client, 
        mock_notion_import_service,
        mock_notion_cache
    ):
        """Test de synchronisation réussie."""
        mock_get_dialogue_id.return_value = "dialogue_id_123"
        mock_get_narrative_id.return_value = "narrative_id_456"
        mock_notion_import_service.sync_guide = AsyncMock(return_value="Contenu synchronisé")
        mock_get_cache.return_value = mock_notion_cache
        
        response = client.post("/api/narrative-guides/sync")
        
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert data["success"] is True
        assert "dialogue_guide_length" in data
        assert "narrative_guide_length" in data
        assert "last_sync" in data
        assert "error" in data
        assert data["error"] is None
        assert data["dialogue_guide_length"] > 0
        assert data["narrative_guide_length"] > 0
        
        # Vérifier que sync_guide a été appelé deux fois
        assert mock_notion_import_service.sync_guide.call_count == 2
    
    @patch('api.routers.narrative_guides.get_notion_cache')
    @patch('api.routers.narrative_guides.NotionImportService.get_dialogue_guide_page_id')
    @patch('api.routers.narrative_guides.NotionImportService.get_narrative_guide_page_id')
    def test_sync_narrative_guides_config_missing(
        self,
        mock_get_narrative_id,
        mock_get_dialogue_id,
        mock_get_cache,
        client,
        mock_notion_import_service,
        mock_notion_cache
    ):
        """Test avec configuration Notion manquante."""
        mock_get_dialogue_id.return_value = "dialogue_id_123"
        mock_get_narrative_id.return_value = "narrative_id_456"
        mock_notion_import_service.sync_guide = AsyncMock(side_effect=ValueError("NOTION_API_KEY manquante"))
        mock_get_cache.return_value = mock_notion_cache
        
        response = client.post("/api/narrative-guides/sync")
        
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert data["success"] is False
        assert "error" in data
        assert data["error"] is not None
        assert "NOTION_API_KEY" in data["error"] or "Configuration Notion manquante" in data["error"]
        assert data["dialogue_guide_length"] == 0
        assert data["narrative_guide_length"] == 0
        assert data["last_sync"] is None
    
    @patch('api.routers.narrative_guides.get_notion_cache')
    @patch('api.routers.narrative_guides.NotionImportService.get_dialogue_guide_page_id')
    @patch('api.routers.narrative_guides.NotionImportService.get_narrative_guide_page_id')
    def test_sync_narrative_guides_general_error(
        self,
        mock_get_narrative_id,
        mock_get_dialogue_id,
        mock_get_cache,
        client,
        mock_notion_import_service,
        mock_notion_cache
    ):
        """Test avec erreur générale."""
        mock_get_dialogue_id.return_value = "dialogue_id_123"
        mock_get_narrative_id.return_value = "narrative_id_456"
        mock_notion_import_service.sync_guide = AsyncMock(side_effect=Exception("Erreur réseau"))
        mock_get_cache.return_value = mock_notion_cache
        
        response = client.post("/api/narrative-guides/sync")
        
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert data["success"] is False
        assert "error" in data
        assert data["error"] is not None
        assert "Erreur réseau" in data["error"]
        assert data["dialogue_guide_length"] == 0
        assert data["narrative_guide_length"] == 0
        assert data["last_sync"] is None
    
    @patch('api.routers.narrative_guides.get_notion_cache')
    @patch('api.routers.narrative_guides.NotionImportService.get_dialogue_guide_page_id')
    @patch('api.routers.narrative_guides.NotionImportService.get_narrative_guide_page_id')
    def test_sync_narrative_guides_empty_content(
        self,
        mock_get_narrative_id,
        mock_get_dialogue_id,
        mock_get_cache,
        client,
        mock_notion_import_service,
        mock_notion_cache
    ):
        """Test avec contenu vide."""
        mock_get_dialogue_id.return_value = "dialogue_id_123"
        mock_get_narrative_id.return_value = "narrative_id_456"
        mock_notion_import_service.sync_guide = AsyncMock(return_value="")
        mock_get_cache.return_value = mock_notion_cache
        
        response = client.post("/api/narrative-guides/sync")
        
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert data["success"] is True
        assert data["dialogue_guide_length"] == 0
        assert data["narrative_guide_length"] == 0

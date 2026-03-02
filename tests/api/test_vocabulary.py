"""Tests pour les endpoints API du vocabulaire."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, MagicMock
from api.main import app
from shared.caches import NotionCache


@pytest.fixture
def client():
    """Client de test FastAPI."""
    return TestClient(app)


@pytest.fixture
def sample_vocabulary_data():
    """Données de vocabulaire de test."""
    return {
        "terms": [
            {
                "term": "Alteir",
                "definition": "Le monde principal",
                "popularité": "Mondialement",
                "category": "Géographie",
                "type": "Nom propre",
                "origin": "Création originale"
            },
            {
                "term": "Mana",
                "definition": "Énergie magique",
                "popularité": "Régionalement",
                "category": "Magie",
                "type": "Concept",
                "origin": "Fantasy classique"
            }
        ]
    }


@pytest.fixture
def mock_cache(tmp_path, sample_vocabulary_data):
    """Cache mock avec données de test."""
    cache = NotionCache(cache_dir=tmp_path / "notion_cache")
    cache.set("vocabulary", sample_vocabulary_data)
    return cache


class TestVocabularyEndpoints:
    """Tests pour les endpoints du vocabulaire."""
    
    @patch('services.vocabulary_service.get_notion_cache')
    def test_get_vocabulary_success(self, mock_get_cache, client, mock_cache, sample_vocabulary_data):
        """Test GET /api/vocabulary avec succès."""
        mock_get_cache.return_value = mock_cache
        
        response = client.get("/api/vocabulary")
        
        assert response.status_code == 200
        data = response.json()
        assert "terms" in data
        assert "total" in data
        assert "filtered_count" in data
        assert data["total"] == 2
    
    @patch('services.vocabulary_service.get_notion_cache')
    def test_get_vocabulary_with_min_popularite(self, mock_get_cache, client, mock_cache):
        """Test GET /api/vocabulary avec filtrage par popularité."""
        mock_get_cache.return_value = mock_cache
        
        response = client.get("/api/vocabulary?min_popularité=Régionalement")
        
        assert response.status_code == 200
        data = response.json()
        # Devrait inclure Mondialement + Régionalement = 2 termes
        assert data["filtered_count"] == 2
    
    @patch('services.vocabulary_service.get_notion_cache')
    def test_get_vocabulary_empty_cache(self, mock_get_cache, client, tmp_path):
        """Test GET /api/vocabulary avec cache vide."""
        empty_cache = NotionCache(cache_dir=tmp_path / "notion_cache")
        # S'assurer que le cache est vraiment vide
        empty_cache.invalidate("vocabulary")
        mock_get_cache.return_value = empty_cache
        
        response = client.get("/api/vocabulary")
        
        assert response.status_code == 200
        data = response.json()
        # Le cache vide devrait retourner 0 termes ou une liste vide
        assert "total" in data
        assert "terms" in data
        assert isinstance(data["terms"], list)
    
    @patch('services.vocabulary_service.get_notion_cache')
    def test_get_vocabulary_stats(self, mock_get_cache, client, mock_cache):
        """Test GET /api/vocabulary/stats."""
        mock_get_cache.return_value = mock_cache
        
        response = client.get("/api/vocabulary/stats")
        
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "by_popularité" in data
        assert "by_category" in data
        assert "by_type" in data
        assert data["total"] == 2
    
    def test_sync_vocabulary(self, client):
        """Test POST /api/vocabulary/sync."""
        response = client.post("/api/vocabulary/sync")
        
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        # La sync peut réussir si l'API Notion est disponible
        assert isinstance(data["success"], bool)
        if data["success"]:
            assert "terms_count" in data
            assert data["terms_count"] > 0
        else:
            assert "error" in data


class TestNarrativeGuidesEndpoints:
    """Tests pour les endpoints des guides narratifs."""
    
    @patch('services.narrative_guides_service.get_notion_cache')
    def test_get_narrative_guides_success(self, mock_get_cache, client, tmp_path):
        """Test GET /api/narrative-guides avec succès."""
        cache = NotionCache(cache_dir=tmp_path / "notion_cache")
        cache.set("dialogue_guide", {"content": "Guide des dialogues"})
        cache.set("narrative_guide", {"content": "Guide de narration"})
        mock_get_cache.return_value = cache
        
        response = client.get("/api/narrative-guides")
        
        assert response.status_code == 200
        data = response.json()
        assert "dialogue_guide" in data
        assert "narrative_guide" in data
        assert "rules" in data
        assert data["dialogue_guide"] == "Guide des dialogues"
        assert data["narrative_guide"] == "Guide de narration"
    
    @patch('services.narrative_guides_service.get_notion_cache')
    def test_get_extracted_rules(self, mock_get_cache, client, tmp_path):
        """Test GET /api/narrative-guides/rules."""
        cache = NotionCache(cache_dir=tmp_path / "notion_cache")
        cache.set("dialogue_guide", {"content": "<callout>Ton: Test</callout>"})
        cache.set("narrative_guide", {"content": "<callout>Interdit: Test</callout>"})
        mock_get_cache.return_value = cache
        
        response = client.get("/api/narrative-guides/rules")
        
        assert response.status_code == 200
        data = response.json()
        assert "ton" in data
        assert "structure" in data
        assert "interdits" in data
        assert "principes" in data
    
    def test_sync_narrative_guides(self, client):
        """Test POST /api/narrative-guides/sync."""
        response = client.post("/api/narrative-guides/sync")
        
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        # La sync peut réussir si l'API Notion est disponible
        assert isinstance(data["success"], bool)
        if data["success"]:
            assert "dialogue_guide_length" in data
            assert "narrative_guide_length" in data
        else:
            assert "error" in data


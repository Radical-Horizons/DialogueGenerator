"""Tests pour le service de vocabulaire Alteir."""
import pytest
from pathlib import Path
from unittest.mock import Mock, patch
from services.vocabulary_service import VocabularyService, POPULARITY_ORDER, DEFAULT_MIN_POPULARITY
from shared.caches import NotionCache


@pytest.fixture
def mock_cache(tmp_path):
    """Crée un cache Notion mock."""
    cache = NotionCache(cache_dir=tmp_path / "notion_cache")
    return cache


@pytest.fixture
def sample_vocabulary_data():
    """Données de vocabulaire de test."""
    return {
        "terms": [
            {
                "term": "Alteir",
                "definition": "Le monde principal du jeu",
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
            },
            {
                "term": "Guildes",
                "definition": "Organisations de métier",
                "popularité": "Localement",
                "category": "Société",
                "type": "Institution",
                "origin": "Médiéval"
            },
            {
                "term": "Tavernier",
                "definition": "Propriétaire de taverne",
                "popularité": "Communautaire",
                "category": "Métier",
                "type": "Profession",
                "origin": "Médiéval"
            }
        ]
    }


@pytest.fixture
def vocabulary_service(mock_cache, sample_vocabulary_data):
    """Crée un service de vocabulaire avec des données de test."""
    # Sauvegarder les données dans le cache
    mock_cache.set("vocabulary", sample_vocabulary_data)
    
    service = VocabularyService(cache=mock_cache)
    return service


class TestVocabularyService:
    """Tests pour VocabularyService."""
    
    def test_load_vocabulary_success(self, vocabulary_service, sample_vocabulary_data):
        """Test du chargement du vocabulaire depuis le cache."""
        terms = vocabulary_service.load_vocabulary()
        
        assert len(terms) == 4
        assert terms[0]["term"] == "Alteir"
        assert terms[1]["term"] == "Mana"
    
    def test_load_vocabulary_empty_cache(self, mock_cache):
        """Test du chargement avec un cache vide."""
        service = VocabularyService(cache=mock_cache)
        terms = service.load_vocabulary()
        
        assert len(terms) == 0
    
    def test_filter_by_popularity_mondialement(self, vocabulary_service):
        """Test du filtrage par niveau Mondialement."""
        all_terms = vocabulary_service.load_vocabulary()
        filtered = vocabulary_service.filter_by_popularity(all_terms, "Mondialement")
        
        assert len(filtered) == 1
        assert filtered[0]["term"] == "Alteir"
        assert filtered[0]["popularité"] == "Mondialement"
    
    def test_filter_by_popularity_regionalement(self, vocabulary_service):
        """Test du filtrage par niveau Régionalement (inclut Mondialement + Régionalement)."""
        all_terms = vocabulary_service.load_vocabulary()
        filtered = vocabulary_service.filter_by_popularity(all_terms, "Régionalement")
        
        assert len(filtered) == 2
        assert all(t["popularité"] in ["Mondialement", "Régionalement"] for t in filtered)
        # Vérifier le tri par popularité puis alphabétique
        assert filtered[0]["popularité"] == "Mondialement"
        assert filtered[1]["popularité"] == "Régionalement"
    
    def test_filter_by_popularity_localement(self, vocabulary_service):
        """Test du filtrage par niveau Localement (inclut Mondialement + Régionalement + Localement)."""
        all_terms = vocabulary_service.load_vocabulary()
        filtered = vocabulary_service.filter_by_popularity(all_terms, "Localement")
        
        assert len(filtered) == 3
        assert all(t["popularité"] in ["Mondialement", "Régionalement", "Localement"] for t in filtered)
    
    def test_filter_by_popularity_invalid_level(self, vocabulary_service):
        """Test du filtrage avec un niveau invalide (utilise le défaut)."""
        all_terms = vocabulary_service.load_vocabulary()
        filtered = vocabulary_service.filter_by_popularity(all_terms, "InvalidLevel")
        
        # Devrait utiliser le défaut (Régionalement)
        assert len(filtered) == 2
    
    def test_format_for_prompt(self, vocabulary_service):
        """Test du formatage pour injection dans le prompt."""
        all_terms = vocabulary_service.load_vocabulary()
        filtered = vocabulary_service.filter_by_popularity(all_terms, "Régionalement")
        formatted = vocabulary_service.format_for_prompt(filtered)
        
        assert "[VOCABULAIRE ALTEIR]" in formatted
        assert "Alteir: Le monde principal du jeu" in formatted
        assert "Mana: Énergie magique" in formatted
    
    def test_format_for_prompt_max_terms(self, vocabulary_service):
        """Test du formatage avec limitation du nombre de termes."""
        all_terms = vocabulary_service.load_vocabulary()
        formatted = vocabulary_service.format_for_prompt(all_terms, max_terms=2)
        
        assert "[VOCABULAIRE ALTEIR]" in formatted
        # Vérifier qu'il y a une note sur les termes non affichés
        assert "autres termes non affichés" in formatted
    
    def test_get_terms_by_category(self, vocabulary_service):
        """Test du filtrage par catégorie."""
        all_terms = vocabulary_service.load_vocabulary()
        magic_terms = vocabulary_service.get_terms_by_category(all_terms, "Magie")
        
        assert len(magic_terms) == 1
        assert magic_terms[0]["term"] == "Mana"
        assert magic_terms[0]["category"] == "Magie"
    
    def test_get_statistics(self, vocabulary_service):
        """Test du calcul des statistiques."""
        all_terms = vocabulary_service.load_vocabulary()
        stats = vocabulary_service.get_statistics(all_terms)
        
        assert stats["total"] == 4
        assert stats["by_popularité"]["Mondialement"] == 1
        assert stats["by_popularité"]["Régionalement"] == 1
        assert stats["by_popularité"]["Localement"] == 1
        assert stats["by_popularité"]["Communautaire"] == 1
        assert stats["by_category"]["Magie"] == 1
        assert stats["by_category"]["Géographie"] == 1
    
    def test_count_terms_by_popularity(self, vocabulary_service):
        """Test du comptage des termes par niveau de popularité."""
        all_terms = vocabulary_service.load_vocabulary()
        filtered = vocabulary_service.filter_by_popularity(all_terms, "Régionalement")
        
        assert len(filtered) == 2  # Mondialement + Régionalement


"""Tests pour le service des guides narratifs."""
import pytest
from pathlib import Path
from unittest.mock import Mock, patch
from services.narrative_guides_service import NarrativeGuidesService
from shared.caches import NotionCache


@pytest.fixture
def mock_cache(tmp_path):
    """Crée un cache Notion mock."""
    cache = NotionCache(cache_dir=tmp_path / "notion_cache")
    return cache


@pytest.fixture
def sample_guides_data():
    """Données de guides de test."""
    return {
        "dialogue_guide": {
            "content": """# Guide des dialogues

## Habillage
Les dialogues doivent être naturels et immersifs.

<callout>Ton: Utiliser un registre adapté au personnage</callout>

## Technique des dialogues
- Varier la longueur des répliques
- Éviter les monologues trop longs
"""
        },
        "narrative_guide": {
            "content": """# Guide de narration

## Narration linéaire
La narration doit faire avancer l'histoire.

<callout>Interdit: Éviter les dialogues filler</callout>

## Structure
Organiser les dialogues par scènes.
"""
        }
    }


@pytest.fixture
def guides_service(mock_cache, sample_guides_data):
    """Crée un service de guides avec des données de test."""
    # Sauvegarder les données dans le cache
    mock_cache.set("dialogue_guide", sample_guides_data["dialogue_guide"])
    mock_cache.set("narrative_guide", sample_guides_data["narrative_guide"])
    
    service = NarrativeGuidesService(cache=mock_cache)
    return service


class TestNarrativeGuidesService:
    """Tests pour NarrativeGuidesService."""
    
    def test_load_guides_success(self, guides_service):
        """Test du chargement des guides depuis le cache."""
        guides = guides_service.load_guides()
        
        assert "dialogue_guide" in guides
        assert "narrative_guide" in guides
        assert len(guides["dialogue_guide"]) > 0
        assert len(guides["narrative_guide"]) > 0
    
    def test_load_guides_empty_cache(self, mock_cache):
        """Test du chargement avec un cache vide."""
        service = NarrativeGuidesService(cache=mock_cache)
        guides = service.load_guides()
        
        assert guides["dialogue_guide"] == ""
        assert guides["narrative_guide"] == ""
    
    def test_extract_rules(self, guides_service):
        """Test de l'extraction des règles."""
        guides = guides_service.load_guides()
        rules = guides_service.extract_rules(guides)
        
        assert "ton" in rules
        assert "structure" in rules
        assert "interdits" in rules
        assert "principes" in rules
        # Vérifier qu'il y a des règles extraites
        assert len(rules["ton"]) > 0 or len(rules["structure"]) > 0
    
    def test_format_for_prompt(self, guides_service):
        """Test du formatage pour injection dans le prompt."""
        guides = guides_service.load_guides()
        formatted = guides_service.format_for_prompt(guides, include_rules=True)
        
        assert "[GUIDES NARRATIFS]" in formatted
        assert "GUIDE DES DIALOGUES" in formatted
        assert "GUIDE DE NARRATION" in formatted
    
    def test_format_for_prompt_without_rules(self, guides_service):
        """Test du formatage sans les règles extraites."""
        guides = guides_service.load_guides()
        formatted = guides_service.format_for_prompt(guides, include_rules=False)
        
        assert "[GUIDES NARRATIFS]" in formatted
        # Les règles ne devraient pas être présentes
        assert "RÈGLES CLÉS EXTRAITES" not in formatted
    
    def test_simplify_markdown(self, guides_service):
        """Test de la simplification du markdown."""
        content = """<callout>Test</callout>
<mention-page>Page</mention-page>
Normal text"""
        
        simplified = guides_service._simplify_markdown(content)
        
        assert "<callout>" not in simplified
        assert "<mention-page>" not in simplified
        assert "Normal text" in simplified


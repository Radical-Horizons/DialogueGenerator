"""Tests pour le cache des champs de contexte."""
import pytest
from datetime import datetime, timedelta
from api.utils import context_field_cache as cfc_mod
from api.utils.context_field_cache import ContextFieldCache, get_context_field_cache


class TestContextFieldCache:
    """Tests pour ContextFieldCache."""
    
    def test_init(self):
        """Test d'initialisation du cache."""
        cache = ContextFieldCache(cache_ttl_hours=12)
        
        assert cache.cache == {}
        assert cache.cache_ttl == timedelta(hours=12)
    
    def test_set_and_get(self):
        """Test de mise en cache et récupération."""
        cache = ContextFieldCache()
        fields = {"Nom": "test", "Description": "test desc"}
        
        cache.set("character", fields)
        result = cache.get("character")
        
        assert result == fields
    
    def test_get_not_found(self):
        """Test de récupération d'un élément non en cache."""
        cache = ContextFieldCache()
        
        result = cache.get("character")
        
        assert result is None
    
    def test_get_expired(self):
        """Test de récupération d'un élément expiré."""
        cache = ContextFieldCache(cache_ttl_hours=1)
        fields = {"Nom": "test"}
        
        # Mettre en cache avec une date passée
        cache.cache["character"] = {
            "fields": fields,
            "last_scan": (datetime.now() - timedelta(hours=2)).isoformat(),
            "gdd_hash": None,
            "schema_version": cfc_mod._CACHE_SCHEMA_VERSION,
        }
        
        result = cache.get("character")
        
        assert result is None
        assert "character" not in cache.cache
    
    def test_get_with_hash_match(self):
        """Test de récupération avec hash GDD correspondant."""
        cache = ContextFieldCache()
        fields = {"Nom": "test"}
        gdd_hash = "abc123"
        
        cache.set("character", fields, gdd_data_hash=gdd_hash)
        result = cache.get("character", gdd_data_hash=gdd_hash)
        
        assert result == fields
    
    def test_get_with_hash_mismatch(self):
        """Test de récupération avec hash GDD différent."""
        cache = ContextFieldCache()
        fields = {"Nom": "test"}
        
        cache.set("character", fields, gdd_data_hash="abc123")
        result = cache.get("character", gdd_data_hash="different_hash")
        
        assert result is None
        assert "character" not in cache.cache
    
    def test_invalidate_specific(self):
        """Test d'invalidation pour un type spécifique."""
        cache = ContextFieldCache()
        cache.set("character", {"Nom": "test"})
        cache.set("location", {"Nom": "test"})
        
        cache.invalidate("character")
        
        assert cache.get("character") is None
        assert cache.get("location") is not None
    
    def test_invalidate_all(self):
        """Test d'invalidation complète."""
        cache = ContextFieldCache()
        cache.set("character", {"Nom": "test"})
        cache.set("location", {"Nom": "test"})
        
        cache.invalidate()
        
        assert cache.get("character") is None
        assert cache.get("location") is None
    
    def test_clear(self):
        """Test de vidage du cache."""
        cache = ContextFieldCache()
        cache.set("character", {"Nom": "test"})
        
        cache.clear()
        
        assert len(cache.cache) == 0
    
    def test_get_context_field_cache_singleton(self):
        """Test que get_context_field_cache retourne un singleton."""
        cache1 = get_context_field_cache()
        cache2 = get_context_field_cache()
        
        assert cache1 is cache2

    def test_get_rejects_stale_schema_version(self):
        """Entrées sans version ou version obsolète sont ignorées."""
        cache = ContextFieldCache()
        cache.cache["character"] = {
            "fields": {"Nom": "x"},
            "last_scan": datetime.now().isoformat(),
            "gdd_hash": None,
            "schema_version": 1,
        }
        assert cache.get("character") is None
        assert "character" not in cache.cache

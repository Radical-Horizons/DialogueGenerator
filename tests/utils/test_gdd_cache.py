"""Tests pour le cache GDD avec invalidation basée sur mtime."""
import os
import time
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from shared.caches import GDDCache, GDDCacheEntry, get_gdd_cache


class TestGDDCacheEntry:
    """Tests pour GDDCacheEntry."""
    
    def test_is_stale_file_modified(self, tmp_path):
        """Test que is_stale retourne True si le fichier a été modifié."""
        file_path = tmp_path / "test.json"
        file_path.write_text('{"data": "original"}')
        
        # Créer une entrée avec mtime actuel
        original_mtime = file_path.stat().st_mtime
        entry = GDDCacheEntry(data={"data": "original"}, file_path=file_path, mtime=original_mtime)
        
        # Modifier le fichier
        time.sleep(0.1)  # S'assurer que mtime change
        file_path.write_text('{"data": "modified"}')
        
        # Vérifier que l'entrée est obsolète
        assert entry.is_stale(check_interval=0.0) is True
    
    def test_is_stale_file_not_modified(self, tmp_path):
        """Test que is_stale retourne False si le fichier n'a pas été modifié."""
        file_path = tmp_path / "test.json"
        file_path.write_text('{"data": "original"}')
        
        original_mtime = file_path.stat().st_mtime
        entry = GDDCacheEntry(data={"data": "original"}, file_path=file_path, mtime=original_mtime)
        
        # Vérifier que l'entrée n'est pas obsolète
        assert entry.is_stale(check_interval=0.0) is False
    
    def test_is_stale_check_interval_throttle(self, tmp_path):
        """Test que le throttle sur check_interval fonctionne."""
        file_path = tmp_path / "test.json"
        file_path.write_text('{"data": "original"}')
        
        original_mtime = file_path.stat().st_mtime
        entry = GDDCacheEntry(data={"data": "original"}, file_path=file_path, mtime=original_mtime)
        
        # Avec un check_interval élevé, ne devrait pas vérifier immédiatement
        assert entry.is_stale(check_interval=10.0) is False
    
    def test_is_stale_file_deleted(self, tmp_path):
        """Test que is_stale retourne True si le fichier a été supprimé."""
        file_path = tmp_path / "test.json"
        file_path.write_text('{"data": "original"}')
        
        original_mtime = file_path.stat().st_mtime
        entry = GDDCacheEntry(data={"data": "original"}, file_path=file_path, mtime=original_mtime)
        
        # Supprimer le fichier
        file_path.unlink()
        
        # Vérifier que l'entrée est obsolète
        assert entry.is_stale(check_interval=0.0) is True


class TestGDDCache:
    """Tests pour GDDCache."""
    
    def test_get_set_cache(self, tmp_path):
        """Test get/set du cache."""
        cache = GDDCache(check_interval=0.0)
        file_path = tmp_path / "test.json"
        file_path.write_text('{"data": "test"}')
        
        # Mettre en cache
        cache.set("test_key", {"data": "test"}, file_path)
        
        # Récupérer depuis le cache
        cached_data = cache.get("test_key", file_path)
        assert cached_data == {"data": "test"}
    
    def test_get_cache_miss(self, tmp_path):
        """Test que get retourne None si la clé n'existe pas."""
        cache = GDDCache(check_interval=0.0)
        file_path = tmp_path / "test.json"
        
        cached_data = cache.get("nonexistent", file_path)
        assert cached_data is None
    
    def test_get_cache_stale(self, tmp_path):
        """Test que get retourne None si l'entrée est obsolète."""
        cache = GDDCache(check_interval=0.0)
        file_path = tmp_path / "test.json"
        file_path.write_text('{"data": "original"}')
        
        # Mettre en cache
        cache.set("test_key", {"data": "original"}, file_path)
        
        # Modifier le fichier
        time.sleep(0.1)
        file_path.write_text('{"data": "modified"}')
        
        # Récupérer devrait retourner None car obsolète
        cached_data = cache.get("test_key", file_path)
        assert cached_data is None
    
    def test_invalidate_key(self, tmp_path):
        """Test l'invalidation d'une clé spécifique."""
        cache = GDDCache(check_interval=0.0)
        file_path = tmp_path / "test.json"
        file_path.write_text('{"data": "test"}')
        
        cache.set("key1", {"data": "test1"}, file_path)
        cache.set("key2", {"data": "test2"}, file_path)
        
        # Invalider key1
        cache.invalidate("key1")
        
        assert cache.get("key1", file_path) is None
        assert cache.get("key2", file_path) is not None
    
    def test_invalidate_all(self, tmp_path):
        """Test l'invalidation de tout le cache."""
        cache = GDDCache(check_interval=0.0)
        file_path = tmp_path / "test.json"
        file_path.write_text('{"data": "test"}')
        
        cache.set("key1", {"data": "test1"}, file_path)
        cache.set("key2", {"data": "test2"}, file_path)
        
        # Invalider tout
        cache.invalidate()
        
        assert cache.get("key1", file_path) is None
        assert cache.get("key2", file_path) is None
    
    def test_cache_disabled(self, tmp_path):
        """Test que le cache ne fonctionne pas si désactivé."""
        with patch.dict(os.environ, {"GDD_CACHE_ENABLED": "false"}):
            cache = GDDCache(check_interval=0.0)
            cache.enabled = False
            file_path = tmp_path / "test.json"
            file_path.write_text('{"data": "test"}')
            
            # Mettre en cache ne devrait rien faire
            cache.set("test_key", {"data": "test"}, file_path)
            
            # Get devrait retourner None
            cached_data = cache.get("test_key", file_path)
            assert cached_data is None
    
    def test_get_stats(self, tmp_path):
        """Test get_stats."""
        cache = GDDCache(check_interval=5.0)
        file_path = tmp_path / "test.json"
        file_path.write_text('{"data": "test"}')
        
        cache.set("key1", {"data": "test1"}, file_path)
        cache.set("key2", {"data": "test2"}, file_path)
        
        stats = cache.get_stats()
        assert stats["enabled"] is True
        assert stats["entries_count"] == 2
        assert stats["check_interval"] == 5.0
        assert "key1" in stats["keys"]
        assert "key2" in stats["keys"]


class TestGetGDDCache:
    """Tests pour get_gdd_cache (singleton)."""
    
    def test_singleton(self):
        """Test que get_gdd_cache retourne toujours la même instance."""
        cache1 = get_gdd_cache()
        cache2 = get_gdd_cache()
        
        assert cache1 is cache2
    
    def test_check_interval_from_env(self):
        """Test que check_interval est chargé depuis l'environnement."""
        with patch.dict(os.environ, {"GDD_CACHE_CHECK_INTERVAL": "10"}):
            # Réinitialiser le cache global (dans le module source shared.caches.gdd_cache)
            import shared.caches.gdd_cache
            shared.caches.gdd_cache._gdd_cache = None
            
            cache = get_gdd_cache()
            assert cache.check_interval == 10.0







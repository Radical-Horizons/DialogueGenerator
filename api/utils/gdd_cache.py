"""Cache intelligent pour les données GDD avec invalidation basée sur mtime."""
import os
import logging
import time
from typing import Dict, Optional, Any, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)


class GDDCacheEntry:
    """Entrée de cache pour un fichier GDD avec métadonnées."""
    
    def __init__(self, data: Any, file_path: Path, mtime: float):
        """Initialise une entrée de cache.
        
        Args:
            data: Les données chargées depuis le fichier.
            file_path: Chemin vers le fichier source.
            mtime: Timestamp de modification du fichier lors du chargement.
        """
        self.data = data
        self.file_path = file_path
        self.mtime = mtime
        self.cached_at = time.time()
    
    def is_stale(self, check_interval: float = 5.0) -> bool:
        """Vérifie si l'entrée de cache est obsolète.
        
        Args:
            check_interval: Intervalle minimum entre vérifications mtime (en secondes).
            
        Returns:
            True si le fichier a été modifié depuis le chargement.
        """
        # Throttle : ne pas vérifier trop souvent
        if time.time() - self.cached_at < check_interval:
            return False
        
        # Vérifier si le fichier existe toujours
        if not self.file_path.exists():
            logger.warning(f"Fichier GDD supprimé: {self.file_path}")
            return True
        
        # Vérifier mtime
        try:
            current_mtime = self.file_path.stat().st_mtime
            if current_mtime != self.mtime:
                logger.info(
                    f"Fichier GDD modifié détecté: {self.file_path} "
                    f"(ancien mtime: {self.mtime}, nouveau: {current_mtime})"
                )
                return True
        except OSError as e:
            logger.warning(f"Erreur lors de la vérification mtime de {self.file_path}: {e}")
            # En cas d'erreur, considérer comme obsolète pour sécurité
            return True
        
        return False


class GDDCache:
    """Cache pour les données GDD avec invalidation automatique basée sur mtime."""
    
    def __init__(self, check_interval: float = 5.0):
        """Initialise le cache GDD.
        
        Args:
            check_interval: Intervalle minimum entre vérifications mtime (en secondes).
        """
        self._cache: Dict[str, GDDCacheEntry] = {}
        self.check_interval = check_interval
        self.enabled = os.getenv("GDD_CACHE_ENABLED", "true").lower() in ("true", "1", "yes")
        
        if not self.enabled:
            logger.info("Cache GDD désactivé")
    
    def get(self, key: str, file_path: Path) -> Optional[Any]:
        """Récupère des données depuis le cache si valides.
        
        Args:
            key: Clé de cache (ex: "personnages", "lieux").
            file_path: Chemin vers le fichier source.
            
        Returns:
            Les données en cache si valides, None sinon.
        """
        if not self.enabled:
            return None
        
        if key not in self._cache:
            return None
        
        entry = self._cache[key]
        
        # Vérifier si l'entrée est obsolète
        if entry.is_stale(self.check_interval):
            logger.info(f"Invalidation du cache pour '{key}' (fichier modifié)")
            del self._cache[key]
            return None
        
        return entry.data
    
    def set(self, key: str, data: Any, file_path: Path) -> None:
        """Stocke des données dans le cache.
        
        Args:
            key: Clé de cache.
            data: Les données à mettre en cache.
            file_path: Chemin vers le fichier source.
        """
        if not self.enabled:
            return
        
        try:
            mtime = file_path.stat().st_mtime if file_path.exists() else 0.0
            self._cache[key] = GDDCacheEntry(data, file_path, mtime)
            # Log silencieux : les mises en cache sont normales et ne nécessitent pas de log
            # logger.debug(f"Données mises en cache pour '{key}' (mtime: {mtime})")
        except OSError as e:
            logger.warning(f"Impossible de mettre en cache '{key}': {e}")
    
    def invalidate(self, key: Optional[str] = None) -> None:
        """Invalide une entrée de cache ou tout le cache.
        
        Args:
            key: Clé à invalider. Si None, invalide tout le cache.
        """
        if key is None:
            logger.info("Invalidation complète du cache GDD")
            self._cache.clear()
        elif key in self._cache:
            logger.info(f"Invalidation du cache pour '{key}'")
            del self._cache[key]
    
    def clear(self) -> None:
        """Vide complètement le cache."""
        self._cache.clear()
        logger.debug("Cache GDD vidé")
    
    def get_stats(self) -> Dict[str, Any]:
        """Retourne des statistiques sur le cache.
        
        Returns:
            Dictionnaire avec statistiques (nombre d'entrées, etc.).
        """
        return {
            "enabled": self.enabled,
            "entries_count": len(self._cache),
            "check_interval": self.check_interval,
            "keys": list(self._cache.keys())
        }


# Instance globale du cache GDD
_gdd_cache: Optional[GDDCache] = None


def get_gdd_cache() -> GDDCache:
    """Retourne l'instance globale du cache GDD (singleton).
    
    Returns:
        Instance de GDDCache.
    """
    global _gdd_cache
    
    if _gdd_cache is None:
        check_interval = float(os.getenv("GDD_CACHE_CHECK_INTERVAL", "5.0"))
        _gdd_cache = GDDCache(check_interval=check_interval)
        logger.info(f"Cache GDD initialisé (check_interval: {check_interval}s)")
    
    return _gdd_cache




"""Cache pour les résultats de détection de champs de contexte."""
import logging
from typing import Dict, Optional, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Incrémenter lors d’un changement de sémantique de détection (ex. découpage ``sections._general``).
_CACHE_SCHEMA_VERSION = 4


class ContextFieldCache:
    """Cache pour les résultats de détection de champs."""
    
    def __init__(self, cache_ttl_hours: int = 24):
        """Initialise le cache.
        
        Args:
            cache_ttl_hours: Durée de vie du cache en heures (défaut: 24h).
        """
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.cache_ttl = timedelta(hours=cache_ttl_hours)
    
    def get(self, element_type: str, gdd_data_hash: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Récupère les champs détectés depuis le cache.
        
        Args:
            element_type: Type d'élément ("character", "location", etc.)
            gdd_data_hash: Hash des données GDD pour vérifier la validité (optionnel)
            
        Returns:
            Dictionnaire avec les champs détectés ou None si non trouvé/expiré.
        """
        cache_key = element_type.lower()
        
        if cache_key not in self.cache:
            return None
        
        cached_data = self.cache[cache_key]
        
        if cached_data.get("schema_version") != _CACHE_SCHEMA_VERSION:
            logger.debug(
                "Cache champs contexte obsolète (schema %s → %s) pour '%s'",
                cached_data.get("schema_version"),
                _CACHE_SCHEMA_VERSION,
                element_type,
            )
            del self.cache[cache_key]
            return None
        
        # Vérifier l'expiration
        last_scan = cached_data.get("last_scan")
        if last_scan:
            try:
                last_scan_dt = datetime.fromisoformat(last_scan)
                if datetime.now() - last_scan_dt > self.cache_ttl:
                    logger.debug(f"Cache expiré pour '{element_type}'")
                    del self.cache[cache_key]
                    return None
            except (ValueError, TypeError):
                logger.warning(f"Format de date invalide dans le cache pour '{element_type}'")
                del self.cache[cache_key]
                return None
        
        # Vérifier le hash des données si fourni
        if gdd_data_hash and cached_data.get("gdd_hash") != gdd_data_hash:
            logger.debug(f"Hash GDD différent pour '{element_type}', cache invalidé")
            del self.cache[cache_key]
            return None
        
        logger.debug(f"Cache hit pour '{element_type}'")
        return cached_data.get("fields")
    
    def set(self, element_type: str, fields: Dict[str, Any], gdd_data_hash: Optional[str] = None) -> None:
        """Met en cache les champs détectés.
        
        Args:
            element_type: Type d'élément
            fields: Dictionnaire des champs détectés
            gdd_data_hash: Hash des données GDD pour validation (optionnel)
        """
        cache_key = element_type.lower()
        
        self.cache[cache_key] = {
            "fields": fields,
            "last_scan": datetime.now().isoformat(),
            "gdd_hash": gdd_data_hash,
            "schema_version": _CACHE_SCHEMA_VERSION,
        }
        
        logger.debug(f"Cache mis à jour pour '{element_type}' ({len(fields)} champs)")
    
    def invalidate(self, element_type: Optional[str] = None) -> None:
        """Invalide le cache pour un type d'élément ou tous.
        
        Args:
            element_type: Type d'élément spécifique, ou None pour tout invalider.
        """
        if element_type:
            cache_key = element_type.lower()
            if cache_key in self.cache:
                del self.cache[cache_key]
                logger.debug(f"Cache invalidé pour '{element_type}'")
        else:
            self.cache.clear()
            logger.debug("Cache complètement invalidé")
    
    def clear(self) -> None:
        """Vide complètement le cache."""
        self.cache.clear()
        logger.debug("Cache vidé")


# Instance globale du cache
_global_cache: Optional[ContextFieldCache] = None


def get_context_field_cache() -> ContextFieldCache:
    """Récupère l'instance globale du cache."""
    global _global_cache
    if _global_cache is None:
        _global_cache = ContextFieldCache()
    return _global_cache


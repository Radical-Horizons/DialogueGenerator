"""Cache pour les données Notion avec stockage fichier JSON local.

Ce module peut être utilisé par n'importe quelle couche (core, services, API).
"""
import os
import json
import logging
import time
from typing import Dict, Optional, Any
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)

# Chemin par défaut pour le cache Notion (relatif au projet)
def _get_default_cache_dir() -> Path:
    """Retourne le chemin par défaut du cache Notion."""
    return Path(__file__).resolve().parent.parent.parent / "data" / "notion_cache"


class NotionCache:
    """Cache pour les données Notion avec stockage fichier JSON local.
    
    Structure du cache :
    - data/notion_cache/vocabulary.json : Liste des termes avec métadonnées
    - data/notion_cache/dialogue_guide.json : Contenu markdown du guide des dialogues
    - data/notion_cache/narrative_guide.json : Contenu markdown du guide de narration
    - data/notion_cache/metadata.json : Timestamps de dernière sync, versions
    """
    
    def __init__(self, cache_dir: Optional[Path] = None):
        """Initialise le cache Notion.
        
        Args:
            cache_dir: Répertoire de cache. Si None, utilise le répertoire par défaut.
        """
        self.cache_dir = cache_dir or _get_default_cache_dir()
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_file = self.cache_dir / "metadata.json"
        self._metadata: Dict[str, Any] = self._load_metadata()
        logger.info(f"Cache Notion initialisé dans {self.cache_dir}")
    
    def _load_metadata(self) -> Dict[str, Any]:
        """Charge les métadonnées du cache.
        
        Returns:
            Dictionnaire avec les métadonnées (timestamps, versions).
        """
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Erreur lors du chargement des métadonnées: {e}")
        return {
            "vocabulary": {"last_sync": None, "version": None},
            "dialogue_guide": {"last_sync": None, "version": None},
            "narrative_guide": {"last_sync": None, "version": None}
        }
    
    def _save_metadata(self) -> None:
        """Sauvegarde les métadonnées du cache."""
        try:
            with open(self.metadata_file, 'w', encoding='utf-8') as f:
                json.dump(self._metadata, f, indent=2, ensure_ascii=False)
        except IOError as e:
            logger.error(f"Erreur lors de la sauvegarde des métadonnées: {e}")
    
    def get(self, key: str) -> Optional[Any]:
        """Récupère des données depuis le cache.
        
        Args:
            key: Clé de cache ("vocabulary", "dialogue_guide", "narrative_guide").
            
        Returns:
            Les données en cache si disponibles, None sinon.
        """
        cache_file = self.cache_dir / f"{key}.json"
        
        if not cache_file.exists():
            logger.debug(f"Cache {key} non trouvé: {cache_file}")
            return None
        
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logger.debug(f"Cache {key} chargé depuis {cache_file}")
            return data
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Erreur lors du chargement du cache {key}: {e}")
            return None
    
    def set(self, key: str, data: Any, version: Optional[str] = None) -> None:
        """Stocke des données dans le cache.
        
        Args:
            key: Clé de cache ("vocabulary", "dialogue_guide", "narrative_guide").
            data: Les données à mettre en cache.
            version: Version optionnelle des données (ex: hash, timestamp).
        """
        cache_file = self.cache_dir / f"{key}.json"
        
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            if key not in self._metadata:
                self._metadata[key] = {}
            self._metadata[key]["last_sync"] = datetime.now().isoformat()
            if version:
                self._metadata[key]["version"] = version
            self._save_metadata()
            
            logger.info(f"Cache {key} sauvegardé dans {cache_file}")
        except IOError as e:
            logger.error(f"Erreur lors de la sauvegarde du cache {key}: {e}")
    
    def invalidate(self, key: Optional[str] = None) -> None:
        """Invalide une entrée de cache ou tout le cache.
        
        Args:
            key: Clé à invalider. Si None, invalide tout le cache.
        """
        if key is None:
            for cache_file in self.cache_dir.glob("*.json"):
                if cache_file.name != "metadata.json":
                    try:
                        cache_file.unlink()
                        logger.info(f"Cache {cache_file.name} supprimé")
                    except OSError as e:
                        logger.warning(f"Erreur lors de la suppression de {cache_file.name}: {e}")
            self._metadata = {
                "vocabulary": {"last_sync": None, "version": None},
                "dialogue_guide": {"last_sync": None, "version": None},
                "narrative_guide": {"last_sync": None, "version": None}
            }
            self._save_metadata()
            logger.info("Cache Notion complètement invalidé")
        else:
            cache_file = self.cache_dir / f"{key}.json"
            if cache_file.exists():
                try:
                    cache_file.unlink()
                    logger.info(f"Cache {key} invalidé (fichier supprimé)")
                except OSError as e:
                    logger.warning(f"Erreur lors de la suppression du cache {key}: {e}")
            
            if key in self._metadata:
                self._metadata[key] = {"last_sync": None, "version": None}
                self._save_metadata()
    
    def is_stale(self, key: str, ttl_hours: int = 24) -> bool:
        """Vérifie si une entrée de cache est obsolète.
        
        Args:
            key: Clé de cache.
            ttl_hours: Durée de vie du cache en heures (défaut: 24h).
            
        Returns:
            True si le cache est obsolète ou absent, False sinon.
        """
        if key not in self._metadata:
            return True
        
        last_sync_str = self._metadata[key].get("last_sync")
        if not last_sync_str:
            return True
        
        try:
            last_sync = datetime.fromisoformat(last_sync_str)
            age_hours = (datetime.now() - last_sync).total_seconds() / 3600
            return age_hours > ttl_hours
        except (ValueError, TypeError) as e:
            logger.warning(f"Erreur lors de la vérification de l'âge du cache {key}: {e}")
            return True
    
    def get_metadata(self, key: Optional[str] = None) -> Dict[str, Any]:
        """Récupère les métadonnées du cache.
        
        Args:
            key: Clé de cache. Si None, retourne toutes les métadonnées.
            
        Returns:
            Dictionnaire avec les métadonnées.
        """
        if key:
            return self._metadata.get(key, {})
        return self._metadata.copy()
    
    def get_stats(self) -> Dict[str, Any]:
        """Retourne des statistiques sur le cache.
        
        Returns:
            Dictionnaire avec statistiques (nombre d'entrées, tailles, etc.).
        """
        stats = {
            "cache_dir": str(self.cache_dir),
            "entries": {},
            "total_size_bytes": 0
        }
        
        for key in ["vocabulary", "dialogue_guide", "narrative_guide"]:
            cache_file = self.cache_dir / f"{key}.json"
            entry_stats = {
                "exists": cache_file.exists(),
                "size_bytes": cache_file.stat().st_size if cache_file.exists() else 0,
                "last_sync": self._metadata.get(key, {}).get("last_sync"),
                "version": self._metadata.get(key, {}).get("version")
            }
            stats["entries"][key] = entry_stats
            stats["total_size_bytes"] += entry_stats["size_bytes"]
        
        return stats


_notion_cache: Optional[NotionCache] = None


def get_notion_cache() -> NotionCache:
    """Retourne l'instance globale du cache Notion (singleton).
    
    Returns:
        Instance de NotionCache.
    """
    global _notion_cache
    
    if _notion_cache is None:
        cache_dir = os.getenv("NOTION_CACHE_DIR")
        if cache_dir:
            _notion_cache = NotionCache(cache_dir=Path(cache_dir))
        else:
            _notion_cache = NotionCache()
        logger.info("Cache Notion initialisé (singleton)")
    
    return _notion_cache

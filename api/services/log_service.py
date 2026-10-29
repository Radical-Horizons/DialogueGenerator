"""Service de gestion et consultation des logs."""
import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from constants import resolve_logs_dir


logger = logging.getLogger(__name__)


class LogService:
    """Service pour la recherche, la consultation et la gestion des logs."""
    
    def __init__(self, log_dir: Optional[str] = None):
        """Initialise le service.
        
        Args:
            log_dir: Dossier contenant les fichiers de logs. Par défaut: ``resolve_logs_dir()``.
        """
        self.log_dir = Path(log_dir) if log_dir else resolve_logs_dir()
        if not self.log_dir.exists():
            self.log_dir.mkdir(parents=True, exist_ok=True)
    
    def search_logs(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        level: Optional[str] = None,
        logger_name: Optional[str] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Recherche des logs selon des critères.
        
        Args:
            start_date: Date de début (incluse). Par défaut: 30 jours avant aujourd'hui.
            end_date: Date de fin (incluse). Par défaut: aujourd'hui.
            level: Niveau de log (DEBUG, INFO, WARNING, ERROR, CRITICAL).
            logger_name: Nom du logger (ex: "api.middleware").
            request_id: ID de requête pour filtrer.
            endpoint: Endpoint API pour filtrer.
            limit: Nombre maximum de résultats à retourner.
            offset: Nombre de résultats à ignorer (pagination).
            
        Returns:
            Tuple (liste de logs, nombre total de résultats).
        """
        # Dates par défaut
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=30)
        
        all_logs: List[Dict[str, Any]] = []
        
        # Parcourir les fichiers de logs dans la plage de dates
        current_date = start_date
        while current_date <= end_date:
            file_path = self._get_file_path(current_date)
            if file_path.exists():
                logs = self._load_logs_from_file(file_path)
                all_logs.extend(logs)
            current_date += timedelta(days=1)
        
        # Filtrer selon les critères
        filtered_logs = self._filter_logs(
            all_logs,
            level=level,
            logger_name=logger_name,
            request_id=request_id,
            endpoint=endpoint
        )
        
        # Trier par timestamp décroissant (plus récents en premier)
        filtered_logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        
        # Pagination
        total_count = len(filtered_logs)
        paginated_logs = filtered_logs[offset:offset + limit]
        
        return paginated_logs, total_count
    
    def get_statistics(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """Calcule des statistiques sur les logs.
        
        Args:
            start_date: Date de début (incluse). Par défaut: 30 jours avant aujourd'hui.
            end_date: Date de fin (incluse). Par défaut: aujourd'hui.
            
        Returns:
            Dictionnaire avec statistiques (comptage par niveau, par jour, etc.).
        """
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=30)
        
        all_logs: List[Dict[str, Any]] = []
        
        # Charger tous les logs dans la plage
        current_date = start_date
        while current_date <= end_date:
            file_path = self._get_file_path(current_date)
            if file_path.exists():
                logs = self._load_logs_from_file(file_path)
                all_logs.extend(logs)
            current_date += timedelta(days=1)
        
        # Statistiques par niveau
        level_counts: Dict[str, int] = {}
        for log in all_logs:
            level = log.get("level", "UNKNOWN")
            level_counts[level] = level_counts.get(level, 0) + 1
        
        # Statistiques par jour
        daily_counts: Dict[str, int] = {}
        for log in all_logs:
            timestamp_str = log.get("timestamp", "")
            if timestamp_str:
                try:
                    # Extraire la date du timestamp ISO
                    log_date = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00")).date()
                    date_str = log_date.isoformat()
                    daily_counts[date_str] = daily_counts.get(date_str, 0) + 1
                except (ValueError, AttributeError):
                    pass
        
        # Statistiques par logger
        logger_counts: Dict[str, int] = {}
        for log in all_logs:
            logger_name = log.get("logger", "unknown")
            logger_counts[logger_name] = logger_counts.get(logger_name, 0) + 1
        
        return {
            "total_logs": len(all_logs),
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            },
            "by_level": level_counts,
            "by_day": daily_counts,
            "by_logger": logger_counts
        }
    
    def list_log_files(self) -> List[Dict[str, Any]]:
        """Liste les fichiers de logs disponibles.
        
        Returns:
            Liste de dictionnaires avec informations sur chaque fichier.
        """
        if not self.log_dir.exists():
            return []
        
        files_info: List[Dict[str, Any]] = []
        
        for file_path in sorted(self.log_dir.glob("logs_*.json"), reverse=True):
            try:
                # Extraire la date du nom de fichier
                filename = file_path.stem  # logs_2024-12-15 ou logs_2024-12-15_123045
                date_part = filename.split('_')[1]  # 2024-12-15 ou 2024-12-15_123045
                if '_' in date_part:
                    date_part = date_part.split('_')[0]  # 2024-12-15
                file_date = datetime.strptime(date_part, "%Y-%m-%d").date()
                
                # Taille du fichier
                file_size = file_path.stat().st_size
                
                # Compter les entrées (approximatif, on lit juste le début)
                entry_count = 0
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            entry_count = len(data)
                except (json.JSONDecodeError, IOError):
                    pass
                
                files_info.append({
                    "filename": file_path.name,
                    "date": file_date.isoformat(),
                    "size_bytes": file_size,
                    "entry_count": entry_count
                })
            except (ValueError, IndexError):
                # Nom de fichier invalide, ignorer
                continue
        
        return files_info
    
    def cleanup_old_files(self, retention_days: int = 30) -> int:
        """Supprime les fichiers de logs plus anciens que retention_days.
        
        Args:
            retention_days: Nombre de jours de rétention.
            
        Returns:
            Nombre de fichiers supprimés.
        """
        if not self.log_dir.exists():
            return 0
        
        deleted_count = 0
        cutoff_date = date.today() - timedelta(days=retention_days)
        
        try:
            for file_path in self.log_dir.glob("logs_*.json"):
                try:
                    # Extraire la date du nom de fichier
                    filename = file_path.stem
                    date_part = filename.split('_')[1]
                    if '_' in date_part:
                        date_part = date_part.split('_')[0]
                    file_date = datetime.strptime(date_part, "%Y-%m-%d").date()
                    
                    if file_date < cutoff_date:
                        file_path.unlink()
                        deleted_count += 1
                        logger.info(f"Fichier de log supprimé: {file_path.name}")
                except (ValueError, IndexError):
                    # Nom de fichier invalide, ignorer
                    continue
        except Exception as e:
            logger.error(f"Erreur lors du nettoyage des logs: {e}")
        
        return deleted_count
    
    def _get_file_path(self, target_date: date) -> Path:
        """Génère le chemin du fichier pour une date donnée.
        
        Args:
            target_date: Date pour laquelle générer le chemin.
            
        Returns:
            Chemin du fichier JSON.
        """
        filename = f"logs_{target_date.isoformat()}.json"
        return self.log_dir / filename
    
    def _load_logs_from_file(self, file_path: Path) -> List[Dict[str, Any]]:
        """Charge les logs depuis un fichier JSON.
        
        Args:
            file_path: Chemin du fichier JSON.
            
        Returns:
            Liste de dictionnaires représentant les logs.
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                return []
        except (json.JSONDecodeError, IOError, UnicodeDecodeError) as e:
            logger.warning(f"Impossible de charger le fichier de log {file_path}: {e}")
            return []
    
    def _filter_logs(
        self,
        logs: List[Dict[str, Any]],
        level: Optional[str] = None,
        logger_name: Optional[str] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Filtre une liste de logs selon des critères.
        
        Args:
            logs: Liste de logs à filtrer.
            level: Niveau de log à filtrer.
            logger_name: Nom du logger à filtrer.
            request_id: ID de requête à filtrer.
            endpoint: Endpoint à filtrer.
            
        Returns:
            Liste filtrée de logs.
        """
        filtered = logs
        
        if level:
            filtered = [log for log in filtered if log.get("level", "").upper() == level.upper()]
        
        if logger_name:
            filtered = [log for log in filtered if logger_name.lower() in log.get("logger", "").lower()]
        
        if request_id:
            filtered = [log for log in filtered if log.get("request_id") == request_id]
        
        if endpoint:
            filtered = [log for log in filtered if endpoint in log.get("endpoint", "")]
        
        return filtered



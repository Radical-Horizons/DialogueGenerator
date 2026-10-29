"""Utilitaire de nettoyage automatique des logs anciens."""
import logging
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from constants import resolve_logs_dir

logger = logging.getLogger(__name__)


def cleanup_old_logs(retention_days: int = 30, log_dir: Optional[str] = None) -> int:
    """Supprime les fichiers de logs plus anciens que retention_days.
    
    Args:
        retention_days: Nombre de jours de rétention (défaut: 30).
        log_dir: Dossier contenant les fichiers de logs. Par défaut: ``resolve_logs_dir()``.

    Returns:
        Nombre de fichiers supprimés.
    """
    log_path = Path(log_dir) if log_dir is not None else resolve_logs_dir()
    if not log_path.exists():
        logger.debug(f"Dossier de logs n'existe pas: {log_path}")
        return 0
    
    deleted_count = 0
    cutoff_date = date.today() - timedelta(days=retention_days)
    
    try:
        for file_path in log_path.glob("logs_*.json"):
            try:
                # Extraire la date du nom de fichier
                # Format: logs_YYYY-MM-DD.json ou logs_YYYY-MM-DD_HHMMSS.json
                filename = file_path.stem  # logs_2024-12-15 ou logs_2024-12-15_123045
                date_part = filename.split('_')[1]  # 2024-12-15 ou 2024-12-15_123045
                if '_' in date_part:
                    date_part = date_part.split('_')[0]  # 2024-12-15
                file_date = date.fromisoformat(date_part)
                
                if file_date < cutoff_date:
                    file_path.unlink()
                    deleted_count += 1
                    logger.info(f"Fichier de log supprimé: {file_path.name} (date: {file_date.isoformat()})")
            except (ValueError, IndexError) as e:
                # Nom de fichier invalide, ignorer
                logger.debug(f"Nom de fichier de log invalide ignoré: {file_path.name} ({e})")
                continue
    except Exception as e:
        logger.error(f"Erreur lors du nettoyage des logs: {e}")
    
    if deleted_count > 0:
        logger.info(f"Nettoyage des logs terminé: {deleted_count} fichier(s) supprimé(s)")
    
    return deleted_count


def cleanup_on_startup() -> None:
    """Effectue un nettoyage des logs au démarrage de l'application.
    
    Utilise la variable d'environnement LOG_RETENTION_DAYS ou la valeur par défaut (30 jours).
    """
    retention_days = int(os.getenv("LOG_RETENTION_DAYS", "30"))
    deleted_count = cleanup_old_logs(retention_days=retention_days)
    
    if deleted_count > 0:
        logger.info(f"Nettoyage automatique des logs au démarrage: {deleted_count} fichier(s) supprimé(s)")


if __name__ == "__main__":
    # Permet d'exécuter le script directement pour nettoyer les logs
    import sys
    
    retention_days = 30
    if len(sys.argv) > 1:
        try:
            retention_days = int(sys.argv[1])
        except ValueError:
            print(f"Usage: {sys.argv[0]} [retention_days]")
            sys.exit(1)
    
    deleted = cleanup_old_logs(retention_days=retention_days)
    print(f"Suppression de {deleted} fichier(s) de log(s)")


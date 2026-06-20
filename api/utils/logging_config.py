"""Configuration du logging structuré pour l'API."""
import os
import sys
import logging
import json
from typing import Any, Dict
from datetime import datetime, timezone
from pathlib import Path


class JSONFormatter(logging.Formatter):
    """Formateur JSON pour les logs structurés.
    
    Convertit les logs en format JSON pour faciliter l'analyse avec
    des outils comme ELK, CloudWatch, etc.
    """
    
    def format(self, record: logging.LogRecord) -> str:
        """Formate un log record en JSON.
        
        Args:
            record: Le record de log à formater.
            
        Returns:
            Chaîne JSON formatée.
        """
        log_data: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        
        # Ajouter le contexte enrichi si présent
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "endpoint"):
            log_data["endpoint"] = record.endpoint
        if hasattr(record, "method"):
            log_data["method"] = record.method
        if hasattr(record, "status_code"):
            log_data["status_code"] = record.status_code
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "environment"):
            log_data["environment"] = record.environment
        
        # Ajouter l'exception si présente
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
            log_data["exception_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
        
        # Ajouter les extra fields si présents
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)
        
        return json.dumps(log_data, ensure_ascii=False)


class StructuredFormatter(logging.Formatter):
    """Formateur structuré lisible pour le développement.
    
    Format texte lisible avec contexte enrichi.
    """
    
    def format(self, record: logging.LogRecord) -> str:
        """Formate un log record en texte structuré.
        
        Args:
            record: Le record de log à formater.
            
        Returns:
            Chaîne formatée avec contexte.
        """
        parts = [
            f"[{record.levelname:8s}]",
            f"{record.name}:{record.funcName}:{record.lineno}"
        ]
        
        # Ajouter le contexte enrichi
        context_parts = []
        if hasattr(record, "request_id"):
            context_parts.append(f"request_id={record.request_id}")
        if hasattr(record, "user_id"):
            context_parts.append(f"user_id={record.user_id}")
        if hasattr(record, "endpoint"):
            context_parts.append(f"endpoint={record.method} {record.endpoint}")
        if hasattr(record, "status_code"):
            context_parts.append(f"status={record.status_code}")
        if hasattr(record, "duration_ms"):
            context_parts.append(f"duration={record.duration_ms}ms")
        
        if context_parts:
            parts.append(f"({', '.join(context_parts)})")
        
        parts.append(record.getMessage())
        
        # Ajouter l'exception si présente
        if record.exc_info:
            parts.append("\n" + self.formatException(record.exc_info))
        
        return " ".join(parts)


def get_log_format() -> str:
    """Retourne le format de log configuré.
    
    Returns:
        Format de log : "json" ou "text".
    """
    format_str = os.getenv("LOG_FORMAT", "").lower()
    environment = os.getenv("ENVIRONMENT", "development").lower()
    
    # Par défaut : text en dev, json en prod
    if not format_str:
        return "json" if environment == "production" else "text"
    
    return format_str if format_str in ("json", "text") else "text"


def get_log_level() -> str:
    """Retourne le niveau de log configuré.
    
    Returns:
        Niveau de log (DEBUG, INFO, WARNING, ERROR, CRITICAL).
    """
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    valid_levels = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
    return level if level in valid_levels else "INFO"

def _normalize_level(level: str, default: str) -> str:
    """Normalise un niveau de log en valeur valide.
    
    Args:
        level: Valeur brute (env var).
        default: Niveau par défaut si invalide.
        
    Returns:
        Niveau normalisé (DEBUG/INFO/WARNING/ERROR/CRITICAL).
    """
    valid_levels = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
    value = (level or "").upper().strip()
    return value if value in valid_levels else default


def get_console_log_level() -> str:
    """Retourne le niveau de log pour la console.
    
    Variables:
        - LOG_CONSOLE_LEVEL: niveau console (prioritaire)
        - LOG_LEVEL: fallback historique
    """
    return _normalize_level(os.getenv("LOG_CONSOLE_LEVEL", ""), get_log_level())


def get_file_log_level() -> str:
    """Retourne le niveau de log pour le fichier.
    
    Variables:
        - LOG_FILE_LEVEL: niveau fichier (prioritaire)
        - LOG_LEVEL: fallback historique
    """
    return _normalize_level(os.getenv("LOG_FILE_LEVEL", ""), get_log_level())


def _min_level(*levels: str) -> str:
    """Retourne le niveau le plus permissif (min) parmi plusieurs niveaux.
    
    Exemple: min(INFO, WARNING) = INFO.
    """
    order = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}
    min_val = min(order.get(l, 20) for l in levels if l)
    for k, v in order.items():
        if v == min_val:
            return k
    return "INFO"


def setup_logging() -> None:
    """Configure le logging structuré pour l'API.
    
    Configure le format (JSON ou text) selon l'environnement et les variables
    d'environnement. Ajoute également un handler de fichier si activé.
    """
    # Windows: éviter UnicodeEncodeError (ex. caractère ≤ dans les prompts loggés en DEBUG)
    if sys.platform == "win32":
        for stream in (sys.stdout, sys.stderr):
            if hasattr(stream, "reconfigure"):
                try:
                    stream.reconfigure(encoding="utf-8", errors="replace")
                except Exception:
                    pass
                break

    log_format = get_log_format()
    log_level = get_log_level()
    console_level = get_console_log_level()
    file_level = get_file_log_level()
    environment = os.getenv("ENVIRONMENT", "development")
    
    # Créer le formateur approprié
    if log_format == "json":
        formatter = JSONFormatter()
    else:
        formatter = StructuredFormatter(
            fmt="%(asctime)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
    
    # Configurer le handler console
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(getattr(logging, console_level))
    
    # Configurer le root logger
    root_logger = logging.getLogger()
    # Le root doit accepter au moins les niveaux nécessaires aux handlers
    root_logger.setLevel(getattr(logging, _min_level(console_level, file_level)))
    root_logger.handlers = []  # Nettoyer les handlers existants
    root_logger.addHandler(console_handler)
    
    # Ajouter le handler de fichier si activé
    log_file_enabled = os.getenv("LOG_FILE_ENABLED", "true").lower() not in ("false", "0", "no", "off")
    if log_file_enabled:
        try:
            from api.utils.log_file_handler import DateRotatingFileHandler
            from constants import FilePaths
            
            # Configuration du dossier de logs
            log_dir = os.getenv("LOG_DIR", str(FilePaths.LOGS_DIR))
            retention_days = int(os.getenv("LOG_RETENTION_DAYS", "30"))
            
            # Créer le handler de fichier (toujours en format JSON pour faciliter l'analyse)
            file_handler = DateRotatingFileHandler(
                log_dir=log_dir,
                retention_days=retention_days,
                max_file_size_mb=int(os.getenv("LOG_MAX_FILE_SIZE_MB", "100"))
            )
            file_handler.setLevel(getattr(logging, file_level))
            # Utiliser JSONFormatter pour les fichiers (même si console est en texte)
            file_formatter = JSONFormatter()
            file_handler.setFormatter(file_formatter)
            
            root_logger.addHandler(file_handler)
            
            logger = logging.getLogger(__name__)
            logger.info(
                f"Logging fichier activé: dossier={log_dir}, rétention={retention_days} jours",
                extra={"environment": environment}
            )
        except Exception as e:
            # En cas d'erreur, continuer avec console uniquement
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Impossible d'activer le logging fichier: {e}. Continuation avec console uniquement.",
                extra={"environment": environment}
            )
    
    # Réduire la verbosité de certains loggers spécifiques
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    # Uvicorn est très verbeux; si la console est en WARNING/ERROR, on le rend silencieux.
    # En DEBUG/INFO, conserver les infos utiles de démarrage.
    if console_level in ("WARNING", "ERROR", "CRITICAL"):
        logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    else:
        logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("sentry_sdk").setLevel(logging.WARNING)
    # Réduire la verbosité des logs watchfiles (reload automatique)
    logging.getLogger("watchfiles").setLevel(logging.WARNING)
    logging.getLogger("watchfiles.main").setLevel(logging.WARNING)
    logging.getLogger("watchfiles.main._log_changes").setLevel(logging.WARNING)
    # Réduire la verbosité des logs du cache HTTP et GDD en développement
    if log_format == "text":  # En développement (format texte)
        logging.getLogger("api.middleware.http_cache").setLevel(logging.INFO)
        logging.getLogger("api.utils.gdd_cache").setLevel(logging.INFO)
        # Hot path contexte (estimate-tokens) : les logs DEBUG par champ/élément des
        # modules de construction/sérialisation sont très volumineux et dominent le
        # temps de réponse (I/O fichier JSON). On les plafonne à INFO en développement,
        # même si LOG_LEVEL=DEBUG, pour garder les estimations rapides.
        # Opt-in explicite via LOG_CONTEXT_VERBOSE=true pour déboguer ce pipeline.
        context_verbose = os.getenv("LOG_CONTEXT_VERBOSE", "false").lower() in ("true", "1", "yes", "on")
        if not context_verbose:
            for noisy_logger in (
                "core.context.context_builder",
                "services.context_construction_service",
                "services.context_organizer",
                "services.context_serializer",
                "services.context_serializer.deduplicator",
            ):
                logging.getLogger(noisy_logger).setLevel(logging.INFO)
    
    # Ajouter l'environnement au logger context
    # (sera enrichi par le middleware)
    logging.LoggerAdapter(logging.getLogger("api"), {"environment": environment})
    
    # Logger la configuration
    logger = logging.getLogger(__name__)
    logger.info(
        f"Logging configuré: format={log_format}, level={log_level}, console={console_level}, file={file_level}, environment={environment}, fichier={'activé' if log_file_enabled else 'désactivé'}",
        extra={"environment": environment}
    )




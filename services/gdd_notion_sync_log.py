"""Journalisation dédiée sync GDD Notion (fichier sous data/logs/)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from constants import FilePaths

_SYNC_LOGGER_NAME = "gdd_notion_sync"
_configured = False


def get_gdd_notion_sync_logger() -> logging.Logger:
    """Retourne le logger fichier + propagation vers root."""
    global _configured
    log = logging.getLogger(_SYNC_LOGGER_NAME)
    if _configured:
        return log
    log.setLevel(logging.INFO)
    log.propagate = True
    try:
        log_dir = Path(__file__).resolve().parent.parent / FilePaths.LOGS_DIR
        log_dir.mkdir(parents=True, exist_ok=True)
        path = log_dir / "gdd_notion_sync.log"
        fh = logging.FileHandler(path, encoding="utf-8")
        fh.setLevel(logging.INFO)
        fh.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
        )
        if not any(
            isinstance(h, logging.FileHandler) and getattr(h, "baseFilename", "") == str(path)
            for h in log.handlers
        ):
            log.addHandler(fh)
    except OSError:
        logging.getLogger(__name__).warning(
            "Impossible de créer le fichier de log gdd_notion_sync.log"
        )
    _configured = True
    return log


def log_sync_event(message: str, *, request_id: Optional[str] = None) -> None:
    """Écrit une ligne dans le journal sync avec request_id optionnel."""
    logger = get_gdd_notion_sync_logger()
    prefix = f"[request_id={request_id}] " if request_id else ""
    logger.info("%s%s", prefix, message)

"""Dossier de logs : écrivains et lecteurs résolvent tous ``LOG_DIR`` au même endroit.

Régression : les lecteurs (``LogService``, router ``/api/v1/logs``, nettoyage) relisaient
``FilePaths.LOGS_DIR`` en dur alors que les écrivains honoraient ``LOG_DIR`` — dès que la
variable était posée, l'API de consultation ne voyait plus aucun fichier écrit.
"""
import logging
import uuid
from pathlib import Path
from typing import List

import pytest

import constants
from api.routers.logs import get_log_service
from api.services.log_service import LogService
from api.utils.log_file_handler import DateRotatingFileHandler
from api.utils.logging_config import setup_logging
from constants import resolve_logs_dir
from services import gdd_notion_sync_log
from services.export_log_service import ExportLogService


def test_default_is_anchored_at_repo_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Sans ``LOG_DIR``, le dossier est ``<dépôt>/data/logs`` quel que soit le répertoire courant."""
    monkeypatch.delenv("LOG_DIR", raising=False)
    monkeypatch.chdir(tmp_path)

    expected = Path(constants.__file__).resolve().parent / "data" / "logs"
    assert resolve_logs_dir() == expected
    assert resolve_logs_dir().is_absolute()


def test_blank_log_dir_falls_back_to_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un ``LOG_DIR`` vide ou blanc ne doit pas devenir ``Path('')`` (répertoire courant)."""
    monkeypatch.delenv("LOG_DIR", raising=False)
    default = resolve_logs_dir()

    monkeypatch.setenv("LOG_DIR", "   ")
    assert resolve_logs_dir() == default


def test_log_dir_overrides_every_default(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Avec ``LOG_DIR`` posé, lecteurs et logs export pointent sous ce dossier."""
    log_dir = tmp_path / "logs"
    monkeypatch.setenv("LOG_DIR", str(log_dir))

    assert resolve_logs_dir() == log_dir
    assert LogService().log_dir == log_dir
    assert get_log_service().log_dir == log_dir
    assert ExportLogService().logs_dir == log_dir / "exports"


def test_log_service_reads_where_main_handler_writes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Une entrée écrite par le handler de ``setup_logging`` est retrouvée par l'API de consultation."""
    log_dir = tmp_path / "logs"
    monkeypatch.setenv("LOG_DIR", str(log_dir))
    monkeypatch.setenv("LOG_FILE_ENABLED", "true")
    monkeypatch.setenv("LOG_FILE_LEVEL", "INFO")

    root = logging.getLogger()
    original_handlers = root.handlers[:]
    original_level = root.level
    try:
        setup_logging()
        file_handlers: List[DateRotatingFileHandler] = [
            h for h in root.handlers if isinstance(h, DateRotatingFileHandler)
        ]
        assert [h.log_dir for h in file_handlers] == [log_dir]

        logger_name = f"tests.log_dir.{uuid.uuid4().hex}"
        marker = f"marker-{uuid.uuid4().hex}"
        logging.getLogger(logger_name).warning(marker)
        for handler in file_handlers:
            handler.flush()

        entries, total = get_log_service().search_logs(logger_name=logger_name)
        assert total == 1
        assert entries[0]["message"] == marker
    finally:
        # Un handle ouvert dans `tmp_path` fait échouer son nettoyage sous Windows.
        for handler in root.handlers:
            if handler not in original_handlers:
                handler.close()
        root.handlers = original_handlers
        root.setLevel(original_level)


def test_gdd_notion_sync_log_lands_in_log_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Le journal de sync Notion s'écrit sous ``LOG_DIR``, à côté des logs JSON."""
    monkeypatch.setenv("LOG_DIR", str(tmp_path))
    monkeypatch.setattr(gdd_notion_sync_log, "_configured", False)
    sync_logger = logging.getLogger(gdd_notion_sync_log._SYNC_LOGGER_NAME)
    original_handlers = sync_logger.handlers[:]
    try:
        marker = f"marker-{uuid.uuid4().hex}"
        gdd_notion_sync_log.log_sync_event(marker)

        added = [h for h in sync_logger.handlers if h not in original_handlers]
        assert [Path(h.baseFilename) for h in added] == [tmp_path / "gdd_notion_sync.log"]
        for handler in added:
            handler.flush()
        assert marker in (tmp_path / "gdd_notion_sync.log").read_text(encoding="utf-8")
    finally:
        for handler in sync_logger.handlers[:]:
            if handler not in original_handlers:
                sync_logger.removeHandler(handler)
                handler.close()

"""Tests pour la configuration du logging structuré."""
import os
import json
import logging
import pytest
from unittest.mock import patch
from api.utils.logging_config import (
    JSONFormatter,
    StructuredFormatter,
    get_log_format,
    get_log_level,
    setup_logging
)


def test_json_formatter_basic():
    """Test que JSONFormatter formate un log en JSON."""
    formatter = JSONFormatter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="Test message",
        args=(),
        exc_info=None
    )
    
    result = formatter.format(record)
    data = json.loads(result)
    
    assert data["level"] == "INFO"
    assert data["message"] == "Test message"
    assert data["logger"] == "test"


def test_json_formatter_with_context():
    """Test que JSONFormatter inclut le contexte enrichi."""
    formatter = JSONFormatter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="Test message",
        args=(),
        exc_info=None
    )
    
    # Ajouter du contexte
    record.request_id = "test-request-123"
    record.endpoint = "/api/test"
    record.method = "GET"
    record.status_code = 200
    record.duration_ms = 150
    
    result = formatter.format(record)
    data = json.loads(result)
    
    assert data["request_id"] == "test-request-123"
    assert data["endpoint"] == "/api/test"
    assert data["method"] == "GET"
    assert data["status_code"] == 200
    assert data["duration_ms"] == 150


def test_json_formatter_with_exception():
    """Test que JSONFormatter inclut l'exception si présente."""
    formatter = JSONFormatter()
    
    try:
        raise ValueError("Test error")
    except ValueError as e:
        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="test.py",
            lineno=1,
            msg="Error occurred",
            args=(),
            exc_info=(type(e), e, e.__traceback__)
        )
        
        result = formatter.format(record)
        data = json.loads(result)
        
        assert "exception" in data
        assert data["exception_type"] == "ValueError"


def test_structured_formatter_basic():
    """Test que StructuredFormatter formate un log en texte structuré."""
    formatter = StructuredFormatter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="Test message",
        args=(),
        exc_info=None
    )
    
    result = formatter.format(record)
    
    assert "INFO" in result
    assert "test.py" in result or "test" in result
    assert "Test message" in result


def test_structured_formatter_with_context():
    """Test que StructuredFormatter inclut le contexte."""
    formatter = StructuredFormatter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="Test message",
        args=(),
        exc_info=None
    )
    
    record.request_id = "test-request-123"
    record.endpoint = "/api/test"
    record.method = "GET"
    
    result = formatter.format(record)
    
    assert "request_id=test-request-123" in result
    assert "endpoint=GET /api/test" in result


def test_get_log_format_default_dev():
    """Test que get_log_format retourne 'text' par défaut en développement."""
    with patch.dict(os.environ, {}, clear=True):
        # Pas de LOG_FORMAT, pas d'ENVIRONMENT -> dev par défaut
        format_str = get_log_format()
        assert format_str == "text"


def test_get_log_format_default_prod():
    """Test que get_log_format retourne 'json' par défaut en production."""
    with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=True):
        format_str = get_log_format()
        assert format_str == "json"


def test_get_log_format_explicit():
    """Test que get_log_format respecte LOG_FORMAT si défini."""
    with patch.dict(os.environ, {"LOG_FORMAT": "json"}, clear=True):
        format_str = get_log_format()
        assert format_str == "json"
    
    with patch.dict(os.environ, {"LOG_FORMAT": "text"}, clear=True):
        format_str = get_log_format()
        assert format_str == "text"


def test_get_log_level_default():
    """Test que get_log_level retourne INFO par défaut."""
    with patch.dict(os.environ, {}, clear=True):
        level = get_log_level()
        assert level == "INFO"


def test_get_log_level_custom():
    """Test que get_log_level charge depuis LOG_LEVEL."""
    with patch.dict(os.environ, {"LOG_LEVEL": "DEBUG"}, clear=True):
        level = get_log_level()
        assert level == "DEBUG"
    
    with patch.dict(os.environ, {"LOG_LEVEL": "ERROR"}, clear=True):
        level = get_log_level()
        assert level == "ERROR"


def test_get_log_level_invalid():
    """Test que get_log_level retourne INFO pour une valeur invalide."""
    with patch.dict(os.environ, {"LOG_LEVEL": "INVALID"}, clear=True):
        level = get_log_level()
        assert level == "INFO"


def test_setup_logging(tmp_path):
    """Test que setup_logging configure le logging."""
    # `LOG_DIR` explicite : `clear=True` l'effacerait, et le handler fichier écrirait dans le vrai `data/logs/`.
    env = {"LOG_FORMAT": "text", "LOG_LEVEL": "INFO", "LOG_DIR": str(tmp_path)}
    with patch.dict(os.environ, env, clear=True):
        # Nettoyer les handlers existants
        root_logger = logging.getLogger()
        original_handlers = root_logger.handlers[:]
        root_logger.handlers = []

        try:
            setup_logging()

            # Vérifier qu'un handler a été ajouté
            assert len(root_logger.handlers) > 0

        finally:
            for handler in root_logger.handlers:
                handler.close()
            # Restaurer les handlers originaux
            root_logger.handlers = original_handlers







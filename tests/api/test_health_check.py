"""Tests pour les health checks."""
import os
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path
from api.utils.health_check import (
    HealthCheckResult,
    check_config,
    check_storage,
    check_gdd_files,
    check_llm_connectivity,
    perform_health_checks
)


def test_health_check_result_to_dict():
    """Test la conversion d'un HealthCheckResult en dictionnaire."""
    result = HealthCheckResult(
        name="test_check",
        status="healthy",
        message="Test message",
        details={"key": "value"}
    )
    
    result_dict = result.to_dict()
    
    assert result_dict["name"] == "test_check"
    assert result_dict["status"] == "healthy"
    assert result_dict["message"] == "Test message"
    assert result_dict["details"] == {"key": "value"}


def test_check_storage_success(tmp_path):
    """Test que check_storage retourne healthy quand le répertoire est accessible."""
    with patch("api.utils.health_check.FilePaths") as mock_filepaths:
        mock_filepaths.INTERACTIONS_DIR = tmp_path
        
        result = check_storage()
        
        assert result.status == "healthy"
        assert result.name == "storage"


def test_check_storage_cannot_create(tmp_path):
    """Test que check_storage retourne unhealthy si le répertoire ne peut pas être créé."""
    # Simuler un répertoire qui ne peut pas être créé
    with patch("api.utils.health_check.FilePaths") as mock_filepaths:
        mock_filepaths.INTERACTIONS_DIR = tmp_path / "nonexistent" / "subdir"
        
        with patch("pathlib.Path.mkdir", side_effect=PermissionError("Permission denied")):
            result = check_storage()
            
            assert result.status == "unhealthy"
            assert "Permission denied" in result.message or "Impossible" in result.message


def test_check_config_development():
    """Test que check_config accepte la valeur par défaut en développement."""
    with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=True):
        with patch("api.utils.health_check.get_security_config") as mock_config:
            mock_security_config = MagicMock()
            mock_security_config.is_production = False
            mock_security_config.jwt_secret_key = "your-secret-key-change-in-production"
            mock_security_config.validate_config = MagicMock()  # Ne lève pas d'exception
            mock_config.return_value = mock_security_config
            
            result = check_config()
            
            assert result.status in ("healthy", "degraded")
            # En dev, même avec valeur par défaut, ce n'est pas un problème bloquant


def test_check_config_production_default_key():
    """Test que check_config détecte la clé par défaut en production."""
    with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=True):
        with patch("api.utils.health_check.get_security_config") as mock_config:
            mock_security_config = MagicMock()
            mock_security_config.is_production = True
            mock_security_config.jwt_secret_key = "your-secret-key-change-in-production"
            mock_security_config.validate_config = MagicMock(side_effect=ValueError("Invalid config"))
            mock_config.return_value = mock_security_config
            
            result = check_config()
            
            assert result.status == "unhealthy"


def test_check_llm_connectivity_disabled():
    """Test que check_llm_connectivity retourne healthy si le ping est désactivé."""
    with patch.dict(os.environ, {"HEALTH_CHECK_LLM_PING": "false"}, clear=True):
        result = check_llm_connectivity()
        
        assert result.status == "healthy"
        assert "désactivée" in result.message.lower()


def test_check_llm_connectivity_no_api_key():
    """Test que check_llm_connectivity retourne degraded si pas de clé API."""
    with patch.dict(os.environ, {"HEALTH_CHECK_LLM_PING": "true", "OPENAI_API_KEY": ""}, clear=True):
        result = check_llm_connectivity()
        
        assert result.status == "degraded"
        assert "clé api" in result.message.lower() or "api key" in result.message.lower()


def test_check_llm_connectivity_with_api_key():
    """Test que check_llm_connectivity retourne healthy si clé API présente."""
    with patch.dict(os.environ, {"HEALTH_CHECK_LLM_PING": "true", "OPENAI_API_KEY": "test-key"}, clear=True):
        result = check_llm_connectivity()
        
        assert result.status == "healthy"


def test_perform_health_checks_basic():
    """Test que perform_health_checks retourne les checks de base."""
    with patch("api.utils.health_check.check_config") as mock_check_config, \
         patch("api.utils.health_check.check_storage") as mock_check_storage:
        
        mock_check_config.return_value = HealthCheckResult("config", "healthy")
        mock_check_storage.return_value = HealthCheckResult("storage", "healthy")
        
        result = perform_health_checks(detailed=False)
        
        assert result["status"] == "healthy"
        assert len(result["checks"]) == 2
        assert result["timestamp"] is None  # Sera ajouté par l'endpoint


def test_perform_health_checks_detailed():
    """Test que perform_health_checks retourne tous les checks en mode détaillé."""
    with patch("api.utils.health_check.check_config") as mock_check_config, \
         patch("api.utils.health_check.check_storage") as mock_check_storage, \
         patch("api.utils.health_check.check_gdd_files") as mock_check_gdd, \
         patch("api.utils.health_check.check_llm_connectivity") as mock_check_llm:
        
        mock_check_config.return_value = HealthCheckResult("config", "healthy")
        mock_check_storage.return_value = HealthCheckResult("storage", "healthy")
        mock_check_gdd.return_value = HealthCheckResult("gdd_files", "healthy")
        mock_check_llm.return_value = HealthCheckResult("llm_connectivity", "healthy")
        
        result = perform_health_checks(detailed=True)
        
        assert result["status"] == "healthy"
        assert len(result["checks"]) == 4


def test_perform_health_checks_unhealthy():
    """Test que perform_health_checks retourne unhealthy si un check est unhealthy."""
    with patch("api.utils.health_check.check_config") as mock_check_config, \
         patch("api.utils.health_check.check_storage") as mock_check_storage:
        
        mock_check_config.return_value = HealthCheckResult("config", "unhealthy", "Config error")
        mock_check_storage.return_value = HealthCheckResult("storage", "healthy")
        
        result = perform_health_checks(detailed=False)
        
        assert result["status"] == "unhealthy"


def test_perform_health_checks_degraded():
    """Test que perform_health_checks retourne degraded si un check est degraded."""
    with patch("api.utils.health_check.check_config") as mock_check_config, \
         patch("api.utils.health_check.check_storage") as mock_check_storage:
        
        mock_check_config.return_value = HealthCheckResult("config", "healthy")
        mock_check_storage.return_value = HealthCheckResult("storage", "degraded", "Warning")
        
        result = perform_health_checks(detailed=False)
        
        assert result["status"] == "degraded"




"""Tests pour la configuration de sécurité."""
import os
import pytest
from unittest.mock import patch
from api.config.security_config import (
    SecurityConfig,
    get_security_config,
    DEFAULT_JWT_SECRET_KEY
)


def test_security_config_default_values():
    """Test que SecurityConfig a des valeurs par défaut appropriées."""
    with patch.dict(os.environ, {}, clear=True):
        config = SecurityConfig()
        
        assert config.jwt_secret_key == DEFAULT_JWT_SECRET_KEY
        assert config.auth_rate_limit_enabled is True
        assert config.auth_rate_limit_requests == 20
        assert config.auth_rate_limit_window == 60
        assert config.environment == "development"
        assert config.is_development is True
        assert config.is_production is False
        assert config.disable_auth is False


def test_security_config_from_env():
    """Test que SecurityConfig charge les valeurs depuis les variables d'environnement."""
    env_vars = {
        "JWT_SECRET_KEY": "test-secret-key-123",
        "AUTH_RATE_LIMIT_ENABLED": "false",
        "AUTH_RATE_LIMIT_REQUESTS": "10",
        "AUTH_RATE_LIMIT_WINDOW": "120",
        "ENVIRONMENT": "production"
    }
    
    with patch.dict(os.environ, env_vars, clear=True):
        config = SecurityConfig()
        
        assert config.jwt_secret_key == "test-secret-key-123"
        assert config.auth_rate_limit_enabled is False
        assert config.auth_rate_limit_requests == 10
        assert config.auth_rate_limit_window == 120
        assert config.environment == "production"
        assert config.is_production is True
        assert config.is_development is False


def test_security_config_validate_development():
    """Test que la validation en développement permet les valeurs par défaut."""
    with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=True):
        config = SecurityConfig()
        # Ne doit pas lever d'exception en développement
        config.validate_config()


def test_security_config_validate_production_default_key():
    """Test que la validation en production rejette la clé par défaut."""
    with patch.dict(os.environ, {
        "ENVIRONMENT": "production",
        "DISABLE_AUTH": "false",
        "CORS_ORIGINS": "https://app.example.com",
        "JWT_SECRET_KEY": DEFAULT_JWT_SECRET_KEY
    }, clear=True):
        config = SecurityConfig()
        
        with pytest.raises(ValueError, match="JWT_SECRET_KEY ne peut pas être la valeur par défaut en production"):
            config.validate_config()


def test_security_config_validate_production_custom_key():
    """Test que la validation en production accepte une clé personnalisée."""
    with patch.dict(os.environ, {
        "ENVIRONMENT": "production",
        "DISABLE_AUTH": "false",
        "CORS_ORIGINS": "https://app.example.com",
        "JWT_SECRET_KEY": "custom-secret-key-123"
    }, clear=True):
        config = SecurityConfig()
        # Ne doit pas lever d'exception avec une clé personnalisée
        config.validate_config()


def test_security_config_validate_production_rejects_disable_auth():
    """Test que DISABLE_AUTH=true est interdit en production."""
    with patch.dict(os.environ, {
        "ENVIRONMENT": "production",
        "DISABLE_AUTH": "true",
        "CORS_ORIGINS": "https://app.example.com",
        "JWT_SECRET_KEY": "custom-secret-key-123",
    }, clear=True):
        config = SecurityConfig()
        with pytest.raises(ValueError, match="DISABLE_AUTH"):
            config.validate_config()


def test_security_config_validate_production_requires_cors_or_public_origin():
    """Test qu'en production il faut CORS_ORIGINS ou PUBLIC_ORIGIN."""
    with patch.dict(os.environ, {
        "ENVIRONMENT": "production",
        "DISABLE_AUTH": "false",
        "JWT_SECRET_KEY": "custom-secret-key-123",
    }, clear=True):
        config = SecurityConfig()
        with pytest.raises(ValueError, match="CORS_ORIGINS|PUBLIC_ORIGIN"):
            config.validate_config()


def test_security_config_validate_production_accepts_public_origin_only():
    """Test que PUBLIC_ORIGIN seul suffit en production (sans CORS_ORIGINS)."""
    with patch.dict(os.environ, {
        "ENVIRONMENT": "production",
        "DISABLE_AUTH": "false",
        "JWT_SECRET_KEY": "custom-secret-key-123",
        "PUBLIC_ORIGIN": "https://demo.auto-diffusion.net",
    }, clear=True):
        config = SecurityConfig()
        config.validate_config()


def test_get_security_config_singleton():
    """Test que get_security_config retourne une instance singleton."""
    import api.config.security_config

    try:
        with patch.dict(os.environ, {"DISABLE_AUTH": "true"}, clear=True):
            api.config.security_config._security_config = None

            config1 = get_security_config()
            config2 = get_security_config()

            assert config1 is config2
    finally:
        # Évite de laisser un singleton créé sous env vidé (disable_auth=False)
        # qui polluerait les tests suivants dépendant de DISABLE_AUTH=true.
        api.config.security_config._security_config = None


def test_security_config_rate_limit_boolean():
    """Test que AUTH_RATE_LIMIT_ENABLED accepte des valeurs booléennes via env."""
    # Test avec "true"
    with patch.dict(os.environ, {"AUTH_RATE_LIMIT_ENABLED": "true"}, clear=True):
        config = SecurityConfig()
        assert config.auth_rate_limit_enabled is True
    
    # Test avec "false"
    with patch.dict(os.environ, {"AUTH_RATE_LIMIT_ENABLED": "false"}, clear=True):
        config = SecurityConfig()
        assert config.auth_rate_limit_enabled is False







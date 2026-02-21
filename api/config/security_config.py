"""Configuration de sécurité pour l'API."""
import os
import logging
import sys
from typing import Optional, Tuple
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic_settings.sources import PydanticBaseSettingsSource

logger = logging.getLogger(__name__)

# Valeur par défaut pour JWT_SECRET_KEY (utilisée uniquement en développement)
DEFAULT_JWT_SECRET_KEY = "your-secret-key-change-in-production"

def _is_running_under_pytest() -> bool:
    """Indique si le code s'exécute sous pytest.

    Returns:
        True si pytest est en cours d'exécution, False sinon.
    """
    # Ne pas se baser sur os.environ: certains tests le vident via patch.dict(..., clear=True).
    return "pytest" in sys.modules


class SecurityConfig(BaseSettings):
    """Configuration de sécurité de l'API.
    
    Charge les variables d'environnement depuis .env ou les variables d'environnement système.
    Utilise des valeurs par défaut pour le développement, mais exige des valeurs personnalisées
    en production.
    """
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    @classmethod
    def settings_customise_sources(
        cls,
        _settings_cls: type["SecurityConfig"],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> Tuple[PydanticBaseSettingsSource, ...]:
        """Personnalise les sources de configuration.

        En test (pytest), on ignore volontairement le fichier `.env` pour garantir
        des tests déterministes (les tests patchent `os.environ`).

        Returns:
            Un tuple de sources à utiliser, dans l'ordre de priorité.
        """
        if _is_running_under_pytest():
            return (init_settings, env_settings, file_secret_settings)
        return (init_settings, env_settings, dotenv_settings, file_secret_settings)
    
    # JWT Configuration
    jwt_secret_key: str = DEFAULT_JWT_SECRET_KEY
    
    # Rate Limiting Configuration
    auth_rate_limit_enabled: bool = True
    auth_rate_limit_requests: int = 5
    auth_rate_limit_window: int = 60  # en secondes
    
    # Environment
    environment: str = "development"
    
    @property
    def is_production(self) -> bool:
        """Indique si l'application est en mode production.
        
        Returns:
            True si ENVIRONMENT=production, False sinon.
        """
        return self.environment.lower() == "production"
    
    @property
    def is_development(self) -> bool:
        """Indique si l'application est en mode développement.
        
        Returns:
            True si ENVIRONMENT=development (ou non défini), False sinon.
        """
        return not self.is_production
    
    def validate_config(self) -> None:
        """Valide la configuration de sécurité.
        
        En développement : log des warnings si valeurs par défaut utilisées.
        En production : lève une exception si JWT_SECRET_KEY est la valeur par défaut.
        
        Raises:
            ValueError: Si la configuration est invalide en production.
        """
        if self.is_production:
            if self.jwt_secret_key == DEFAULT_JWT_SECRET_KEY:
                raise ValueError(
                    "JWT_SECRET_KEY ne peut pas être la valeur par défaut en production. "
                    "Veuillez définir une clé secrète sécurisée dans .env ou les variables d'environnement."
                )
            logger.info("Configuration de sécurité validée (production)")
        else:
            # En développement, ne pas logger de warning pour la clé par défaut (c'est acceptable en dev)
            # Les warnings sont loggés uniquement en production via les exceptions
            if self.jwt_secret_key != DEFAULT_JWT_SECRET_KEY:
                logger.debug("Configuration de sécurité chargée (développement)")


# Instance globale de configuration
_security_config: Optional[SecurityConfig] = None


def get_security_config() -> SecurityConfig:
    """Retourne l'instance de configuration de sécurité (singleton).
    
    Returns:
        Instance de SecurityConfig.
    """
    global _security_config
    if _security_config is None:
        _security_config = SecurityConfig()
    return _security_config




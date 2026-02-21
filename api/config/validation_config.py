"""Configuration pour la validation des exports Unity."""
import os
import logging
import sys
from typing import Tuple

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic_settings.sources import PydanticBaseSettingsSource

from api.config.security_config import SecurityConfig

logger = logging.getLogger(__name__)

def _is_running_under_pytest() -> bool:
    """Indique si le code s'exécute sous pytest.

    Returns:
        True si pytest est en cours d'exécution, False sinon.
    """
    # Ne pas se baser sur os.environ: certains tests le vident via patch.dict(..., clear=True).
    return "pytest" in sys.modules


class ValidationConfig(BaseSettings):
    """Configuration pour la validation des exports Unity.
    
    Charge les variables d'environnement depuis .env ou les variables d'environnement système.
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
        _settings_cls: type["ValidationConfig"],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> Tuple[PydanticBaseSettingsSource, ...]:
        """Personnalise les sources de configuration.

        En test (pytest), on ignore le fichier `.env` afin d'éviter des tests non déterministes.

        Returns:
            Un tuple de sources à utiliser, dans l'ordre de priorité.
        """
        if _is_running_under_pytest():
            return (init_settings, env_settings, file_secret_settings)
        return (init_settings, env_settings, dotenv_settings, file_secret_settings)
    
    # Unity Schema Validation
    enable_unity_schema_validation: bool = False
    
    def should_validate_unity_schema(self, security_config: SecurityConfig) -> bool:
        """Détermine si la validation Unity Schema doit être activée.
        
        Args:
            security_config: Configuration de sécurité pour vérifier l'environnement.
            
        Returns:
            True si la validation doit être activée, False sinon.
            
        Conditions:
            - Le flag ENABLE_UNITY_SCHEMA_VALIDATION doit être True
            - L'environnement ne doit pas être production
            - Le schéma doit être disponible (vérifié via api.utils.unity_schema_validator)
        """
        if not self.enable_unity_schema_validation:
            return False
        
        if security_config.is_production:
            logger.debug("Validation Unity Schema désactivée en production")
            return False
        
        # Vérifier que le schéma existe
        from api.utils.unity_schema_validator import schema_exists
        if not schema_exists():
            logger.debug("Schéma Unity non disponible, validation désactivée")
            return False
        
        return True


# Instance globale (sera initialisée au démarrage de l'API)
_validation_config: ValidationConfig | None = None


def get_validation_config() -> ValidationConfig:
    """Récupère l'instance globale de ValidationConfig.
    
    Returns:
        L'instance de ValidationConfig.
    """
    global _validation_config
    if _validation_config is None:
        _validation_config = ValidationConfig()
    return _validation_config


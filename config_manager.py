"""Module de gestion de configuration (DEPRECATED - Wrapper de compatibilité).

DEPRECATED: Ce module est maintenu uniquement pour rétrocompatibilité.
Utiliser `services.configuration_service.ConfigurationService` pour la gestion de configuration.

Ce module fournit :
- Fonctions utilitaires pour les fichiers JSON (conservées)
- Wrapper de compatibilité pour load_llm_config (redirige vers ConfigurationService)
"""
import warnings
import json
import os
from pathlib import Path
from typing import Optional, Dict, Any, List
import logging

from constants import FilePaths, Defaults

logger = logging.getLogger(__name__)

# Fonctions utilitaires conservées (non liées à la configuration)
def list_json_files(dialogues_base_path: Path, recursive: bool = False) -> List[Path]:
    """
    Lists .json files in the specified Unity dialogues path.

    Args:
        dialogues_base_path (Path): The base path to search for .json files.
        recursive (bool): If True, searches recursively in subdirectories.
                          Defaults to False (searches only in the root of dialogues_base_path).

    Returns:
        List[Path]: A list of Path objects for each .json file found.
    """
    if not dialogues_base_path or not dialogues_base_path.is_dir():
        logger.error(f"Cannot list .json files, path is invalid or not a directory: {dialogues_base_path}")
        return []

    pattern = "*.json"
    if recursive:
        pattern = "**/*.json" 
    
    try:
        json_files = list(dialogues_base_path.glob(pattern))
        return json_files
    except Exception as e:
        logger.error(f"Error listing .json files in {dialogues_base_path}: {e}")
        return []

def read_json_file_content(file_path: Path) -> Optional[str]:
    """
    Reads the content of a specified .json file.

    Args:
        file_path (Path): The Path object pointing to the .json file.

    Returns:
        Optional[str]: The content of the file as a string, or None if an error occurs.
    """
    if not file_path or not file_path.is_file():
        logger.error(f"Cannot read file, path is invalid or not a file: {file_path}")
        return None
    
    try:
        content = file_path.read_text(encoding="utf-8")
        return content
    except Exception as e:
        logger.error(f"Error reading file {file_path}: {e}")
        return None

# Constantes conservées pour compatibilité
DEFAULT_LLM_CONFIG_PATH = FilePaths.CONFIG_DIR / FilePaths.LLM_CONFIG
DEFAULT_UI_SETTINGS_PATH = FilePaths.CONFIG_DIR / "ui_settings.json"

def create_default_config_files():
    """DEPRECATED: Cette fonction est maintenue pour compatibilité uniquement.
    
    Pour créer des fichiers de configuration par défaut, utiliser ConfigurationService.
    """
    warnings.warn(
        "create_default_config_files() is deprecated. "
        "Use services.configuration_service.ConfigurationService instead.",
        DeprecationWarning,
        stacklevel=2
    )
    
    if not os.path.exists(FilePaths.CONFIG_DIR):
        os.makedirs(FilePaths.CONFIG_DIR)
    
    if not os.path.exists(FilePaths.INTERACTIONS_DIR):
        os.makedirs(FilePaths.INTERACTIONS_DIR)

    # Default ui_settings.json
    default_ui_settings = {
        "font_family": "Arial",
        "font_size": 10,
        "theme": "light",
        "main_window_geometry": None,
        "main_splitter_sizes": None,
        "dialogue_generation_history": [],
        "left_panel_settings": { 
            "filters": {},
            "checked_items": {}
        },
        "generation_params": {
            "llm_model_identifier": Defaults.MODEL_ID,
            "max_context_tokens": Defaults.CONTEXT_TOKENS,
            "variants_count": Defaults.VARIANTS_COUNT,
            "temperature": Defaults.TEMPERATURE,
            "max_response_tokens": 1000,
            "scene_instruction_template": "",
            "auto_save_context": False
        },
        "last_opened_interaction_path": "",
        "unity_dialogues_path": str(Path.cwd() / "Assets" / "Dialogues" / "generated"),
        "context_config_path": str(Path.cwd() / "context_config.json")
    }

    # Default llm_config.json
    default_llm_config = {
        "available_llm_models": [
            {
                "model_identifier": Defaults.MODEL_ID,
                "display_name": f"OpenAI - {Defaults.MODEL_ID}",
                "api_key_env_var": "OPENAI_API_KEY",
                "client_type": "openai",
                "parameters": {
                    "max_tokens": Defaults.MAX_TOKENS_MODEL,
                    "temperature_range": [0.0, 2.0],
                    "default_temperature": Defaults.TEMPERATURE
                }
            },
            {
                "model_identifier": "dummy",
                "display_name": "Dummy LLM (for testing)",
                "client_type": "dummy",
                "parameters": {}
            }
        ],
        "default_model_identifier": Defaults.MODEL_ID
    }

    try:
        if not os.path.exists(DEFAULT_UI_SETTINGS_PATH):
            with open(DEFAULT_UI_SETTINGS_PATH, 'w', encoding='utf-8') as f:
                json.dump(default_ui_settings, f, indent=4)
            logger.info(f"Created default UI settings file at {DEFAULT_UI_SETTINGS_PATH}")
    except Exception as e:
        logger.error(f"Error creating default UI settings: {e}")

    try:
        if not os.path.exists(DEFAULT_LLM_CONFIG_PATH):
            with open(DEFAULT_LLM_CONFIG_PATH, 'w', encoding='utf-8') as f:
                json.dump(default_llm_config, f, indent=4)
            logger.info(f"Created default LLM config file at {DEFAULT_LLM_CONFIG_PATH}")
    except Exception as e:
        logger.error(f"Error creating default LLM config: {e}")

def load_llm_config(config_path: Path = DEFAULT_LLM_CONFIG_PATH) -> Dict[str, Any]:
    """DEPRECATED: Charge la configuration LLM depuis un fichier JSON.
    
    Cette fonction redirige vers ConfigurationService.get_llm_config().
    Utiliser directement ConfigurationService pour les nouveaux code.
    
    Args:
        config_path: Chemin vers le fichier de configuration LLM (ignoré, utilise ConfigurationService).
        
    Returns:
        Dict contenant la configuration LLM.
    """
    warnings.warn(
        "load_llm_config() is deprecated. "
        "Use services.configuration_service.ConfigurationService.get_llm_config() instead.",
        DeprecationWarning,
        stacklevel=2
    )
    
    # Rediriger vers ConfigurationService
    from services.configuration_service import ConfigurationService
    config_service = ConfigurationService()
    return config_service.get_llm_config()

"""Configuration Service for managing application settings."""
import json
import os
from pathlib import Path
from typing import Optional, Dict, Any, List, Union
import logging

logger = logging.getLogger(__name__)

# Define paths at the module level or pass them during instantiation
DIALOGUE_GENERATOR_DIR = Path(__file__).resolve().parent.parent
APP_CONFIG_FILE = DIALOGUE_GENERATOR_DIR / "app_config.json"
UI_SETTINGS_FILE_LEGACY = DIALOGUE_GENERATOR_DIR / "ui_settings.json"  # Legacy file for migration
LLM_CONFIG_FILE_PATH = DIALOGUE_GENERATOR_DIR / "config" / "llm_config.json"
CONTEXT_CONFIG_FILE_PATH = DIALOGUE_GENERATOR_DIR / "context_config.json"
SCENE_INSTRUCTION_TEMPLATES_FILE_PATH = DIALOGUE_GENERATOR_DIR / "config" / "scene_instruction_templates.json"
AUTHOR_PROFILE_TEMPLATES_FILE_PATH = DIALOGUE_GENERATOR_DIR / "config" / "author_profile_templates.json"
SYSTEM_PROMPTS_FILE_PATH = DIALOGUE_GENERATOR_DIR / "config" / "system_prompts.json"
PROMPTS_METADATA_FILE_PATH = DIALOGUE_GENERATOR_DIR / "config" / "prompts_metadata.json"
CONFIG_DIR = DIALOGUE_GENERATOR_DIR / "config"

# Chemin par défaut pour les dialogues Unity - toujours Assets/Dialogue depuis la racine du projet
DEFAULT_UNITY_DIALOGUES_PATH = DIALOGUE_GENERATOR_DIR / "Assets" / "Dialogue"

class ConfigurationService:
    def __init__(self):
        # Load app_config.json, with migration from ui_settings.json if needed
        self.app_config: Dict[str, Any] = self._load_app_config()
        self.llm_config: Dict[str, Any] = self._load_json_file(LLM_CONFIG_FILE_PATH, default={})
        self.context_config: Dict[str, Any] = self._load_json_file(CONTEXT_CONFIG_FILE_PATH, default={})
        self.scene_instruction_templates: Dict[str, Any] = self._load_json_file(SCENE_INSTRUCTION_TEMPLATES_FILE_PATH, default={"templates": []})
        self.author_profile_templates: Dict[str, Any] = self._load_json_file(AUTHOR_PROFILE_TEMPLATES_FILE_PATH, default={"templates": []})
        self.prompts_metadata: Dict[str, Any] = self._load_json_file(PROMPTS_METADATA_FILE_PATH, default={})

        # Initialiser les chemins importants lors de l'instanciation
        # Ou les récupérer dynamiquement via des getters
        self.unity_dialogues_path: Optional[Path] = self._initialize_unity_dialogues_path()

    def _load_json_file(self, file_path: Path, default: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Loads a JSON file.

        Args:
            file_path (Path): The path to the JSON file.
            default (Optional[Dict[str, Any]]): Default dictionary to return if file not found or invalid.

        Returns:
            Dict[str, Any]: The loaded data or default.
        """
        if default is None:
            default = {}
        if file_path.exists():
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except json.JSONDecodeError:
                logger.warning(f"Error decoding {file_path}. Returning default: {default}")
                return default
            except IOError as e:
                logger.error(f"Could not read {file_path}: {e}. Returning default: {default}")
                return default
        return default

    def _save_json_file(self, file_path: Path, data: Dict[str, Any]) -> bool:
        """Saves data to a JSON file.

        Args:
            file_path (Path): The path to the JSON file.
            data (Dict[str, Any]): The data to save.
        
        Returns:
            bool: True if successful, False otherwise.
        """
        try:
            file_path.parent.mkdir(parents=True, exist_ok=True) # Ensure directory exists
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            return True
        except IOError:
            logger.error(f"Could not write to {file_path}.")
            return False
        except Exception as e:
            logger.error(f"An unexpected error occurred while saving to {file_path}: {e}")
            return False

    def _load_app_config(self) -> Dict[str, Any]:
        """Loads app_config.json, with automatic migration from ui_settings.json if needed.
        
        Returns:
            Dict[str, Any]: The loaded app configuration.
        """
        # Try to load app_config.json first
        if APP_CONFIG_FILE.exists():
            return self._load_json_file(APP_CONFIG_FILE, default={})
        
        # If app_config.json doesn't exist, try to migrate from ui_settings.json
        if UI_SETTINGS_FILE_LEGACY.exists():
            logger.info(f"Migrating from legacy ui_settings.json to app_config.json")
            legacy_config = self._load_json_file(UI_SETTINGS_FILE_LEGACY, default={})
            
            # Extract only the unity_dialogues_path from legacy config
            migrated_config = {}
            if "unity_dialogues_path" in legacy_config:
                migrated_config["unity_dialogues_path"] = legacy_config["unity_dialogues_path"]
                logger.info(f"Migrated unity_dialogues_path: {migrated_config['unity_dialogues_path']}")
            
            # Save the migrated config
            if migrated_config:
                self._save_json_file(APP_CONFIG_FILE, migrated_config)
                logger.info(f"Created app_config.json with migrated settings")
            
            return migrated_config
        
        # No config files exist, return empty dict
        return {}

    def _get_app_config(self, key: str, default: Any = None) -> Any:
        """Gets a value from app_config (private method).
        
        Args:
            key: The configuration key.
            default: Default value if key not found.
            
        Returns:
            The configuration value or default.
        """
        return self.app_config.get(key, default)

    def _update_app_config(self, key: str, value: Any) -> None:
        """Updates a value in app_config (private method).
        
        Args:
            key: The configuration key.
            value: The value to set.
        """
        self.app_config[key] = value

    def _save_app_config(self) -> bool:
        """Saves app_config to file (private method).
        
        Returns:
            True if successful, False otherwise.
        """
        return self._save_json_file(APP_CONFIG_FILE, self.app_config)

    # --- LLM Config specific methods ---
    def get_llm_config(self) -> Dict[str, Any]:
        """Gets the LLM configuration."""
        return self.llm_config.copy()
    
    def get_llm_setting(self, key: str, default: Any = None) -> Any:
        """Gets a specific LLM setting."""
        return self.llm_config.get(key, default)

    def save_llm_config(self, config: Dict[str, Any]) -> bool: # Added if LLM config can be modified
        """Saves LLM configuration to the file."""
        self.llm_config = config.copy()
        return self._save_json_file(LLM_CONFIG_FILE_PATH, self.llm_config)

    def get_available_llm_models(self) -> List[Dict[str, Any]]:
        """Retrieves the list of available LLM models from the LLM config."""
        return self.llm_config.get("available_models", [])

    def get_llm_fallback_chain(self) -> List[str]:
        """Returns the ordered list of api_identifiers for LLM fallback (primary first).

        When absent or empty, no fallback is used. Backend-only; not exposed to frontend.
        """
        chain = self.llm_config.get("fallback_chain", [])
        if not isinstance(chain, list):
            return []
        return [str(x) for x in chain]

    # --- Context Config specific methods ---
    def get_context_config(self) -> Dict[str, Any]:
        """Gets the context configuration."""
        if self.context_config is None:
            logger.warning("context_config is None, returning empty dict")
            return {}
        if not isinstance(self.context_config, dict):
            logger.warning(f"context_config is not a dict: {type(self.context_config)}, returning empty dict")
            return {}
        return self.context_config.copy()

    def save_context_config(self, config: Dict[str, Any]) -> bool:
        """Saves context configuration to the file."""
        self.context_config = config.copy()
        return self._save_json_file(CONTEXT_CONFIG_FILE_PATH, self.context_config)

    # --- Prompt Templates specific methods ---
    def _load_text_file(self, file_path: Path) -> str:
        """Loads a text file.
        
        Args:
            file_path: The path to the text file.
            
        Returns:
            The content of the file as a string, or empty string if file not found.
        """
        if file_path.exists():
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return f.read().strip()
            except IOError as e:
                logger.error(f"Could not read {file_path}: {e}")
                return ""
        return ""
    
    def get_default_system_prompt(self) -> str:
        """Gets the default system prompt.
        
        Returns:
            The default system prompt string.
        """
        default_meta = self.prompts_metadata.get("system_prompts", {}).get("default", {})
        file_path = default_meta.get("file")
        if file_path:
            full_path = CONFIG_DIR / file_path
            return self._load_text_file(full_path)
        return ""
    
    def get_author_profile_templates(self) -> List[Dict[str, Any]]:
        """Gets the list of author profile templates.
        
        Returns:
            List of template dictionaries, each containing id, name, description, and profile.
        """
        templates = []
        author_profiles_meta = self.prompts_metadata.get("author_profiles", {})
        
        for profile_id, meta in author_profiles_meta.items():
            file_path = meta.get("file")
            if file_path:
                full_path = CONFIG_DIR / file_path
                profile_content = self._load_text_file(full_path)
                templates.append({
                    "id": profile_id,
                    "name": meta.get("name", profile_id),
                    "description": meta.get("description", ""),
                    "profile": profile_content
                })
        
        return templates
    
    def get_scene_instruction_templates(self) -> List[Dict[str, Any]]:
        """Gets the list of scene instruction templates.
        
        Returns:
            List of template dictionaries, each containing id, name, description, and instructions.
        """
        templates = []
        scene_instructions_meta = self.prompts_metadata.get("scene_instructions", {})
        
        for instruction_id, meta in scene_instructions_meta.items():
            file_path = meta.get("file")
            if file_path:
                full_path = CONFIG_DIR / file_path
                instructions_content = self._load_text_file(full_path)
                templates.append({
                    "id": instruction_id,
                    "name": meta.get("name", instruction_id),
                    "description": meta.get("description", ""),
                    "instructions": instructions_content
                })
        
        return templates

    # --- File Path Getters ---
    def get_llm_config_file_path(self) -> Path:
        return LLM_CONFIG_FILE_PATH

    def get_context_config_file_path(self) -> Path:
        return CONTEXT_CONFIG_FILE_PATH

    # --- Unity Dialogues Path specific methods (from config_manager.py) ---
    def _initialize_unity_dialogues_path(self) -> Optional[Path]:
        """Initializes and validates the Unity dialogues path.
        
        Always uses Assets/Dialogue from project root. No user configuration needed.
        """
        # Toujours utiliser le chemin par défaut : Assets/Dialogue depuis la racine du projet
        dialogues_path = DEFAULT_UNITY_DIALOGUES_PATH

        if self._validate_and_prepare_path(dialogues_path):
            logger.info(f"Unity dialogues path initialized: {dialogues_path}")
            return dialogues_path
        
        # Si le chemin est invalide, on retourne None
        logger.error(f"Unity dialogues path '{dialogues_path}' is invalid and could not be prepared.")
        return None

    def _validate_and_prepare_path(self, path_to_validate: Path) -> bool:
        """Validates a path: ensures it exists (creates if not), is a directory, and is R/W."""
        if path_to_validate is None:
            return False
        if not path_to_validate.exists():
            try:
                path_to_validate.mkdir(parents=True, exist_ok=True)
                logger.info(f"Created directory: {path_to_validate}")
            except Exception as e:
                logger.error(f"Could not create directory: {path_to_validate}. Error: {e}")
                return False
        
        if not path_to_validate.is_dir():
            logger.error(f"Path is not a directory: {path_to_validate}")
            return False
        
        if not os.access(path_to_validate, os.W_OK):
            logger.error(f"Path is not writable: {path_to_validate}")
            return False
        
        if not os.access(path_to_validate, os.R_OK):
            logger.error(f"Path is not readable: {path_to_validate}")
            return False
        return True

    def get_unity_dialogues_path(self) -> Optional[Path]:
        """Returns the currently configured and validated Unity dialogues path."""
        # Re-validate every time it's requested to ensure it's still valid?
        # Or trust the one initialized, and rely on set_unity_dialogues_path for changes.
        # For now, returning the initialized one. If it was None, means it failed init.
        if self.unity_dialogues_path and self._validate_and_prepare_path(self.unity_dialogues_path):
            return self.unity_dialogues_path
        
        # If current path is None or became invalid, try to re-initialize
        logger.warning("Current Unity dialogues path is invalid or not set. Attempting to re-initialize.")
        self.unity_dialogues_path = self._initialize_unity_dialogues_path()
        return self.unity_dialogues_path

    def get_unity_layouts_path(self) -> Optional[Path]:
        """Retourne le répertoire des layouts (Assets/Layouts), frère de Assets/Dialogue.
        
        Les layouts sont stockés à part des dialogues pour séparer clairement
        contenu (.json dans Dialogue) et positions (.layout.json dans Layouts).
        """
        dialogue_path = self.get_unity_dialogues_path()
        if not dialogue_path:
            return None
        layouts_path = Path(dialogue_path).parent / "Layouts"
        return layouts_path

    def set_unity_dialogues_path(self, new_path_str: Union[str, Path]) -> bool:
        """Sets and saves the new Unity dialogues path after validation.
        
        NOTE: This method is kept for API compatibility but the path is now
        always Assets/Dialogue from project root. User configuration is no longer allowed.
        """
        # Ignorer la configuration utilisateur, toujours utiliser le chemin par défaut
        logger.warning(f"set_unity_dialogues_path called with '{new_path_str}' but user configuration is disabled. Using default path.")
        return self._validate_and_prepare_path(DEFAULT_UNITY_DIALOGUES_PATH)

# Example usage (optional, for testing or demonstration)
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    config_service = ConfigurationService()
    
    print(f"App Config File: {APP_CONFIG_FILE}")
    print(f"LLM Config File: {LLM_CONFIG_FILE_PATH}")
    print(f"Context Config File: {CONTEXT_CONFIG_FILE_PATH}")

    print("\n--- Initial Configs ---")
    print(f"Initial LLM config: {config_service.get_llm_config()}")
    print(f"Initial Context config: {config_service.get_context_config()}")
    print(f"Initial Unity Dialogues Path: {config_service.get_unity_dialogues_path()}")

    print("\n--- Testing Unity Dialogues Path ---")
    # Test setting a new path (ensure the test_path directory can be created or exists)
    test_dialogue_path = DIALOGUE_GENERATOR_DIR / "test_dialogues_output"
    print(f"Attempting to set Unity dialogues path to: {test_dialogue_path}")
    if config_service.set_unity_dialogues_path(str(test_dialogue_path)):
        print(f"Successfully set Unity dialogues path to: {config_service.get_unity_dialogues_path()}")
    else:
        print(f"Failed to set Unity dialogues path to: {test_dialogue_path}")
    
    # Test with an invalid path to see if it falls back or reports error
    invalid_path = "/invalid_path_that_should_not_exist_or_be_creatable"
    print(f"Attempting to set Unity dialogues path to an invalid path: {invalid_path}")
    if not config_service.set_unity_dialogues_path(invalid_path):
        print(f"Correctly failed to set invalid path. Current path: {config_service.get_unity_dialogues_path()}")
    else:
        print(f"Incorrectly set invalid path: {config_service.get_unity_dialogues_path()}")

    current_path = config_service.get_unity_dialogues_path()
    if current_path:
        print(f"Final validated Unity Dialogues Path: {current_path}")
    else:
        print("Final Unity Dialogues Path is not available or invalid.")

    print("\n--- Testing LLM Config --- (Assuming llm_config.json might be empty or have defaults)")
    available_models = config_service.get_available_llm_models()
    if available_models:
        print(f"Available LLM Models: {available_models}")
    else:
        print("No LLM models found in configuration or llm_config.json is empty/missing.") 
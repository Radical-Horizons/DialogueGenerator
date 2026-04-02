"""Tests pour la chaîne de fallback LLM (ConfigurationService.get_llm_fallback_chain)."""
from unittest.mock import patch
import pytest

from services.configuration_service import ConfigurationService


class TestGetLlmFallbackChain:
    """Tests pour get_llm_fallback_chain(): absent/vide → pas de fallback; avec 2 modèles → ordre respecté."""

    def test_fallback_chain_absent_returns_empty_list(self) -> None:
        """fallback_chain absent dans llm_config → retourne liste vide (pas de fallback)."""
        base_config = {
            "api_key_env_var": "OPENAI_API_KEY",
            "default_model": "gpt-5.2",
            "available_models": [],
        }
        with patch.object(ConfigurationService, "_load_json_file", return_value=base_config):
            with patch.object(ConfigurationService, "_load_app_config", return_value={}):
                svc = ConfigurationService()
                assert svc.get_llm_fallback_chain() == []

    def test_fallback_chain_empty_list_returns_empty(self) -> None:
        """fallback_chain = [] → retourne liste vide."""
        base_config = {
            "api_key_env_var": "OPENAI_API_KEY",
            "fallback_chain": [],
            "available_models": [],
        }
        with patch.object(ConfigurationService, "_load_json_file", return_value=base_config):
            with patch.object(ConfigurationService, "_load_app_config", return_value={}):
                svc = ConfigurationService()
                assert svc.get_llm_fallback_chain() == []

    def test_fallback_chain_two_models_returns_ordered_list(self) -> None:
        """fallback_chain avec 2 api_identifier → ordre respecté."""
        base_config = {
            "api_key_env_var": "OPENAI_API_KEY",
            "fallback_chain": ["gpt-5.2", "labs-mistral-small-creative"],
            "available_models": [],
        }
        with patch.object(ConfigurationService, "_load_json_file", return_value=base_config):
            with patch.object(ConfigurationService, "_load_app_config", return_value={}):
                svc = ConfigurationService()
                result = svc.get_llm_fallback_chain()
                assert result == ["gpt-5.2", "labs-mistral-small-creative"]

    def test_fallback_chain_exposed_via_get_llm_config(self) -> None:
        """get_llm_config() contient fallback_chain quand présent dans le fichier."""
        base_config = {
            "api_key_env_var": "OPENAI_API_KEY",
            "fallback_chain": ["gpt-5.2", "labs-mistral-small-creative"],
            "available_models": [],
        }
        with patch.object(ConfigurationService, "_load_json_file", return_value=base_config):
            with patch.object(ConfigurationService, "_load_app_config", return_value={}):
                svc = ConfigurationService()
                llm_config = svc.get_llm_config()
                assert llm_config.get("fallback_chain") == ["gpt-5.2", "labs-mistral-small-creative"]

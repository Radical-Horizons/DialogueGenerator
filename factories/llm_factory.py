import os
import json
import time
import logging
from typing import Optional, Any, List

from core.llm.llm_client import ILLMClient, DummyLLMClient
from core.llm.openai.client import OpenAIClient
from core.llm.mistral_client import MistralClient
from core.llm.openrouter_client import OpenRouterClient
from core.llm.fallback_client import FallbackLLMClient
from constants import ModelNames

logger = logging.getLogger(__name__)

# Valeur utilisée en CI (`.github/workflows/ci.yml`, `docs/deployment/CI.md`) pour satisfaire
# les checks « clé présente » sans appeler l'API OpenAI.
_KNOWN_PLACEHOLDER_API_KEYS: frozenset[str] = frozenset({"sk-dummy"})


def _is_placeholder_llm_api_key(api_key: Optional[str]) -> bool:
    """Indique si la clé doit être ignorée (vide ou jeton factice CI / dev).

    Args:
        api_key: Valeur lue depuis la variable d'environnement configurée.

    Returns:
        True si aucun appel réel au fournisseur ne doit être fait avec cette valeur.
    """
    if api_key is None:
        return True
    stripped = str(api_key).strip()
    if not stripped:
        return True
    return stripped.lower() in _KNOWN_PLACEHOLDER_API_KEYS


class LLMClientFactory:
    @staticmethod
    def create_client(
        model_id: str,
        config: dict,
        available_models: list[dict],
        usage_service: Optional[Any] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None
    ) -> ILLMClient:
        """
        Crée un client LLM basé sur model_id et la configuration.

        Args:
            model_id: L'identifiant du modèle à utiliser (ex: "gpt-4o", "dummy").
            config: La configuration globale des LLM (issue de llm_config.json).
                    Utilisé pour trouver les détails spécifiques du modèle comme 
                    la variable d'env pour la clé API.
            available_models: La liste des modèles disponibles avec leurs configurations.

        Returns:
            Une instance de ILLMClient (OpenAIClient ou DummyLLMClient).
            Retourne DummyLLMClient si le modèle n'est pas trouvé,
            si la clé API est manquante pour OpenAI, ou en cas d'erreur.
        """
        if model_id == "dummy":
            return DummyLLMClient()

        # Mapper les anciens identifiants vers la famille GPT-5.6
        normalized_id = ModelNames.normalize_model_id(model_id)
        if normalized_id != model_id:
            logger.warning(
                f"Modèle '{model_id}' est déprécié. Utilisation de '{normalized_id}' à la place."
            )
            model_id = normalized_id

        # Chercher le modèle par api_identifier (champ dans llm_config.json) ou model_identifier (compatibilité)
        model_config = next(
            (m for m in available_models 
             if m.get("api_identifier") == model_id or m.get("model_identifier") == model_id), 
            None
        )

        if not model_config:
            logger.warning(f"Configuration non trouvée pour model_id '{model_id}'. Utilisation de DummyLLMClient.")
            return DummyLLMClient()

        client_type = model_config.get("client_type", "openai")  # Par défaut openai
        # La clé API est dans la config globale, pas dans chaque modèle
        api_key_env_var = config.get("api_key_env_var")

        if client_type == "openai":
            if not api_key_env_var:
                logger.warning(f"Variable d'environnement pour la clé API non spécifiée pour le modèle OpenAI '{model_id}'. Utilisation de DummyLLMClient.")
                return DummyLLMClient()
            
            api_key = os.getenv(api_key_env_var)
            if _is_placeholder_llm_api_key(api_key):
                logger.warning(
                    "Clé API absente ou factice (variable: %s) pour le modèle OpenAI '%s'. "
                    "Utilisation de DummyLLMClient.",
                    api_key_env_var,
                    model_id,
                )
                return DummyLLMClient()
            
            try:
                # La config passée à OpenAIClient doit contenir default_model avec l'identifiant du modèle
                # On construit une config compatible avec OpenAIClient qui attend "default_model"
                model_identifier = model_config.get("api_identifier") or model_config.get("model_identifier") or model_id
                client_config = config.copy()  # Commencer avec la config globale
                client_config["default_model"] = model_identifier  # Définir le modèle spécifique
                # Ajouter les paramètres du modèle s'ils existent
                if "parameters" in model_config:
                    if "default_temperature" in model_config["parameters"]:
                        client_config["temperature"] = model_config["parameters"]["default_temperature"]
                    if "max_tokens" in model_config["parameters"]:
                        client_config["max_tokens"] = model_config["parameters"]["max_tokens"]
                logger.info(f"Création d'un OpenAIClient pour model_id: {model_id} (default_model: {model_identifier})")
                return OpenAIClient(
                    api_key=api_key,
                    config=client_config,
                    usage_service=usage_service,
                    request_id=request_id,
                    endpoint=endpoint
                )
            except Exception as e:
                logger.error(f"Erreur lors de la création de OpenAIClient pour '{model_id}': {e}. Utilisation de DummyLLMClient.")
                return DummyLLMClient()
        
        elif client_type == "mistral":
            # Support Mistral AI via MistralClient
            mistral_api_key_env_var = config.get("mistral_api_key_env_var")
            if not mistral_api_key_env_var:
                logger.warning(f"Variable d'environnement pour la clé API Mistral non spécifiée pour le modèle '{model_id}'. Utilisation de DummyLLMClient.")
                return DummyLLMClient()
            
            api_key = os.getenv(mistral_api_key_env_var)
            if _is_placeholder_llm_api_key(api_key):
                logger.warning(
                    "Clé API Mistral absente ou factice (variable: %s) pour le modèle '%s'. "
                    "Utilisation de DummyLLMClient.",
                    mistral_api_key_env_var,
                    model_id,
                )
                return DummyLLMClient()
            
            try:
                # La config passée à MistralClient doit contenir default_model avec l'identifiant du modèle
                model_identifier = model_config.get("api_identifier") or model_config.get("model_identifier") or model_id
                client_config = config.copy()  # Commencer avec la config globale
                client_config["default_model"] = model_identifier  # Définir le modèle spécifique
                # Ajouter les paramètres du modèle s'ils existent
                if "parameters" in model_config:
                    if "default_temperature" in model_config["parameters"]:
                        client_config["temperature"] = model_config["parameters"]["default_temperature"]
                    if "max_tokens" in model_config["parameters"]:
                        client_config["max_tokens"] = model_config["parameters"]["max_tokens"]
                logger.info(f"Création d'un MistralClient pour model_id: {model_id} (default_model: {model_identifier})")
                return MistralClient(
                    api_key=api_key,
                    config=client_config,
                    usage_service=usage_service,
                    request_id=request_id,
                    endpoint=endpoint
                )
            except Exception as e:
                logger.error(f"Erreur lors de la création de MistralClient pour '{model_id}': {e}. Utilisation de DummyLLMClient.")
                return DummyLLMClient()

        elif client_type == "openrouter":
            openrouter_env = config.get("openrouter_api_key_env_var") or "OPENROUTER_API_KEY"
            api_key = os.getenv(openrouter_env)
            if _is_placeholder_llm_api_key(api_key):
                raise ValueError(
                    f"OPENROUTER_API_KEY manquante (variable: {openrouter_env}). "
                    "Impossible d'utiliser un modèle OpenRouter."
                )
            model_identifier = (
                model_config.get("api_identifier")
                or model_config.get("model_identifier")
                or model_id
            )
            client_config = config.copy()
            client_config["default_model"] = model_identifier
            params = model_config.get("parameters")
            if isinstance(params, dict):
                if "default_temperature" in params:
                    client_config["temperature"] = params["default_temperature"]
                if "max_tokens" in params:
                    client_config["max_tokens"] = params["max_tokens"]
            logger.info(
                "Création d'un OpenRouterClient pour model_id: %s (default_model: %s)",
                model_id,
                model_identifier,
            )
            return OpenRouterClient(
                api_key=api_key,
                config=client_config,
                usage_service=usage_service,
                request_id=request_id,
                endpoint=endpoint,
            )

        logger.warning(f"Type de client LLM inconnu ou non supporté: '{client_type}' pour model_id '{model_id}'. Utilisation de DummyLLMClient.")
        return DummyLLMClient()

    @staticmethod
    def create_client_with_fallback(
        primary_model_id: str,
        fallback_model_ids: List[str],
        config: dict,
        available_models: list,
        usage_service: Optional[Any] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None,
    ) -> ILLMClient:
        """Crée un client avec chaîne de fallback (primary + fallbacks).

        Si fallback_model_ids est vide, retourne un client simple pour primary_model_id.
        Sinon retourne un FallbackLLMClient qui essaie primary puis chaque fallback.
        """
        chain = [primary_model_id] + [m for m in fallback_model_ids if m != primary_model_id]
        if len(chain) < 2:
            return LLMClientFactory.create_client(
                model_id=primary_model_id,
                config=config,
                available_models=available_models,
                usage_service=usage_service,
                request_id=request_id,
                endpoint=endpoint,
            )
        return FallbackLLMClient(
            model_ids=chain,
            create_client_fn=LLMClientFactory.create_client,
            create_client_kwargs={
                "config": config,
                "available_models": available_models,
                "endpoint": endpoint,
            },
            usage_service=usage_service,
            request_id=request_id,
        ) 
# DialogueGenerator/core/llm/mistral_client.py
import asyncio
import json
import logging
import os
import time
from typing import List, Optional, Type, Dict, Any, Callable, Coroutine
from pydantic import BaseModel, ValidationError
from mistralai import Mistral
from mistralai.models import SDKError, ChatCompletionResponse

from core.llm.llm_client import ILLMClient

logger = logging.getLogger(__name__)


class MistralClient(ILLMClient):
    """Client LLM pour Mistral AI implémentant l'interface ILLMClient."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        usage_service: Optional[Any] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        reasoning_callback: Optional[Callable[[Dict[str, Any]], Coroutine[Any, Any, None]]] = None
    ):
        """
        Initialise le client Mistral.

        Args:
            api_key: Clé API Mistral (ou depuis MISTRAL_API_KEY env var).
            config: Configuration du modèle (default_model, temperature, max_tokens, etc.).
            usage_service: Service de tracking d'utilisation (optionnel).
            request_id: ID de requête pour le tracking (optionnel).
            endpoint: Endpoint pour le tracking (optionnel).
            reasoning_callback: Callback pour streaming du reasoning trace (optionnel).

        Raises:
            ValueError: Si la clé API n'est pas fournie ou trouvée.
        """
        if api_key is None:
            api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("Clé API Mistral non fournie ou non trouvée dans les variables d'environnement.")

        self.client = Mistral(api_key=api_key)

        self.llm_config = config if config is not None else {}
        self.model_name = self.llm_config.get("default_model", "labs-mistral-small-creative")
        self.temperature = self.llm_config.get("temperature", 0.7)
        self.max_tokens = self.llm_config.get("max_tokens", 32000)

        self.system_prompt_template = self.llm_config.get(
            "system_prompt_template",
            "Tu es un assistant expert en écriture de dialogues pour jeux de rôle (RPG)."
        )

        # Service de tracking (optionnel)
        self.usage_service = usage_service
        self.request_id = request_id or "unknown"
        self.endpoint = endpoint or "unknown"

        # Callback pour streaming du reasoning trace (optionnel, pour cohérence avec OpenAI)
        self.reasoning_callback = reasoning_callback
        self.reasoning_trace: Optional[Dict[str, Any]] = None

        logger.info(f"MistralClient initialisé avec le modèle: {self.model_name}, API Key présente: {'Oui' if api_key else 'Non'}.")
        logger.info(f"System prompt template utilisé: '{self.system_prompt_template}'")

    async def generate_variants(
        self,
        prompt: str,
        k: int = 1,
        response_model: Optional[Type[BaseModel]] = None,
        previous_dialogue_context: Optional[List[Dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
        stream: bool = False
    ) -> List[Any]:
        """
        Génère k variantes de texte à partir du prompt donné.

        Args:
            prompt: Le prompt à envoyer au LLM.
            k: Le nombre de variantes à générer.
            response_model: Le modèle Pydantic attendu pour la sortie structurée.
            previous_dialogue_context: Contexte de dialogue précédent.
            user_system_prompt_override: Pour surcharger le system prompt.
            stream: Si True, utilise le streaming (compatible Story 0.2).

        Returns:
            Liste de k éléments, chaque élément étant une variante ou une instance de response_model.
        """
        generated_results = []

        system_message_content = user_system_prompt_override if user_system_prompt_override else self.system_prompt_template
        if response_model:
            system_message_content += " Tu DOIS utiliser la fonction 'generate_interaction' pour formater ta réponse."

        messages = [{"role": "system", "content": system_message_content}]
        if previous_dialogue_context:
            messages.extend(previous_dialogue_context)
        messages.append({"role": "user", "content": prompt})

        logger.debug(f"Messages envoyés au LLM (avant tool): {messages}")

        tool_definition = None
        if response_model:
            model_schema_for_tool = response_model.model_json_schema()

            function_parameters = {
                "type": "object",
                "properties": model_schema_for_tool.get("properties", {}),
                "required": model_schema_for_tool.get("required", []),
            }
            if "$defs" in model_schema_for_tool:
                function_parameters["$defs"] = model_schema_for_tool["$defs"]

            tool_definition = {
                "type": "function",
                "function": {
                    "name": "generate_interaction",
                    "description": "Génère une interaction de dialogue structurée.",
                    "parameters": function_parameters,
                },
            }
            logger.info(f"Utilisation du structured output avec le modèle: {response_model.__name__}")
            logger.debug(f"Schéma de la fonction 'generate_interaction' envoyé à Mistral: \n{model_schema_for_tool}")

        for i in range(k):
            start_time = time.time()
            success = False
            error_message = None
            prompt_tokens = 0
            completion_tokens = 0
            total_tokens = 0

            try:
                logger.info(f"Début de la génération de la variante {i+1}/{k} pour le prompt.")

                # Paramètres pour Mistral Chat Completions
                chat_params: Dict[str, Any] = {
                    "model": self.model_name,
                    "messages": messages,
                    "temperature": self.temperature,
                    "max_tokens": self.max_tokens,
                }

                # Structured output: tools et tool_choice
                if tool_definition:
                    chat_params["tools"] = [tool_definition]
                    chat_params["tool_choice"] = "any"  # Force l'utilisation du tool

                # Streaming
                if stream:
                    accumulated_content = ""
                    response_stream = await self.client.chat.stream_async(**chat_params)
                    
                    async for chunk in response_stream:
                        if chunk.choices and chunk.choices[0].delta:
                            delta_content = getattr(chunk.choices[0].delta, "content", None)
                            if delta_content:
                                accumulated_content += delta_content
                    
                    generated_results.append(accumulated_content)
                    logger.info(f"Variante {i+1} générée avec succès (streaming).")
                    success = True
                else:
                    # Appel API sans streaming
                    response: ChatCompletionResponse = await self.client.chat.complete_async(**chat_params)

                    # Extraire les métriques d'utilisation
                    if hasattr(response, 'usage') and response.usage:
                        prompt_tokens = getattr(response.usage, "prompt_tokens", 0) or 0
                        completion_tokens = getattr(response.usage, "completion_tokens", 0) or 0
                        total_tokens = getattr(response.usage, "total_tokens", 0) or 0

                    logger.debug(f"Réponse brute de l'API Mistral pour la variante {i+1}:\n{response}")

                    # Parsing de la réponse
                    if response_model and response.choices and response.choices[0].message.tool_calls:
                        tool_call = response.choices[0].message.tool_calls[0]
                        if tool_call.function.name == "generate_interaction":
                            function_args_raw = tool_call.function.arguments
                            logger.debug(f"Arguments bruts de la fonction reçus: {function_args_raw}")
                            try:
                                parsed_output = response_model.model_validate_json(function_args_raw)
                                generated_results.append(parsed_output)
                                logger.info(f"Variante {i+1} générée et validée avec succès (structured).")
                                success = True
                            except ValidationError as e:
                                # Normalisation défensive (structured output reste la norme, mais certains modèles
                                # renvoient des variations minimes malgré un tool schema strict).
                                normalized_ok = False
                                try:
                                    if isinstance(function_args_raw, str):
                                        raw_obj = json.loads(function_args_raw)
                                        # Cas observé (run1): node.consequences renvoyé comme liste d'objets
                                        # alors que le schéma attend un objet unique.
                                        if getattr(response_model, "__name__", "") == "UnityDialogueGenerationResponse":
                                            node = raw_obj.get("node")
                                            if isinstance(node, dict):
                                                cons = node.get("consequences")
                                                if isinstance(cons, list) and len(cons) == 1 and isinstance(cons[0], dict):
                                                    node["consequences"] = cons[0]
                                                    parsed_output = response_model.model_validate(raw_obj)
                                                    generated_results.append(parsed_output)
                                                    logger.info(
                                                        f"Variante {i+1} validée après normalisation (node.consequences list->object)."
                                                    )
                                                    success = True
                                                    normalized_ok = True
                                except Exception:
                                    normalized_ok = False

                                if normalized_ok:
                                    continue

                                logger.error(f"Erreur de validation Pydantic pour la variante {i+1}: {e}")
                                logger.error(f"Données JSON qui ont échoué à la validation: {function_args_raw}")
                                generated_results.append(f"Erreur de validation: {e} - Données: {function_args_raw}")
                                error_message = f"Validation error: {e}"
                        else:
                            logger.warning(f"Outil inattendu appelé: {tool_call.function.name}")
                            generated_results.append(f"Erreur: Outil inattendu {tool_call.function.name}")
                            error_message = f"Unexpected tool: {tool_call.function.name}"

                    elif response_model and response.choices and response.choices[0].message.content:
                        # Cas critique: response_model requis mais le modèle a retourné du texte
                        text_output = response.choices[0].message.content.strip()
                        error_msg = (
                            f"Le modèle {self.model_name} n'a pas retourné de structured output (tool_calls) alors qu'un response_model était requis. "
                            f"Le modèle a retourné du texte à la place. "
                            f"Réponse reçue (premiers 500 caractères): {text_output[:500]}"
                        )
                        logger.error(error_msg)
                        generated_results.append(f"Erreur: {error_msg}")
                        error_message = f"Structured output not supported: model returned text instead of tool_calls"
                        success = False

                    elif response.choices and response.choices[0].message.content:
                        # Texte simple
                        text_output = response.choices[0].message.content.strip()
                        generated_results.append(text_output)
                        logger.info(f"Variante {i+1} générée avec succès (texte simple).")
                        success = True
                    else:
                        logger.warning(f"Aucun contenu ou appel de fonction dans la réponse pour la variante {i+1}.")
                        error_msg = f"Réponse vide ou inattendue pour la variante {i+1}"
                        if response_model:
                            error_msg += f". Structured output (response_model) était requis mais non reçu du modèle {self.model_name}."
                        generated_results.append(f"Erreur: {error_msg}")
                        error_message = error_msg
                        success = False

            except SDKError as e:
                logger.error(f"Erreur API Mistral lors de la génération de la variante {i+1}: {e}")
                generated_results.append(f"Mistral API unavailable: {e}")
                error_message = str(e)
            except Exception as e:
                logger.error(f"Erreur inattendue lors de la génération de la variante {i+1}: {e}", exc_info=True)
                generated_results.append(f"Erreur: {e}")
                error_message = str(e)
            finally:
                # Calculer la durée
                duration_ms = int((time.time() - start_time) * 1000)

                # Enregistrer l'utilisation si le service est disponible
                if self.usage_service:
                    try:
                        self.usage_service.track_usage(
                            request_id=self.request_id,
                            model_name=self.model_name,
                            prompt_tokens=prompt_tokens,
                            completion_tokens=completion_tokens,
                            total_tokens=total_tokens,
                            duration_ms=duration_ms,
                            success=success,
                            endpoint=self.endpoint,
                            k_variants=k,
                            error_message=error_message
                        )
                    except Exception as tracking_error:
                        # Ne pas faire échouer l'appel LLM si le tracking échoue
                        logger.error(f"Erreur lors du tracking de l'usage LLM: {tracking_error}", exc_info=True)

        return generated_results

    def get_max_tokens(self) -> int:
        """
        Retourne le nombre maximum de tokens que le modèle peut gérer.

        Returns:
            int: Nombre maximum de tokens (32000 pour Mistral Small Creative).
        """
        model_lower = self.model_name.lower()
        if "mistral-small" in model_lower or "mistral-medium" in model_lower:
            return 32000  # Mistral Small/Medium supportent 32k tokens
        elif "mistral-large" in model_lower:
            return 128000  # Mistral Large supporte 128k tokens
        else:
            logger.warning(f"Modèle Mistral inconnu ou non listé pour get_max_tokens: {self.model_name}. Retourne 32000 par défaut.")
            return 32000

    async def close(self):
        """Ferme le client Mistral proprement."""
        if hasattr(self.client, 'close'):
            if asyncio.iscoroutinefunction(self.client.close):
                await self.client.close()
            else:
                self.client.close()
        logger.info("MistralClient fermé.")

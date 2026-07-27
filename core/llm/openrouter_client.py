"""Client LLM OpenRouter (Chat Completions OpenAI-compatible)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Callable, Coroutine, Dict, List, Optional, Type

from openai import APIError, AsyncOpenAI
from pydantic import BaseModel, ValidationError

from core.llm.llm_client import ILLMClient

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterClient(ILLMClient):
    """Client OpenRouter via SDK OpenAI (Chat Completions + tools)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        usage_service: Optional[Any] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        reasoning_callback: Optional[Callable[[Dict[str, Any]], Coroutine[Any, Any, None]]] = None,
    ) -> None:
        """Initialise le client OpenRouter.

        Args:
            api_key: Clé API OpenRouter (sinon ``OPENROUTER_API_KEY``).
            config: Config modèle (default_model, temperature, max_tokens, …).
            usage_service: Service de tracking d'utilisation.
            request_id: ID de requête pour le tracking.
            endpoint: Endpoint pour le tracking.
            reasoning_callback: Callback reasoning (compat OpenAI ; non utilisé ici).

        Raises:
            ValueError: Si la clé API est absente.
        """
        if api_key is None:
            api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key or not str(api_key).strip():
            raise ValueError(
                "OPENROUTER_API_KEY manquante. Impossible d'utiliser un modèle OpenRouter."
            )

        default_headers: Dict[str, str] = {}
        referer = os.getenv("OPENROUTER_HTTP_REFERER")
        app_title = os.getenv("OPENROUTER_APP_TITLE")
        if referer:
            default_headers["HTTP-Referer"] = referer
        if app_title:
            default_headers["X-Title"] = app_title

        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=OPENROUTER_BASE_URL,
            default_headers=default_headers or None,
        )

        self.llm_config = config if config is not None else {}
        self.model_name = self.llm_config.get("default_model", "aion-labs/aion-2.0")
        self.temperature = self.llm_config.get("temperature", 0.7)
        self.max_tokens = self.llm_config.get("max_tokens", 32000)
        self.system_prompt_template = self.llm_config.get(
            "system_prompt_template",
            "Tu es un assistant expert en écriture de dialogues pour jeux de rôle (RPG).",
        )

        self.usage_service = usage_service
        self.request_id = request_id or "unknown"
        self.endpoint = endpoint or "unknown"
        self.reasoning_callback = reasoning_callback
        self.reasoning_trace: Optional[Dict[str, Any]] = None

        self.last_call_cost: float = 0.0
        self.last_usage_prompt_tokens: int = 0
        self.last_usage_completion_tokens: int = 0

        logger.info(
            "OpenRouterClient initialisé modèle=%s, API key présente=Oui",
            self.model_name,
        )

    async def generate_variants(
        self,
        prompt: str,
        k: int = 1,
        response_model: Optional[Type[BaseModel]] = None,
        previous_dialogue_context: Optional[List[Dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
        stream: bool = False,
    ) -> List[Any]:
        """Génère k variantes via Chat Completions OpenRouter.

        Args:
            prompt: Prompt utilisateur.
            k: Nombre de variantes.
            response_model: Schéma Pydantic pour structured output (tools).
            previous_dialogue_context: Messages de contexte optionnels.
            user_system_prompt_override: Override du system prompt.
            stream: Active le streaming (texte seulement).

        Returns:
            Liste de variantes (modèles Pydantic, str, ou messages d'erreur).
        """
        generated_results: List[Any] = []

        system_message_content = (
            user_system_prompt_override
            if user_system_prompt_override
            else self.system_prompt_template
        )
        if response_model:
            system_message_content += (
                " Tu DOIS utiliser la fonction 'generate_interaction' pour formater ta réponse."
            )

        messages: List[Dict[str, Any]] = [{"role": "system", "content": system_message_content}]
        if previous_dialogue_context:
            messages.extend(previous_dialogue_context)
        messages.append({"role": "user", "content": prompt})

        full_prompt_str = json.dumps(messages, ensure_ascii=False)

        tool_definition: Optional[Dict[str, Any]] = None
        if response_model:
            model_schema_for_tool = response_model.model_json_schema()
            function_parameters: Dict[str, Any] = {
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

        for i in range(k):
            start_time = time.time()
            success = False
            error_message: Optional[str] = None
            prompt_tokens = 0
            completion_tokens = 0
            total_tokens = 0
            raw_response_str: Optional[str] = None

            try:
                chat_params: Dict[str, Any] = {
                    "model": self.model_name,
                    "messages": messages,
                    "temperature": self.temperature,
                    "max_tokens": self.max_tokens,
                }
                if tool_definition:
                    chat_params["tools"] = [tool_definition]
                    chat_params["tool_choice"] = {
                        "type": "function",
                        "function": {"name": "generate_interaction"},
                    }

                if stream:
                    accumulated_content = ""
                    response_stream = await self.client.chat.completions.create(
                        **chat_params,
                        stream=True,
                    )
                    async for chunk in response_stream:
                        if chunk.choices and chunk.choices[0].delta:
                            delta_content = chunk.choices[0].delta.content
                            if delta_content:
                                accumulated_content += delta_content
                    generated_results.append(accumulated_content)
                    success = True
                    prompt_tokens = max(1, len(full_prompt_str) // 4)
                    completion_tokens = max(1, len(accumulated_content) // 4)
                    total_tokens = prompt_tokens + completion_tokens
                    raw_response_str = accumulated_content[:12000] if accumulated_content else None
                    self._update_last_usage(prompt_tokens, completion_tokens)
                else:
                    response = await self.client.chat.completions.create(**chat_params)
                    raw_response_str = response.model_dump_json()

                    if response.usage:
                        prompt_tokens = int(getattr(response.usage, "prompt_tokens", 0) or 0)
                        completion_tokens = int(
                            getattr(response.usage, "completion_tokens", 0) or 0
                        )
                        total_tokens = int(getattr(response.usage, "total_tokens", 0) or 0)
                    self._update_last_usage(prompt_tokens, completion_tokens)

                    choice = response.choices[0] if response.choices else None
                    message = choice.message if choice else None

                    if response_model and message and message.tool_calls:
                        tool_call = message.tool_calls[0]
                        fn_name = getattr(tool_call.function, "name", "")
                        if fn_name == "generate_interaction":
                            function_args_raw = tool_call.function.arguments
                            try:
                                parsed_output = response_model.model_validate_json(
                                    function_args_raw
                                )
                                generated_results.append(parsed_output)
                                success = True
                            except ValidationError as exc:
                                normalized = self._try_normalize_unity_consequences(
                                    response_model, function_args_raw
                                )
                                if normalized is not None:
                                    generated_results.append(normalized)
                                    success = True
                                else:
                                    logger.error(
                                        "Validation OpenRouter variante %s: %s", i + 1, exc
                                    )
                                    generated_results.append(
                                        f"Erreur de validation: {exc} - Données: {function_args_raw}"
                                    )
                                    error_message = f"Validation error: {exc}"
                        else:
                            generated_results.append(f"Erreur: Outil inattendu {fn_name}")
                            error_message = f"Unexpected tool: {fn_name}"
                    elif response_model and message and message.content:
                        text_output = message.content.strip()
                        error_msg = (
                            f"Le modèle {self.model_name} n'a pas retourné de structured output "
                            f"(tool_calls). Réponse (500 car.): {text_output[:500]}"
                        )
                        logger.error(error_msg)
                        generated_results.append(f"Erreur: {error_msg}")
                        error_message = "Structured output not supported"
                        success = False
                    elif message and message.content:
                        generated_results.append(message.content.strip())
                        success = True
                    else:
                        error_msg = f"Réponse vide ou inattendue pour la variante {i + 1}"
                        generated_results.append(f"Erreur: {error_msg}")
                        error_message = error_msg
                        success = False

            except APIError as exc:
                logger.error("Erreur API OpenRouter variante %s: %s", i + 1, exc)
                generated_results.append(f"OpenRouter API unavailable: {exc}")
                error_message = str(exc)
            except Exception as exc:
                logger.error(
                    "Erreur inattendue OpenRouter variante %s: %s",
                    i + 1,
                    exc,
                    exc_info=True,
                )
                generated_results.append(f"Erreur: {exc}")
                error_message = str(exc)
            finally:
                duration_ms = int((time.time() - start_time) * 1000)
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
                            error_message=error_message,
                            prompt=full_prompt_str,
                            response=raw_response_str,
                        )
                    except Exception as tracking_error:
                        logger.error(
                            "Erreur tracking usage OpenRouter: %s",
                            tracking_error,
                            exc_info=True,
                        )

        return generated_results

    def _update_last_usage(self, prompt_tokens: int, completion_tokens: int) -> None:
        """Met à jour last_* tokens/cost depuis le pricing service."""
        pricing = getattr(self.usage_service, "pricing_service", None)
        if pricing is not None:
            try:
                self.last_call_cost = float(
                    pricing.calculate_cost(
                        model_name=self.model_name,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                    )
                )
            except (TypeError, ValueError):
                self.last_call_cost = 0.0
        else:
            self.last_call_cost = 0.0
        self.last_usage_prompt_tokens = int(prompt_tokens)
        self.last_usage_completion_tokens = int(completion_tokens)

    @staticmethod
    def _try_normalize_unity_consequences(
        response_model: Type[BaseModel],
        function_args_raw: Any,
    ) -> Optional[BaseModel]:
        """Normalise ``node.consequences`` list→object si besoin."""
        try:
            if not isinstance(function_args_raw, str):
                return None
            if getattr(response_model, "__name__", "") != "UnityDialogueGenerationResponse":
                return None
            raw_obj = json.loads(function_args_raw)
            node = raw_obj.get("node")
            if not isinstance(node, dict):
                return None
            cons = node.get("consequences")
            if isinstance(cons, list) and len(cons) == 1 and isinstance(cons[0], dict):
                node["consequences"] = cons[0]
                return response_model.model_validate(raw_obj)
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError):
            return None
        return None

    def get_max_tokens(self) -> int:
        """Retourne le plafond tokens du modèle depuis la config client."""
        return int(self.max_tokens or 32000)

    async def close(self) -> None:
        """Ferme le client HTTP OpenAI Async."""
        close_fn = getattr(self.client, "close", None)
        if close_fn is None:
            return
        if asyncio.iscoroutinefunction(close_fn):
            await close_fn()
        else:
            close_fn()
        logger.info("OpenRouterClient fermé.")

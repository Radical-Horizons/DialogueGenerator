"""Client OpenAI refactorisé utilisant Responses API uniquement."""

import json
import logging
import os
import time
from typing import List, Optional, Type, Union, Dict, Any, Callable, Coroutine, AsyncIterator
from pydantic import BaseModel
from openai import AsyncOpenAI, APIError

from core.llm.llm_client import ILLMClient
from core.llm.openai.parameter_builder import OpenAIParameterBuilder
from core.llm.openai.response_parser import OpenAIResponseParser
from core.llm.openai.reasoning_extractor import OpenAIReasoningExtractor
from core.llm.openai.usage_tracker import OpenAIUsageTracker
from core.llm.openai.stream_parser import OpenAIStreamParser, StreamChunk, StreamEventType

logger = logging.getLogger(__name__)


class OpenAIClient(ILLMClient):
    """Client OpenAI utilisant Responses API uniquement (Chat Completions dépréciée pour GPT-5).
    
    Cette classe orchestre les appels à l'API OpenAI en utilisant des classes dédiées
    pour la construction des paramètres, le parsing des réponses, l'extraction du reasoning,
    et le tracking des métriques.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        usage_service: Optional[Any] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        reasoning_callback: Optional[Callable[[Dict[str, Any]], Coroutine[Any, Any, None]]] = None,
    ):
        """Initialise le client OpenAI.
        
        Args:
            api_key: Clé API OpenAI (ou depuis OPENAI_API_KEY env var).
            config: Configuration du modèle (default_model, temperature, max_tokens, etc.).
            usage_service: Service de tracking d'utilisation (optionnel).
            request_id: ID de requête pour le tracking (optionnel).
            endpoint: Endpoint pour le tracking (optionnel).
            reasoning_callback: Callback pour streaming du reasoning trace (optionnel).
        """
        if api_key is None:
            api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "Clé API OpenAI non fournie ou non trouvée dans les variables d'environnement."
            )
        
        self.client = AsyncOpenAI(api_key=api_key)
        
        self.llm_config = config if config is not None else {}
        self.model_name = self.llm_config.get("default_model", "gpt-5.2")
        self.temperature = self.llm_config.get("temperature", 0.7)
        # Recommandation OpenAI: 25000 tokens minimum pour reasoning summary
        # Utiliser 32000 par défaut pour avoir une marge de sécurité
        self.max_tokens = self.llm_config.get("max_tokens", 32000)
        self.reasoning_effort = self.llm_config.get("reasoning_effort", None)
        self.reasoning_summary = self.llm_config.get("reasoning_summary", None)
        self.top_p = self.llm_config.get("top_p", None)
        
        self.system_prompt_template = self.llm_config.get(
            "system_prompt_template",
            "Tu es un assistant expert en écriture de dialogues pour jeux de rôle (RPG)."
        )
        
        # Service de tracking (optionnel)
        self.usage_service = usage_service
        self.request_id = request_id or "unknown"
        self.endpoint = endpoint or "unknown"
        
        # Callback pour streaming du reasoning trace (optionnel)
        self.reasoning_callback = reasoning_callback
        self.reasoning_trace: Optional[Dict[str, Any]] = None
        self.last_call_cost: float = 0.0
        self.last_usage_prompt_tokens: int = 0
        self.last_usage_completion_tokens: int = 0
        
        # Initialiser retry et circuit breaker (optionnel)
        self._retry_with_backoff = None
        self._circuit_breaker = None
        try:
            from api.utils.retry import retry_with_backoff
            from api.utils.circuit_breaker import get_llm_circuit_breaker
            self._retry_with_backoff = retry_with_backoff
            self._circuit_breaker = get_llm_circuit_breaker()
            if self._circuit_breaker:
                logger.info("Circuit breaker LLM activé")
            if self._retry_with_backoff:
                logger.info("Retry avec exponential backoff activé pour les appels LLM")
        except (ImportError, AttributeError):
            logger.debug("Modules retry/circuit_breaker non disponibles. Continuation sans protection.")
        
        logger.info(
            f"OpenAIClient initialisé avec le modèle: {self.model_name}, "
            f"API Key présente: {'Oui' if api_key else 'Non'}."
        )
        logger.info(f"System prompt template utilisé: '{self.system_prompt_template}'")

    async def generate_variants(
        self,
        prompt: str,
        k: int = 1,
        response_model: Optional[Type[BaseModel]] = None,
        previous_dialogue_context: Optional[List[Dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
    ) -> List[Union[BaseModel, str]]:
        """Génère k variantes de texte à partir du prompt donné.
        
        Args:
            prompt: Le prompt à envoyer au LLM.
            k: Le nombre de variantes à générer.
            response_model: Le modèle Pydantic attendu pour la sortie structurée.
            previous_dialogue_context: Contexte de dialogue précédent.
            user_system_prompt_override: Pour surcharger le system prompt.
            
        Returns:
            Liste de k éléments, chaque élément étant une variante ou une instance de response_model.
        """
        generated_results = []
        
        # Construire les instructions système (séparées de input)
        system_message_content = (
            user_system_prompt_override if user_system_prompt_override else self.system_prompt_template
        )
        if response_model:
            system_message_content += (
                " Tu DOIS utiliser la fonction 'generate_interaction' pour formater ta réponse."
            )
        
        # Construire les messages (sans system message si on utilise instructions séparé)
        # Le system message sera passé via le paramètre instructions
        messages: List[Dict[str, Any]] = []
        if previous_dialogue_context:
            messages.extend(previous_dialogue_context)
        messages.append({"role": "user", "content": prompt})
        
        logger.debug(f"Messages envoyés au LLM (input, sans system): {messages}")
        logger.debug(f"Instructions système (séparées): {system_message_content[:100]}...")
        
        # Construire les paramètres pour Responses API
        responses_params = OpenAIParameterBuilder.build_responses_params(
            model_name=self.model_name,
            messages=messages,
            response_model=response_model,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            reasoning_effort=self.reasoning_effort,
            reasoning_summary=self.reasoning_summary,
            instructions=system_message_content,
            top_p=self.top_p,
        )
        
        # Prompt complet pour le tracking (Story 1.15)
        full_prompt_str = f"{system_message_content}\n\n--- Input ---\n{json.dumps(messages, ensure_ascii=False)}"
        
        # Générer k variantes
        for i in range(k):
            start_time = time.time()
            success = False
            error_message = None
            raw_response_str = None
            prompt_tokens = 0
            completion_tokens = 0
            total_tokens = 0

            try:
                logger.info(f"Début de la génération de la variante {i+1}/{k} pour le prompt.")
                
                # Appel API avec retry et circuit breaker
                response = await self._make_api_call_with_protection(responses_params)
                raw_response_str = response.model_dump_json() if hasattr(response, "model_dump_json") else str(response)
                
                # Logger la réponse brute
                try:
                    logger.info(
                        f"Réponse BRUTE de l'API OpenAI reçue pour la variante {i+1} "
                        f"(modèle: {self.model_name}, api=responses):\n"
                        f"{response.model_dump_json(indent=2)}"
                    )
                except Exception:
                    logger.info(
                        f"Réponse reçue (non sérialisable) pour la variante {i+1} "
                        f"(modèle: {self.model_name}, api=responses)."
                    )
                
                # Extraire les métriques d'utilisation
                usage_metrics = OpenAIUsageTracker.extract_usage_metrics(response)
                prompt_tokens = usage_metrics["prompt_tokens"]
                completion_tokens = usage_metrics["completion_tokens"]
                total_tokens = usage_metrics["total_tokens"]
                
                # Extraire le reasoning trace
                self.reasoning_trace = await OpenAIReasoningExtractor.extract_and_notify_reasoning(
                    response, i + 1, self.reasoning_callback, self.model_name
                )
                # Parser la réponse
                parsed_output, error_message, success = OpenAIResponseParser.parse_response(
                    response, response_model, self.model_name, i + 1
                )
                
                if success and parsed_output is not None:
                    generated_results.append(parsed_output)
                else:
                    # Construire un message d'erreur approprié
                    if error_message:
                        error_msg = f"Erreur: {error_message}"
                    else:
                        error_msg = f"Erreur: Réponse vide ou inattendue pour la variante {i+1}"
                    generated_results.append(error_msg)
                    
            except APIError as e:
                logger.error(f"Erreur API OpenAI lors de la génération de la variante {i+1}: {e}")
                generated_results.append(f"Erreur API: {e}")
                error_message = str(e)
            except Exception as e:
                logger.error(
                    f"Erreur inattendue lors de la génération de la variante {i+1}: {e}",
                    exc_info=True
                )
                generated_results.append(f"Erreur: {e}")
                error_message = str(e)
            finally:
                # Calculer la durée
                duration_ms = int((time.time() - start_time) * 1000)
                
                # Enregistrer l'utilisation si le service est disponible (Story 1.15: prompt/response)
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
                        if success:
                            self.last_usage_prompt_tokens = prompt_tokens
                            self.last_usage_completion_tokens = completion_tokens
                            self.last_call_cost = self.usage_service.pricing_service.calculate_cost(
                                model_name=self.model_name,
                                prompt_tokens=prompt_tokens,
                                completion_tokens=completion_tokens,
                            )
                        else:
                            self.last_call_cost = 0.0
                            self.last_usage_prompt_tokens = 0
                            self.last_usage_completion_tokens = 0
                    except Exception as tracking_error:
                        logger.error(
                            f"Erreur lors du tracking de l'usage LLM: {tracking_error}",
                            exc_info=True
                        )
        
        return generated_results

    async def generate_variants_streaming(
        self,
        prompt: str,
        k: int = 1,
        response_model: Optional[Type[BaseModel]] = None,
        previous_dialogue_context: Optional[List[Dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
        chunk_callback: Optional[Callable[[StreamChunk], Coroutine[Any, Any, None]]] = None,
    ) -> AsyncIterator[Union[StreamChunk, BaseModel, str]]:
        """Génère k variantes avec streaming natif.
        
        Args:
            prompt: Le prompt à envoyer au LLM.
            k: Le nombre de variantes à générer.
            response_model: Le modèle Pydantic attendu pour la sortie structurée.
            previous_dialogue_context: Contexte de dialogue précédent.
            user_system_prompt_override: Pour surcharger le system prompt.
            chunk_callback: Callback appelé pour chaque chunk streaming (optionnel, déprécié - utiliser les chunks yieldés).
            
        Yields:
            Chunks de streaming (StreamChunk) pendant la génération, puis les résultats finaux (BaseModel ou str).
        """
        # Construire les instructions système (séparées de input)
        system_message_content = (
            user_system_prompt_override if user_system_prompt_override else self.system_prompt_template
        )
        if response_model:
            system_message_content += (
                " Tu DOIS utiliser la fonction 'generate_interaction' pour formater ta réponse."
            )
        
        # Construire les messages (sans system message)
        messages: List[Dict[str, Any]] = []
        if previous_dialogue_context:
            messages.extend(previous_dialogue_context)
        messages.append({"role": "user", "content": prompt})
        
        logger.debug(f"Messages envoyés au LLM (input, sans system): {messages}")
        logger.debug(f"Instructions système (séparées): {system_message_content[:100]}...")
        
        # Construire les paramètres pour Responses API avec streaming
        responses_params = OpenAIParameterBuilder.build_responses_params(
            model_name=self.model_name,
            messages=messages,
            response_model=response_model,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            reasoning_effort=self.reasoning_effort,
            reasoning_summary=self.reasoning_summary,
            instructions=system_message_content,
            top_p=self.top_p,
            stream=True,
        )
        
        # Prompt complet pour le tracking (Story 1.15)
        full_prompt_str = f"{system_message_content}\n\n--- Input ---\n{json.dumps(messages, ensure_ascii=False)}"
        
        # Générer k variantes avec streaming
        for i in range(k):
            start_time = time.time()
            success = False
            error_message = None
            parsed_output: Optional[Union[BaseModel, str]] = None
            raw_response_str: Optional[str] = None
            completed_response: Optional[Any] = None

            try:
                logger.info(f"Début de la génération streaming de la variante {i+1}/{k} pour le prompt.")
                
                # Appel API avec streaming
                stream = await self._make_api_call_streaming(responses_params)
                
                # Parser le stream
                stream_parser = OpenAIStreamParser(reasoning_callback=self.reasoning_callback)
                function_call_arguments: Optional[str] = None
                item_id: Optional[str] = None
                
                async for chunk in stream_parser.parse_stream(stream):
                    # Yielder le chunk pour feedback temps réel (priorité sur callback)
                    yield chunk
                    
                    # Appeler le callback si fourni (pour compatibilité)
                    if chunk_callback:
                        try:
                            await chunk_callback(chunk)
                        except Exception as e:
                            logger.warning(f"Erreur dans chunk_callback: {e}")
                    
                    # Accumuler les function call arguments
                    if chunk.event_type == "response.function_call_arguments.delta":
                        item_id = chunk.data.get("item_id")
                        if item_id:
                            function_call_arguments = stream_parser.get_completed_function_call_arguments(item_id)
                    
                    elif chunk.event_type == "response.function_call_arguments.done":
                        item_id = chunk.data.get("item_id")
                        if item_id:
                            function_call_arguments = stream_parser.get_completed_function_call_arguments(item_id)
                            if not function_call_arguments:
                                # Utiliser arguments fourni dans l'événement done
                                function_call_arguments = chunk.data.get("arguments")
                    
                    elif chunk.event_type == "response.completed":
                        # Réponse complète reçue
                        completed_response = chunk.data.get("response")
                        if completed_response:
                            raw_response_str = (
                                completed_response.model_dump_json()
                                if hasattr(completed_response, "model_dump_json")
                                else str(completed_response)
                            )
                            # Extraire les métriques d'utilisation
                            usage_metrics = OpenAIUsageTracker.extract_usage_metrics(completed_response)
                            prompt_tokens = usage_metrics["prompt_tokens"]
                            completion_tokens = usage_metrics["completion_tokens"]
                            total_tokens = usage_metrics["total_tokens"]
                            
                            # Extraire le reasoning trace
                            self.reasoning_trace = await OpenAIReasoningExtractor.extract_and_notify_reasoning(
                                completed_response, i + 1, self.reasoning_callback, self.model_name
                            )
                            
                            # Parser la réponse finale
                            if function_call_arguments and response_model:
                                # Utiliser les arguments accumulés pour parser
                                try:
                                    parsed_output = response_model.model_validate_json(function_call_arguments)
                                    success = True
                                    logger.info(f"Variante {i+1} générée et validée avec succès (streaming, structured).")
                                except Exception as e:
                                    logger.error(f"Erreur de validation Pydantic pour la variante {i+1}: {e}", exc_info=True)
                                    error_message = f"Validation error: {e}"
                            else:
                                # Parser normalement depuis la réponse complète
                                parsed_output, error_message, success = OpenAIResponseParser.parse_response(
                                    completed_response, response_model, self.model_name, i + 1
                                )
                    
                    elif chunk.event_type == "response.failed":
                        error_data = chunk.data.get("error", {})
                        error_message = str(error_data)
                        logger.error(f"Erreur API OpenAI (streaming) pour la variante {i+1}: {error_message}")

                    elif chunk.event_type == StreamEventType.RESPONSE_INCOMPLETE.value:
                        inc = chunk.data.get("response")
                        error_message = (
                            f"Réponse OpenAI incomplète ou tronquée (max output / annulation): {inc!r}"
                        )
                        logger.warning(
                            "Streaming variante %s: %s",
                            i + 1,
                            error_message,
                        )

                # Yielder le résultat final
                if success and parsed_output is not None:
                    yield parsed_output
                else:
                    error_str = f"Erreur: {error_message}" if error_message else f"Erreur: Réponse vide ou inattendue pour la variante {i+1}"
                    logger.error(f"Yielding erreur: {error_str}")
                    yield error_str
                    
            except APIError as e:
                logger.error(f"Erreur API OpenAI lors de la génération streaming de la variante {i+1}: {e}")
                yield f"Erreur API: {e}"
                error_message = str(e)
            except Exception as e:
                logger.error(
                    f"Erreur inattendue lors de la génération streaming de la variante {i+1}: {e}",
                    exc_info=True
                )
                yield f"Erreur: {e}"
                error_message = str(e)
            finally:
                # Calculer la durée
                duration_ms = int((time.time() - start_time) * 1000)

                # Enregistrer l'utilisation si le service est disponible (pas de ligne vide si stream interrompu)
                if self.usage_service:
                    try:
                        prompt_tokens = 0
                        completion_tokens = 0
                        total_tokens = 0

                        if completed_response:
                            usage_metrics = OpenAIUsageTracker.extract_usage_metrics(completed_response)
                            prompt_tokens = usage_metrics["prompt_tokens"]
                            completion_tokens = usage_metrics["completion_tokens"]
                            total_tokens = usage_metrics["total_tokens"]

                        if completed_response is None and not success:
                            logger.debug(
                                "Skip track_usage: variante streaming sans réponse complète (tokens=0)"
                            )
                        else:
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
                            if success:
                                self.last_usage_prompt_tokens = prompt_tokens
                                self.last_usage_completion_tokens = completion_tokens
                                self.last_call_cost = self.usage_service.pricing_service.calculate_cost(
                                    model_name=self.model_name,
                                    prompt_tokens=prompt_tokens,
                                    completion_tokens=completion_tokens,
                                )
                            else:
                                self.last_call_cost = 0.0
                                self.last_usage_prompt_tokens = 0
                                self.last_usage_completion_tokens = 0
                    except Exception as tracking_error:
                        logger.error(
                            f"Erreur lors du tracking de l'usage LLM: {tracking_error}",
                            exc_info=True
                        )

    async def _make_api_call_with_protection(self, responses_params: Dict[str, Any]) -> Any:
        """Effectue l'appel API avec retry et circuit breaker si disponibles.
        
        Args:
            responses_params: Paramètres pour Responses API.
            
        Returns:
            Réponse de l'API OpenAI.
        """
        async def _make_api_call():
            return await self.client.responses.create(**responses_params)
        
        # Appliquer retry et circuit breaker si disponibles
        if self._retry_with_backoff and self._circuit_breaker:
            async def _make_api_call_with_circuit_breaker():
                return await self._circuit_breaker.call_async(_make_api_call)
            return await self._retry_with_backoff(_make_api_call_with_circuit_breaker)
        elif self._circuit_breaker:
            return await self._circuit_breaker.call_async(_make_api_call)
        elif self._retry_with_backoff:
            return await self._retry_with_backoff(_make_api_call)
        else:
            return await _make_api_call()
    
    async def _make_api_call_streaming(self, responses_params: Dict[str, Any]) -> Any:
        """Effectue l'appel API avec streaming.
        
        Args:
            responses_params: Paramètres pour Responses API (avec stream=True).
            
        Returns:
            Stream async d'événements depuis Responses API.
        """
        async def _make_streaming_call():
            # Le SDK OpenAI retourne un stream async quand stream=True
            return await self.client.responses.create(**responses_params)
        
        # Appliquer retry et circuit breaker si disponibles
        # Note: Pour le streaming, on ne peut pas utiliser retry facilement car le stream est déjà ouvert
        # On laisse le circuit breaker gérer les erreurs avant l'appel
        if self._circuit_breaker:
            return await self._circuit_breaker.call_async(_make_streaming_call)
        else:
            return await _make_streaming_call()

    def get_max_tokens(self) -> int:
        """Retourne le nombre maximum de tokens que le modèle peut gérer pour un prompt.
        
        Returns:
            Nombre maximum de tokens.
        """
        model_lower = self.model_name.lower()
        if "gpt-5.2" in model_lower:
            return 128000  # GPT-5.2 et ses variantes supportent 128k tokens
        else:
            logger.warning(
                f"Modèle OpenAI inconnu ou non listé pour get_max_tokens: {self.model_name}. "
                f"Retourne 4096 par défaut."
            )
            return 4096

    async def close(self):
        """Ferme le client OpenAI."""
        if self.client:
            await self.client.close()

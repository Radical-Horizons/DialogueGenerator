"""Client LLM avec retry et fallback vers des providers alternatifs (Story 1.16)."""
import inspect
import logging
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Type, Union
from pydantic import BaseModel

from api.utils.retry import retry_with_backoff
from core.llm.llm_client import ILLMClient
from api.exceptions import AllLLMProvidersUnavailableError

logger = logging.getLogger(__name__)


class _FallbackUsageWrapper:
    """Wrapper autour de LLMUsageService qui injecte fallback_from/fallback_reason dans track_usage."""

    def __init__(
        self,
        inner: Any,
        fallback_from: str,
        fallback_reason: str,
    ) -> None:
        self._inner = inner
        self._fallback_from = fallback_from
        self._fallback_reason = fallback_reason

    def track_usage(
        self,
        request_id: str,
        model_name: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        duration_ms: int,
        success: bool,
        endpoint: str,
        k_variants: int = 1,
        error_message: Optional[str] = None,
        dialogue_id: Optional[str] = None,
        node_id: Optional[str] = None,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        """Délègue à inner en ajoutant fallback_from et fallback_reason."""
        self._inner.track_usage(
            request_id=request_id,
            model_name=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            duration_ms=duration_ms,
            success=success,
            endpoint=endpoint,
            k_variants=k_variants,
            error_message=error_message,
            dialogue_id=dialogue_id,
            node_id=node_id,
            prompt=prompt,
            response=response,
            fallback_from=self._fallback_from,
            fallback_reason=self._fallback_reason,
            **kwargs,
        )

    def __getattr__(self, name: str) -> Any:
        """Délègue les autres attributs/méthodes au service interne."""
        return getattr(self._inner, name)


class FallbackLLMClient(ILLMClient):
    """Client qui essaie une chaîne de modèles avec retry puis fallback.

    Pour chaque appel: retry (3x, backoff) sur le client principal, puis
    essai des clients suivants. En cas de succès après fallback, track_usage
    est appelé avec fallback_from et fallback_reason.
    """

    def __init__(
        self,
        model_ids: List[str],
        create_client_fn: Callable[..., ILLMClient],
        create_client_kwargs: Dict[str, Any],
        usage_service: Any,
        request_id: Optional[str] = None,
    ) -> None:
        """Initialise le client fallback.

        Args:
            model_ids: Liste ordonnée d'api_identifier (premier = primary).
            create_client_fn: Fonction pour créer un client (ex: LLMClientFactory.create_client).
            create_client_kwargs: Arguments passés à create_client_fn (config, available_models, etc.).
            usage_service: Service de tracking (réel); les clients fallback reçoivent un wrapper.
            request_id: ID de requête pour le logging.
        """
        if len(model_ids) < 2:
            raise ValueError("FallbackLLMClient requiert au moins 2 model_ids")
        self._model_ids = list(model_ids)
        self._create_client_fn = create_client_fn
        self._create_client_kwargs = dict(create_client_kwargs)
        self._usage_service = usage_service
        self._request_id = request_id or ""
        self._clients: List[Optional[ILLMClient]] = [None] * len(model_ids)
        self._max_tokens = 0
        self._last_used_fallback: Optional[tuple[str, str]] = None  # (fallback_from, fallback_to)
        self.last_call_cost: float = 0.0
        self.last_usage_prompt_tokens: int = 0
        self.last_usage_completion_tokens: int = 0
        self.last_finish_reason: Optional[str] = None

    def _sync_last_usage_from(self, client: object) -> None:
        """Copie last_* du client effectif (OpenAI, Mistral, etc.) pour l'orchestrateur SSE."""
        self.last_call_cost = float(getattr(client, "last_call_cost", 0.0) or 0.0)
        self.last_usage_prompt_tokens = int(getattr(client, "last_usage_prompt_tokens", 0) or 0)
        self.last_usage_completion_tokens = int(getattr(client, "last_usage_completion_tokens", 0) or 0)
        reason = getattr(client, "last_finish_reason", None)
        self.last_finish_reason = str(reason) if reason else None

    def _get_client(self, index: int, fallback_from: Optional[str] = None, fallback_reason: Optional[str] = None) -> ILLMClient:
        """Retourne le client à l'index, en le créant si nécessaire."""
        if self._clients[index] is not None:
            return self._clients[index]
        kwargs = dict(self._create_client_kwargs)
        if index == 0:
            kwargs["usage_service"] = self._usage_service
        else:
            kwargs["usage_service"] = _FallbackUsageWrapper(
                self._usage_service,
                fallback_from=fallback_from or self._model_ids[0],
                fallback_reason=fallback_reason or "Unknown",
            )
        kwargs["request_id"] = self._request_id
        client = self._create_client_fn(model_id=self._model_ids[index], **kwargs)
        self._clients[index] = client
        if index == 0:
            self._max_tokens = client.get_max_tokens()
        return client

    async def generate_variants(
        self,
        prompt: str,
        k: int,
        response_model: Optional[Type[BaseModel]] = None,
        previous_dialogue_context: Optional[List[Dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
    ) -> List[Union[str, BaseModel]]:
        """Génère k variantes en essayant chaque provider (retry puis fallback)."""
        last_error: Optional[Exception] = None
        last_reason = "Unknown"
        for i in range(len(self._model_ids)):
            client = self._get_client(
                i,
                fallback_from=self._model_ids[0] if i > 0 else None,
                fallback_reason=last_reason if i > 0 else None,
            )
            try:
                result = await retry_with_backoff(
                    client.generate_variants,
                    prompt=prompt,
                    k=k,
                    response_model=response_model,
                    previous_dialogue_context=previous_dialogue_context,
                    user_system_prompt_override=user_system_prompt_override,
                    max_attempts=3,
                    base_delay=1.0,
                )
                if i > 0:
                    self._last_used_fallback = (self._model_ids[0], self._model_ids[i])
                    logger.info(
                        "Fallback: %s → %s (reason: %s)",
                        self._model_ids[0],
                        self._model_ids[i],
                        last_reason,
                    )
                self._sync_last_usage_from(client)
                return result
            except Exception as e:  # noqa: BLE001
                last_error = e
                last_reason = f"{type(e).__name__}: {str(e)}"[:200]
                logger.warning(
                    "Provider %s a échoué (tentative %s): %s",
                    self._model_ids[i],
                    i + 1,
                    last_reason,
                )
        raise AllLLMProvidersUnavailableError(
            message="Tous les providers LLM sont indisponibles",
            request_id=self._request_id or None,
        )

    def get_max_tokens(self) -> int:
        """Retourne le max_tokens du premier client de la chaîne."""
        if self._max_tokens > 0:
            return self._max_tokens
        client = self._get_client(0)
        return client.get_max_tokens()

    async def generate_variants_streaming(
        self,
        prompt: str,
        k: int = 1,
        response_model: Optional[Type[BaseModel]] = None,
        previous_dialogue_context: Optional[List[Dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
        chunk_callback: Optional[Callable[..., Any]] = None,
    ) -> AsyncIterator[Any]:
        """Streaming: essaie le premier client avec retry, puis fallback (streaming ou non)."""
        last_reason = "Unknown"
        for i in range(len(self._model_ids)):
            client = self._get_client(
                i,
                fallback_from=self._model_ids[0] if i > 0 else None,
                fallback_reason=last_reason if i > 0 else None,
            )
            streaming_attr = getattr(client, "generate_variants_streaming", None)
            has_streaming = (
                streaming_attr is not None
                and callable(streaming_attr)
                and (
                    inspect.isasyncgenfunction(streaming_attr)
                    or inspect.iscoroutinefunction(streaming_attr)
                )
            )
            try:
                if has_streaming:
                    if i > 0:
                        self._last_used_fallback = (self._model_ids[0], self._model_ids[i])
                        logger.info(
                            "Fallback (streaming): %s → %s (reason: %s)",
                            self._model_ids[0],
                            self._model_ids[i],
                            last_reason,
                        )
                    async for item in client.generate_variants_streaming(
                        prompt=prompt,
                        k=k,
                        response_model=response_model,
                        previous_dialogue_context=previous_dialogue_context,
                        user_system_prompt_override=user_system_prompt_override,
                        chunk_callback=chunk_callback,
                    ):
                        yield item
                    self._sync_last_usage_from(client)
                    return
                # Pas de streaming sur ce client: dégrader en generate_variants
                result = await retry_with_backoff(
                    client.generate_variants,
                    prompt=prompt,
                    k=k,
                    response_model=response_model,
                    previous_dialogue_context=previous_dialogue_context,
                    user_system_prompt_override=user_system_prompt_override,
                    max_attempts=3,
                    base_delay=1.0,
                )
                if i > 0:
                    self._last_used_fallback = (self._model_ids[0], self._model_ids[i])
                    logger.info(
                        "Fallback (non-streaming): %s → %s (reason: %s)",
                        self._model_ids[0],
                        self._model_ids[i],
                        last_reason,
                    )
                self._sync_last_usage_from(client)
                for r in result:
                    yield r
                return
            except Exception as e:  # noqa: BLE001
                last_reason = f"{type(e).__name__}: {str(e)}"[:200]
                logger.warning(
                    "Provider %s a échoué (streaming, tentative %s): %s",
                    self._model_ids[i],
                    i + 1,
                    last_reason,
                )
        raise AllLLMProvidersUnavailableError(
            message="Tous les providers LLM sont indisponibles",
            request_id=self._request_id or None,
        )

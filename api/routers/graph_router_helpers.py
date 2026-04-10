"""Helpers partagés entre les modules routers du graphe (Story 4.14)."""

from __future__ import annotations

import logging
from typing import Any, Optional

from factories.llm_factory import LLMClientFactory
from services.configuration_service import ConfigurationService
from services.llm_usage_service import LLMUsageService

logger = logging.getLogger(__name__)


def create_llm_client_for_router(
    model_identifier: str,
    config_service: ConfigurationService,
    usage_service: LLMUsageService,
    request_id: Optional[str],
) -> Any:
    """Instancie le client LLM avec chaîne de fallback si configurée.

    Args:
        model_identifier: Identifiant du modèle principal demandé.
        config_service: Service de configuration.
        usage_service: Service de suivi d'usage.
        request_id: ID de la requête pour le logging.

    Returns:
        Client LLM prêt à l'emploi (avec ou sans fallback).
    """
    fallback_chain = config_service.get_llm_fallback_chain()
    if not isinstance(fallback_chain, list):
        fallback_chain = []
    if len(fallback_chain) >= 2 and fallback_chain[0] == model_identifier:
        return LLMClientFactory.create_client_with_fallback(
            primary_model_id=model_identifier,
            fallback_model_ids=fallback_chain[1:],
            config=config_service.get_llm_config(),
            available_models=config_service.get_available_llm_models(),
            usage_service=usage_service,
            request_id=request_id,
        )
    return LLMClientFactory.create_client(
        model_id=model_identifier,
        config=config_service.get_llm_config(),
        available_models=config_service.get_available_llm_models(),
        usage_service=usage_service,
        request_id=request_id,
    )

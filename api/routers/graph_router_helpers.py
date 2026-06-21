"""Helpers partagés entre les modules routers du graphe (Story 4.14)."""

from __future__ import annotations

import logging
from typing import Any, Optional

from factories.llm_factory import LLMClientFactory
from services.configuration_service import ConfigurationService
from services.llm_usage_service import LLMUsageService
from services.scene_dramatis import SceneDramatis, enrich_context_selections_for_scene, resolve_scene_dramatis

logger = logging.getLogger(__name__)


def resolve_and_enrich_graph_context(
    context_selections: dict,
    *,
    player_character_id: Optional[str] = None,
    npc_speaker_id: Optional[str] = None,
    context_builder: Optional[Any] = None,
) -> tuple[SceneDramatis, dict]:
    """Résout PJ/PNJ et enrichit le contexte GDD pour la génération graphe."""
    character_catalog = None
    if context_builder is not None:
        character_catalog = context_builder.get_characters_names()
    dramatis = resolve_scene_dramatis(
        player_character_id=player_character_id,
        npc_speaker_id=npc_speaker_id,
        context_selections=context_selections,
    )
    enriched = enrich_context_selections_for_scene(
        context_selections,
        dramatis,
        character_catalog=character_catalog,
        random_excerpt_count=1,
    )
    enriched_dict = enriched.model_dump() if hasattr(enriched, "model_dump") else dict(enriched)
    return dramatis, enriched_dict


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

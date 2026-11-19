"""Helpers partagés entre les modules routers du graphe (Story 4.14)."""

from __future__ import annotations

import hashlib
import json
import logging
import random
from typing import Any, Iterable, Mapping, Optional

from factories.llm_factory import create_llm_client_with_configured_fallback
from services.configuration_service import ConfigurationService
from services.document_id_validation import validate_document_id
from services.document_persistence_service import (
    DialogueAccessDeniedError,
    DocumentPersistenceService,
)
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
    """Résout PJ/PNJ et enrichit le contexte GDD pour la génération graphe.

    La fiche figurante tirée au hasard dépend de la scène (sélection, PNJ, PJ) et non plus
    de l'appel : tous les nœuds d'un dialogue partagent le même contexte, donc le même
    début de prompt, que le cache du fournisseur relit au lieu de le refacturer.
    """
    character_catalog = None
    if context_builder is not None:
        character_catalog = context_builder.get_characters_names()
    dramatis = resolve_scene_dramatis(
        player_character_id=player_character_id,
        npc_speaker_id=npc_speaker_id,
        context_selections=context_selections,
    )
    scene_key = json.dumps(
        [context_selections, dramatis.npc_speaker_id, dramatis.player_character_id],
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )
    enriched = enrich_context_selections_for_scene(
        context_selections,
        dramatis,
        character_catalog=character_catalog,
        random_excerpt_count=1,
        rng=random.Random(hashlib.sha256(scene_key.encode("utf-8")).hexdigest()),
    )
    enriched_dict = enriched.model_dump() if hasattr(enriched, "model_dump") else dict(enriched)
    return dramatis, enriched_dict


def create_llm_client_for_router(
    model_identifier: str,
    config_service: ConfigurationService,
    usage_service: LLMUsageService,
    request_id: Optional[str],
    endpoint: Optional[str] = None,
) -> Any:
    """Instancie le client LLM avec chaîne de fallback si configurée.

    Délègue à :func:`factories.llm_factory.create_llm_client_with_configured_fallback`.

    Args:
        model_identifier: Identifiant du modèle principal demandé.
        config_service: Service de configuration.
        usage_service: Service de suivi d'usage.
        request_id: ID de la requête pour le logging.
        endpoint: Libellé d'usage optionnel (ex. templates_ab_test).

    Returns:
        Client LLM prêt à l'emploi (avec ou sans fallback).
    """
    return create_llm_client_with_configured_fallback(
        model_identifier,
        config_service,
        usage_service,
        request_id,
        endpoint=endpoint,
    )


def annotate_generated_nodes(
    usage_service: LLMUsageService,
    persistence_service: DocumentPersistenceService,
    current_user: Mapping[str, object],
    provenance: Mapping[str, str],
    nodes: Iterable[Any],
    dialogue_id: str,
    *,
    template_id: Optional[str] = None,
    template_name: Optional[str] = None,
    renamed_ids: Optional[Mapping[str, str]] = None,
    compute_relevance: bool = False,
) -> list[str]:
    """Annote le record LLM de chaque nœud renvoyé avec le dialogue et le nœud final.

    ``provenance`` vient de :func:`services.llm_call_provenance.collect_node_provenance` :
    chaque nœud est annoté sur l'appel qui l'a produit, jamais sur un autre appel de la
    même requête. Un nœud sans appel connu (client sans suivi d'usage) est ignoré.

    L'annotation n'a lieu que si l'utilisateur peut **éditer** le dialogue visé : le record
    annoté devient la génération qu'une conversation IA rejoue (instructions comprises),
    un tiers ne doit pas pouvoir en planter une dans le dialogue d'un autre. Refus ou
    identifiant invalide : rien n'est annoté (warning), la génération reste servie.

    Fonction bloquante (fichiers d'usage, SQLite) : l'appeler via ``asyncio.to_thread``.

    Args:
        usage_service: Service de suivi d'usage.
        persistence_service: Autorité d'accès aux dialogues.
        current_user: Utilisateur qui a demandé la génération.
        provenance: Table ``node_id généré → call_id``.
        nodes: Nœuds renvoyés au client (dicts Unity ou objets avec ``id``).
        dialogue_id: Dialogue auquel rattacher les records, tel que reçu par la route.
        template_id: Template appliqué, optionnel.
        template_name: Nom snapshoté du template, optionnel.
        renamed_ids: ``id généré → id final`` quand le router renomme le nœud (regenerate).
        compute_relevance: Calcule aussi la pertinence de contexte des appels annotés.

    Returns:
        Les ``call_id`` annotés, dans l'ordre des nœuds.
    """
    try:
        try:
            document_id = validate_document_id(dialogue_id)
            persistence_service.require_edit(document_id, current_user)
        except (ValueError, DialogueAccessDeniedError) as exc:
            logger.warning(
                "Annotation des nœuds générés ignorée pour le dialogue %r : %s",
                dialogue_id,
                exc,
            )
            return []

        annotations: list[tuple[str, str]] = []
        for node in nodes:
            raw_id = node.get("id") if isinstance(node, Mapping) else getattr(node, "id", None)
            if not raw_id:
                continue
            generated_id = str(raw_id)
            call_id = provenance.get(generated_id)
            if not call_id:
                continue
            annotations.append((call_id, (renamed_ids or {}).get(generated_id, generated_id)))

        annotated = usage_service.annotate_calls(
            annotations,
            dialogue_id,
            template_id=template_id,
            template_name=template_name,
        )
        if compute_relevance and annotated:
            usage_service.compute_and_persist_context_relevance_many(annotated)
        return annotated
    except Exception:
        logger.exception(
            "Annotation des nœuds générés en échec pour le dialogue %r (génération servie)",
            dialogue_id,
        )
        return []

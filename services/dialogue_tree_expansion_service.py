"""Expansion BFS d'un dialogue Unity complet (START + N rounds de choix PJ)."""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from api.schemas.dialogue import ContextSelection, GenerateUnityDialogueRequest
from core.llm.llm_client import ILLMClient
from services.document_choice_id_service import ensure_document_choice_ids
from services.dialogue_path_context import DIALOGUE_GENERATION_CONSTRAINTS_SUFFIX
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.scene_dramatis import enrich_context_selections_for_scene, resolve_scene_dramatis
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator

logger = logging.getLogger(__name__)

NO_SKILL_TEST_SUFFIX = DIALOGUE_GENERATION_CONSTRAINTS_SUFFIX

ProgressCallback = Callable[[int, int, int, int], None]


@dataclass
class TreeExpansionResult:
    """Résultat d'une expansion d'arbre de dialogue."""

    document: Dict[str, Any]
    node_count: int
    llm_calls: int
    levels_expanded: int
    failed_parents: List[str] = field(default_factory=list)
    title: str = "Dialogue auto"


def estimate_tree_llm_calls(max_depth: int, max_choices: int) -> int:
    """Estime le nombre d'appels LLM pour une expansion complète.

    Args:
        max_depth: Nombre de rounds de choix PJ après le START.
        max_choices: Nombre de choix par nœud intermédiaire.

    Returns:
        Nombre total d'appels LLM (START + enfants à chaque niveau).
    """
    total = 1
    parents = 1
    for _round in range(1, max_depth + 1):
        total += parents * max_choices
        parents *= max_choices
    return total


def _parse_nodes_from_unity_json(json_content: str) -> List[Dict[str, Any]]:
    """Extrait la liste de nœuds depuis une réponse Unity JSON."""
    parsed = json.loads(json_content)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        nodes = parsed.get("nodes")
        if isinstance(nodes, list):
            return nodes
        return [parsed]
    raise ValueError("Format Unity JSON invalide pour l'expansion d'arbre.")


def _find_start_node(nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Retourne le nœud START ou le premier nœud disponible."""
    for node in nodes:
        if node.get("id") == "START":
            return node
    if nodes:
        return nodes[0]
    raise ValueError("Aucun nœud dans le dialogue généré.")


def _choice_needs_expansion(choice: Dict[str, Any]) -> bool:
    """Indique si un choix parent n'a pas encore de cible connectée."""
    target = choice.get("targetNode")
    return not target or target == "END"


def _parent_has_unconnected_choices(node: Dict[str, Any]) -> bool:
    """Vérifie si le nœud a des choix PJ sans cible."""
    choices = node.get("choices") or []
    return any(_choice_needs_expansion(c) for c in choices)


def _truncate_choices(node: Dict[str, Any], max_choices: int) -> None:
    """Tronque les choix du nœud au plafond demandé."""
    choices = node.get("choices")
    if not choices or max_choices <= 0:
        return
    if len(choices) > max_choices:
        node["choices"] = choices[:max_choices]


def _apply_connections(
    node_registry: Dict[str, Dict[str, Any]],
    parent_id: str,
    connections: List[Dict[str, Any]],
    new_nodes: List[Dict[str, Any]],
) -> List[str]:
    """Applique les connexions suggérées et enregistre les nouveaux nœuds."""
    new_ids: List[str] = []
    for node in new_nodes:
        node_id = node.get("id")
        if not node_id:
            continue
        node_registry[node_id] = node
        new_ids.append(node_id)

    parent = node_registry.get(parent_id)
    if parent is None:
        return new_ids

    for conn in connections:
        source_id = conn.get("from") or conn.get("from_node") or ""
        target_id = conn.get("to") or conn.get("to_node") or ""
        choice_index = conn.get("via_choice_index")
        connection_type = conn.get("connection_type", "choice")
        if connection_type != "choice" or choice_index is None:
            continue
        source = node_registry.get(source_id, parent)
        choices = source.get("choices") or []
        if 0 <= choice_index < len(choices):
            choices[choice_index]["targetNode"] = target_id
    return new_ids


class DialogueTreeExpansionService:
    """Orchestre la génération récursive BFS d'un dialogue complet."""

    def __init__(
        self,
        graph_orchestrator: Optional[GraphNodeOrchestrator] = None,
    ) -> None:
        """Initialise le service avec un orchestrateur graphe injectable."""
        self._graph_orchestrator = graph_orchestrator or GraphNodeOrchestrator()

    async def expand(
        self,
        *,
        unity_orchestrator: UnityDialogueOrchestrator,
        llm_client: ILLMClient,
        user_instructions: str,
        context_selections: ContextSelection,
        max_depth: int,
        max_choices: int,
        npc_speaker_id: Optional[str] = None,
        player_character_id: Optional[str] = None,
        llm_model_identifier: str,
        title: str = "Dialogue auto",
        progress_callback: Optional[ProgressCallback] = None,
        max_concurrency: int = 5,
    ) -> TreeExpansionResult:
        """Génère un dialogue complet par expansion BFS.

        Args:
            unity_orchestrator: Orchestrateur pour le nœud START.
            llm_client: Client LLM pour les expansions graphe.
            user_instructions: Consignes utilisateur pour la scène.
            context_selections: Sélection GDD.
            max_depth: Rounds de choix PJ après le START.
            max_choices: Choix PJ par nœud intermédiaire.
            npc_speaker_id: PNJ interlocuteur (optionnel).
            llm_model_identifier: Modèle LLM pour le START.
            title: Titre du dialogue.
            progress_callback: ``(level, current, total, node_count)``.
            max_concurrency: Parallélisme max par niveau BFS.

        Returns:
            Résultat avec document Unity et métriques.
        """
        enriched_instructions = f"{user_instructions.strip()}{NO_SKILL_TEST_SUFFIX}"
        dramatis = resolve_scene_dramatis(
            player_character_id=player_character_id,
            npc_speaker_id=npc_speaker_id,
            context_selections=context_selections.model_dump(),
        )
        enriched_context = enrich_context_selections_for_scene(
            context_selections,
            dramatis,
            random_excerpt_count=1,
        )
        context_dict = enriched_context.to_service_dict()

        start_request = GenerateUnityDialogueRequest(
            user_instructions=enriched_instructions,
            context_selections=enriched_context,
            max_choices=max_choices,
            choices_mode="capped",
            npc_speaker_id=dramatis.npc_speaker_id,
            player_character_id=dramatis.player_character_id,
            llm_model_identifier=llm_model_identifier,
        )
        start_response = await unity_orchestrator.generate(start_request)
        start_nodes = _parse_nodes_from_unity_json(start_response.json_content)
        start_node = _find_start_node(start_nodes)
        _truncate_choices(start_node, max_choices)

        node_registry: Dict[str, Dict[str, Any]] = {start_node["id"]: start_node}
        llm_calls = 1
        failed_parents: List[str] = []
        frontier = [start_node["id"]]
        levels_expanded = 0

        semaphore = asyncio.Semaphore(max(1, max_concurrency))

        for round_num in range(1, max_depth + 1):
            child_max_choices = 0 if round_num == max_depth else max_choices
            parents_to_expand = [
                node_registry[pid]
                for pid in frontier
                if _parent_has_unconnected_choices(node_registry[pid])
            ]
            if not parents_to_expand:
                logger.info("Round %s : aucun parent à expandre, arrêt anticipé.", round_num)
                break

            levels_expanded = round_num
            next_frontier: List[str] = []
            total_parents = len(parents_to_expand)

            async def expand_one_parent(parent: Dict[str, Any], index: int) -> None:
                nonlocal llm_calls
                parent_id = parent["id"]
                async with semaphore:
                    try:
                        result = await self._graph_orchestrator.generate(
                            llm_client=llm_client,
                            parent_node_id=parent_id,
                            parent_node_content=parent,
                            user_instructions=enriched_instructions,
                            context_selections=context_dict,
                            max_choices=child_max_choices,
                            generate_all_choices=True,
                            dialogue_nodes=list(node_registry.values()),
                            player_character_id=dramatis.player_character_id,
                        )
                    except Exception as exc:
                        logger.error(
                            "Échec expansion parent %s (round %s): %s",
                            parent_id,
                            round_num,
                            exc,
                            exc_info=True,
                        )
                        failed_parents.append(parent_id)
                        return

                batch_calls = result.generated_choices_count or len(result.nodes) or 0
                llm_calls += max(batch_calls, 1)

                new_ids = _apply_connections(
                    node_registry,
                    parent_id,
                    result.suggested_connections,
                    result.nodes,
                )
                if child_max_choices > 0:
                    for nid in new_ids:
                        if _parent_has_unconnected_choices(node_registry[nid]):
                            next_frontier.append(nid)

                if progress_callback:
                    progress_callback(round_num, index + 1, total_parents, len(node_registry))

            await asyncio.gather(
                *[
                    expand_one_parent(parent, idx)
                    for idx, parent in enumerate(parents_to_expand)
                ]
            )
            frontier = next_frontier

        dialogue_title = start_response.title or title
        document: Dict[str, Any] = ensure_document_choice_ids(
            {
                "schemaVersion": "1.2.0",
                "nodes": list(node_registry.values()),
            }
        )
        return TreeExpansionResult(
            document=document,
            node_count=len(node_registry),
            llm_calls=llm_calls,
            levels_expanded=levels_expanded,
            failed_parents=failed_parents,
            title=dialogue_title,
        )

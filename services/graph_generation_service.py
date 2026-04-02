"""Service pour générer des nœuds de dialogue en batch pour tous les choix d'un nœud parent."""
import asyncio
import logging
from typing import List, Dict, Any, Optional, Callable, Tuple

from models.dialogue_structure.unity_dialogue_node import UnityDialogueChoiceContent
from services.unity_dialogue_generation_service import UnityDialogueGenerationService, _stable_node_id
from core.llm.llm_client import ILLMClient

logger = logging.getLogger(__name__)


def _normalize_parent_id_for_unity(raw_id: str) -> str:
    """Garantit le préfixe ``NODE_`` (même règle que GraphNodeOrchestrator)."""
    s = str(raw_id)
    if s.startswith("NODE_"):
        return s
    return f"NODE_{s}"


def _choice_has_nonempty_test(choice: Dict[str, Any]) -> bool:
    tv = choice.get("test")
    return tv is not None and (not isinstance(tv, str) or str(tv).strip())


def _build_test_outcome_connections(
    source_test_node_id: str,
    connection_data: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Construit les 4 connexions test-* depuis l'ID du TestNode (graphe)."""
    mappings: List[Tuple[str, str]] = [
        ("testCriticalFailureNode", "critical-failure"),
        ("testFailureNode", "failure"),
        ("testSuccessNode", "success"),
        ("testCriticalSuccessNode", "critical-success"),
    ]
    connections: List[Dict[str, Any]] = []
    for field_name, handle_id in mappings:
        target_node_id = connection_data.get(field_name)
        if target_node_id:
            connections.append(
                {
                    "from": source_test_node_id,
                    "to": target_node_id,
                    "via_choice_index": None,
                    "connection_type": f"test-{handle_id}",
                }
            )
    return connections


class GraphGenerationService:
    """Service pour générer des nœuds de dialogue en batch.

    Pour chaque choix sans cible (ou END) : 4 nœuds si le choix a un test, sinon 1 nœud.
    Gère les IDs et les connexions (``choice`` ou ``test-*`` depuis le TestNode).
    """
    
    def __init__(self, generation_service: Optional[UnityDialogueGenerationService] = None):
        """Initialise le service.
        
        Args:
            generation_service: Service de génération Unity (par défaut: nouvelle instance).
        """
        self.generation_service = generation_service or UnityDialogueGenerationService()
        logger.info("GraphGenerationService initialisé")
    
    async def generate_nodes_for_all_choices(
        self,
        parent_node: Dict[str, Any],
        instructions: str,
        context: Dict[str, Any],
        llm_client: ILLMClient,
        system_prompt_override: Optional[str] = None,
        max_choices: Optional[int] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> Dict[str, Any]:
        """Génère la suite pour chaque choix du parent sans cible (ou END).

        Un choix avec attribut ``test`` non vide produit 4 nœuds (issues de test) et des
        connexions ``test-*`` depuis le TestNode ; les autres choix : un nœud et une
        connexion ``choice`` depuis le parent.

        Args:
            parent_node: Nœud parent avec choix (format Unity JSON).
            instructions: Instructions pour guider la génération.
            context: Contexte GDD (non utilisé directement ici, mais peut être passé au prompt).
            llm_client: Client LLM pour la génération.
            system_prompt_override: Surcharge du system prompt (optionnel).
            max_choices: Nombre maximum de choix pour chaque nœud généré (optionnel).

        Returns:
            Dictionnaire avec ``nodes``, ``connections`` (SuggestedConnection), compteurs batch.
        """
        parent_id = parent_node.get("id", "UNKNOWN")
        parent_choices = parent_node.get("choices", [])
        
        # Filtrer les choix sans targetNode (ou avec "END")
        choices_to_generate = []
        connected_choices_count = 0
        for i, choice in enumerate(parent_choices):
            target_node = choice.get("targetNode")
            if not target_node or target_node == "END":
                choices_to_generate.append((i, choice))
            else:
                connected_choices_count += 1
        
        if not choices_to_generate:
            logger.info(f"Aucun choix à générer pour le nœud parent {parent_id} (tous déjà connectés)")
            return {
                "nodes": [],
                "connections": [],
                "connected_choices_count": connected_choices_count,
                "generated_choices_count": 0,
                "failed_choices_count": 0,
                "total_choices_count": len(parent_choices)
            }
        
        logger.info(
            "Génération batch parallèle: %s groupe(s) de choix pour le parent %s",
            len(choices_to_generate),
            parent_id,
        )

        async def generate_for_one_choice(
            choice_index: int, choice: Dict[str, Any]
        ) -> Tuple[
            int,
            List[Dict[str, Any]],
            List[Dict[str, Any]],
            Optional[Dict[str, Any]],
        ]:
            """Retourne (index, nodes, connections, error_dict|None)."""
            parent_speaker = parent_node.get("speaker", "PNJ")
            parent_line = parent_node.get("line", "")

            if _choice_has_nonempty_test(choice):
                try:
                    choice_content = UnityDialogueChoiceContent.model_validate(choice)
                    normalized_parent_id = _normalize_parent_id_for_unity(str(parent_id))
                    result = await self.generation_service.generate_nodes_for_choice_with_test(
                        llm_client=llm_client,
                        choice_content=choice_content,
                        parent_node_id=normalized_parent_id,
                        choice_index=choice_index,
                        instructions=instructions,
                        parent_speaker=parent_speaker,
                        parent_line=parent_line,
                        system_prompt_override=system_prompt_override,
                    )
                    nodes = result.get("nodes") or []
                    conns_raw = result.get("connections") or []
                    if not nodes or not conns_raw:
                        return (
                            choice_index,
                            [],
                            [],
                            {
                                "error": "No nodes from choice_with_test",
                                "choice_text": choice.get("text", ""),
                            },
                        )
                    test_node_id = f"test-node-{parent_id}-choice-{choice_index}"
                    connections = _build_test_outcome_connections(test_node_id, conns_raw[0])
                    return (choice_index, nodes, connections, None)
                except Exception as e:
                    logger.error(
                        "Erreur génération 4 nœuds (test) choix %s parent %s: %s",
                        choice_index,
                        parent_id,
                        e,
                        exc_info=True,
                    )
                    return (
                        choice_index,
                        [],
                        [],
                        {"error": str(e), "choice_text": choice.get("text", "")},
                    )

            choice_text = choice.get("text", "")
            enriched_instructions = f"""Contexte précédent:
{parent_speaker}: {parent_line}

Réponse du joueur:
{choice_text}

Instructions pour la suite:
{instructions}
"""
            try:
                response = await self.generation_service.generate_dialogue_node(
                    llm_client=llm_client,
                    prompt=enriched_instructions,
                    system_prompt_override=system_prompt_override,
                    max_choices=max_choices,
                )

                start_id = _stable_node_id()
                enriched_nodes = self.generation_service.enrich_with_ids(
                    content=response,
                    start_id=start_id,
                )

                if not enriched_nodes:
                    logger.warning(
                        "Aucun nœud enrichi pour choix %s du parent %s",
                        choice_index,
                        parent_id,
                    )
                    return (
                        choice_index,
                        [],
                        [],
                        {"error": "No enriched nodes returned", "choice_text": choice_text},
                    )
                generated_node = enriched_nodes[0]
                if not generated_node.get("id"):
                    logger.error("Nœud choix %s sans ID — ignoré", choice_index)
                    return (
                        choice_index,
                        [],
                        [],
                        {"error": "No ID generated", "choice_text": choice_text},
                    )
                connection = {
                    "from": parent_id,
                    "to": generated_node["id"],
                    "via_choice_index": choice_index,
                    "connection_type": "choice",
                }
                return (choice_index, [generated_node], [connection], None)
            except Exception as e:
                logger.error(
                    "Erreur génération nœud choix %s parent %s: %s",
                    choice_index,
                    parent_id,
                    e,
                    exc_info=True,
                )
                return (
                    choice_index,
                    [],
                    [],
                    {"error": str(e), "choice_text": choice.get("text", "")},
                )

        tasks: List[asyncio.Task] = []
        for choice_index, choice in choices_to_generate:
            tasks.append(asyncio.create_task(generate_for_one_choice(choice_index, choice)))
            await asyncio.sleep(0)

        completed_count = 0
        total_count = len(tasks)
        results: List[
            Tuple[
                int,
                List[Dict[str, Any]],
                List[Dict[str, Any]],
                Optional[Dict[str, Any]],
            ]
        ] = []

        for coro in asyncio.as_completed(tasks):
            result = await coro
            completed_count += 1
            results.append(result)

            if progress_callback:
                try:
                    progress_callback(completed_count, total_count)
                except Exception as e:
                    logger.warning("Erreur dans progress_callback: %s", e)

        results.sort(key=lambda x: x[0])

        generated_nodes: List[Dict[str, Any]] = []
        suggested_connections: List[Dict[str, Any]] = []
        failed_choices: List[Dict[str, Any]] = []

        for choice_index, nodes, conns, err in results:
            if err is not None:
                failed_choices.append(
                    {
                        "choice_index": choice_index,
                        "choice_text": err.get("choice_text", ""),
                        "error": err.get("error", "Unknown error"),
                    }
                )
            else:
                generated_nodes.extend(nodes)
                suggested_connections.extend(conns)
        
        # Logger un avertissement si des échecs partiels
        if failed_choices:
            logger.warning(
                f"Génération batch partielle: {len(generated_nodes)}/{len(choices_to_generate)} "
                f"nœud(s) généré(s) avec succès, {len(failed_choices)} échec(s) pour le parent {parent_id}"
            )
        else:
            logger.info(
                f"Génération batch terminée: {len(generated_nodes)} nœud(s) généré(s) "
                f"pour le parent {parent_id}"
            )

        return {
            "nodes": generated_nodes,
            "connections": suggested_connections,
            "failed_choices": failed_choices,  # Retourner les échecs pour information
            "connected_choices_count": connected_choices_count,
            "generated_choices_count": len(generated_nodes),
            "failed_choices_count": len(failed_choices),
            "total_choices_count": len(parent_choices),
        }

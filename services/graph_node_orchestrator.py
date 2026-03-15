"""Orchestrateur pour la génération de nœuds de graphe de dialogue.

Encapsule toute la logique de dispatch et d'assemblage de réponses qui était
auparavant dans le routeur ``api/routers/graph.py``.  Le routeur devient un thin
controller qui délègue ici.

Modes de génération gérés :
- **batch** : un nœud par choix non connecté (``generate_all_choices=True``)
- **test-node** : 4 nœuds depuis un TestNode existant
- **choice-with-test** : 4 nœuds pour un choix doté d'un attribut ``test``
- **normal** : un nœud pour un choix spécifique ou en nextNode
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from core.llm.llm_client import ILLMClient
from models.dialogue_structure.unity_dialogue_node import UnityDialogueChoiceContent
from services.graph_generation_service import GraphGenerationService
from services.unity_dialogue_generation_service import UnityDialogueGenerationService

logger = logging.getLogger(__name__)

DEFAULT_INSTRUCTIONS = "Ecris la réponse du PNJ à ce que dit le PJ"

TEST_RESULT_MAPPINGS: list[tuple[str, str]] = [
    ("testCriticalFailureNode", "critical-failure"),
    ("testFailureNode", "failure"),
    ("testSuccessNode", "success"),
    ("testCriticalSuccessNode", "critical-success"),
]


@dataclass
class GenerationResult:
    """Résultat unifié produit par l'orchestrateur, indépendant du framework HTTP."""

    nodes: List[Dict[str, Any]]
    suggested_connections: List[Dict[str, Any]]
    parent_node_id: str
    batch_count: Optional[int] = None
    generated_choices_count: Optional[int] = None
    connected_choices_count: Optional[int] = None
    failed_choices_count: Optional[int] = None
    total_choices_count: Optional[int] = None


def _normalize_parent_id(raw_id: str) -> str:
    """Garantit le préfixe ``NODE_``."""
    if raw_id.startswith("NODE_"):
        return raw_id
    return f"NODE_{raw_id}"


def _resolve_instructions(raw: Optional[str]) -> str:
    """Retourne les instructions nettoyées ou la valeur par défaut."""
    if raw and raw.strip():
        return raw.strip()
    return DEFAULT_INSTRUCTIONS


def _build_test_connections(
    source_node_id: str,
    connection_data: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Construit les connexions pour les 4 résultats de test."""
    connections: List[Dict[str, Any]] = []
    for field_name, handle_id in TEST_RESULT_MAPPINGS:
        target_node_id = connection_data.get(field_name)
        if target_node_id:
            connections.append(
                {
                    "from": source_node_id,
                    "to": target_node_id,
                    "via_choice_index": None,
                    "connection_type": f"test-{handle_id}",
                }
            )
    return connections


def _build_enriched_instructions(
    parent_speaker: str,
    parent_line: str,
    user_instructions: str,
    choice_text: Optional[str] = None,
) -> str:
    """Construit le prompt enrichi avec le contexte parent."""
    if choice_text is not None:
        return (
            f"Contexte précédent:\n{parent_speaker}: {parent_line}\n\n"
            f"Réponse du joueur:\n{choice_text}\n\n"
            f"Instructions pour la suite:\n{user_instructions}\n"
        )
    return (
        f"Contexte précédent:\n{parent_speaker}: {parent_line}\n\n"
        f"Instructions pour la suite:\n{user_instructions}\n"
    )


class GraphNodeOrchestrator:
    """Orchestre la génération de nœuds selon le mode demandé.

    Args:
        generation_service: Service de génération Unity (créé si ``None``).
    """

    def __init__(
        self,
        generation_service: Optional[UnityDialogueGenerationService] = None,
    ) -> None:
        self._generation_service = generation_service or UnityDialogueGenerationService()

    async def generate(
        self,
        *,
        llm_client: ILLMClient,
        parent_node_id: str,
        parent_node_content: Dict[str, Any],
        user_instructions: Optional[str],
        context_selections: Optional[Dict[str, Any]] = None,
        system_prompt_override: Optional[str] = None,
        max_choices: Optional[int] = None,
        target_choice_index: Optional[int] = None,
        generate_all_choices: bool = False,
    ) -> GenerationResult:
        """Point d'entrée unique – dispatche vers le bon mode de génération.

        Raises:
            ValueError: Paramètres incohérents (pas de choix pour batch, index invalide…).
        """
        parent_choices: list = parent_node_content.get("choices", [])
        instructions = _resolve_instructions(user_instructions)

        if generate_all_choices:
            return await self._generate_batch(
                llm_client=llm_client,
                parent_node_id=parent_node_id,
                parent_node_content=parent_node_content,
                parent_choices=parent_choices,
                instructions=instructions,
                context_selections=context_selections or {},
                system_prompt_override=system_prompt_override,
                max_choices=max_choices,
            )

        parent_speaker = parent_node_content.get("speaker", "PNJ")
        parent_line = parent_node_content.get("line", "")

        is_test_node = (
            parent_node_content.get("type") == "testNode"
            or (not parent_choices and parent_node_content.get("test") is not None)
            or parent_node_id.startswith("test-node-")
        )

        if is_test_node and not parent_choices:
            result = await self._generate_from_test_node(
                llm_client=llm_client,
                parent_node_id=parent_node_id,
                parent_node_content=parent_node_content,
                instructions=instructions,
                system_prompt_override=system_prompt_override,
            )
            if result is not None:
                return result

        if target_choice_index is not None and parent_choices:
            return await self._generate_for_choice(
                llm_client=llm_client,
                parent_node_id=parent_node_id,
                parent_choices=parent_choices,
                parent_speaker=parent_speaker,
                parent_line=parent_line,
                target_choice_index=target_choice_index,
                instructions=instructions,
                system_prompt_override=system_prompt_override,
                max_choices=max_choices,
            )

        if target_choice_index is not None and not parent_choices:
            raise ValueError("Aucun choix disponible pour la génération d'un choix spécifique.")

        return await self._generate_normal(
            llm_client=llm_client,
            parent_node_id=parent_node_id,
            parent_choices=parent_choices,
            parent_speaker=parent_speaker,
            parent_line=parent_line,
            instructions=instructions,
            system_prompt_override=system_prompt_override,
            max_choices=max_choices,
            target_choice_index=target_choice_index,
        )

    # ------------------------------------------------------------------
    # Modes de génération
    # ------------------------------------------------------------------

    async def _generate_batch(
        self,
        *,
        llm_client: ILLMClient,
        parent_node_id: str,
        parent_node_content: Dict[str, Any],
        parent_choices: list,
        instructions: str,
        context_selections: Dict[str, Any],
        system_prompt_override: Optional[str],
        max_choices: Optional[int],
    ) -> GenerationResult:
        if not parent_choices:
            raise ValueError("Aucun choix disponible pour la génération batch.")

        graph_gen = GraphGenerationService(self._generation_service)
        parent_node = {**parent_node_content, "id": parent_node_id}
        batch_result = await graph_gen.generate_nodes_for_all_choices(
            parent_node=parent_node,
            instructions=instructions,
            context=context_selections,
            llm_client=llm_client,
            system_prompt_override=system_prompt_override,
            max_choices=max_choices,
            progress_callback=None,
        )

        generated_nodes = batch_result["nodes"]
        failed_choices = batch_result.get("failed_choices", [])

        if not generated_nodes:
            if failed_choices:
                raise ValueError(
                    f"Aucun nœud généré. {len(failed_choices)} échec(s) de génération. "
                    "Vérifiez les logs pour plus de détails."
                )
            raise ValueError("Tous les choix sont déjà connectés. Aucun nœud à générer.")

        return GenerationResult(
            nodes=generated_nodes,
            suggested_connections=batch_result["connections"],
            parent_node_id=parent_node_id,
            batch_count=len(generated_nodes),
            generated_choices_count=batch_result.get("generated_choices_count"),
            connected_choices_count=batch_result.get("connected_choices_count"),
            failed_choices_count=batch_result.get("failed_choices_count"),
            total_choices_count=batch_result.get("total_choices_count"),
        )

    async def _generate_from_test_node(
        self,
        *,
        llm_client: ILLMClient,
        parent_node_id: str,
        parent_node_content: Dict[str, Any],
        instructions: str,
        system_prompt_override: Optional[str],
    ) -> Optional[GenerationResult]:
        """Retourne ``None`` si l'ID du test-node n'est pas parseable (fallback normal)."""
        test_node_id = parent_node_id
        if not test_node_id.startswith("test-node-"):
            return None

        parts = test_node_id.replace("test-node-", "").split("-choice-")
        if len(parts) != 2:
            return None

        parent_dialogue_id, choice_index_str = parts
        try:
            choice_index = int(choice_index_str)
        except (ValueError, IndexError):
            logger.warning(
                "Impossible d'extraire parent_id et choice_index depuis TestNode ID %s",
                test_node_id,
            )
            return None

        test_value = parent_node_content.get("test")
        if not test_value:
            return None

        parent_speaker = (
            parent_node_content.get("parent_speaker")
            or parent_node_content.get("speaker")
            or "PNJ"
        )
        parent_line = (
            parent_node_content.get("parent_line")
            or parent_node_content.get("line")
            or ""
        )

        choice_content = UnityDialogueChoiceContent.model_validate(
            {"text": "", "test": test_value}
        )
        normalized_parent_id = _normalize_parent_id(parent_dialogue_id)

        result = await self._generation_service.generate_nodes_for_choice_with_test(
            llm_client=llm_client,
            choice_content=choice_content,
            parent_node_id=normalized_parent_id,
            choice_index=choice_index,
            instructions=instructions,
            parent_speaker=parent_speaker,
            parent_line=parent_line,
            system_prompt_override=system_prompt_override,
        )

        generated_nodes = result["nodes"]
        connection_data = result["connections"][0]
        connections = _build_test_connections(test_node_id, connection_data)

        logger.info(
            "4 nœuds générés depuis TestNode: %s, parent DialogueNode: %s, choice_index: %s",
            test_node_id,
            normalized_parent_id,
            choice_index,
        )

        return GenerationResult(
            nodes=generated_nodes,
            suggested_connections=connections,
            parent_node_id=parent_node_id,
        )

    async def _generate_for_choice(
        self,
        *,
        llm_client: ILLMClient,
        parent_node_id: str,
        parent_choices: list,
        parent_speaker: str,
        parent_line: str,
        target_choice_index: int,
        instructions: str,
        system_prompt_override: Optional[str],
        max_choices: Optional[int],
    ) -> GenerationResult:
        if not (0 <= target_choice_index < len(parent_choices)):
            raise ValueError(f"Index de choix invalide: {target_choice_index}.")

        choice_data = parent_choices[target_choice_index]

        # Ne générer 4 nœuds que si le choix a un test non vide (évite 422 après suppression du TestNode)
        test_value = choice_data.get("test")
        if test_value and (not isinstance(test_value, str) or test_value.strip()):
            return await self._generate_choice_with_test(
                llm_client=llm_client,
                parent_node_id=parent_node_id,
                choice_data=choice_data,
                choice_index=target_choice_index,
                parent_speaker=parent_speaker,
                parent_line=parent_line,
                instructions=instructions,
                system_prompt_override=system_prompt_override,
            )

        choice_text = choice_data.get("text", "")
        enriched = _build_enriched_instructions(
            parent_speaker, parent_line, instructions, choice_text=choice_text
        )
        return await self._generate_and_enrich(
            llm_client=llm_client,
            parent_node_id=parent_node_id,
            parent_choices=parent_choices,
            enriched_instructions=enriched,
            system_prompt_override=system_prompt_override,
            max_choices=max_choices,
            target_choice_index=target_choice_index,
        )

    async def _generate_choice_with_test(
        self,
        *,
        llm_client: ILLMClient,
        parent_node_id: str,
        choice_data: Dict[str, Any],
        choice_index: int,
        parent_speaker: str,
        parent_line: str,
        instructions: str,
        system_prompt_override: Optional[str],
    ) -> GenerationResult:
        choice_content = UnityDialogueChoiceContent.model_validate(choice_data)
        normalized_parent_id = _normalize_parent_id(parent_node_id)

        result = await self._generation_service.generate_nodes_for_choice_with_test(
            llm_client=llm_client,
            choice_content=choice_content,
            parent_node_id=normalized_parent_id,
            choice_index=choice_index,
            instructions=instructions,
            parent_speaker=parent_speaker,
            parent_line=parent_line,
            system_prompt_override=system_prompt_override,
        )

        generated_nodes = result["nodes"]
        connection_data = result["connections"][0]

        test_node_id = f"test-node-{normalized_parent_id}-choice-{choice_index}"
        connections = _build_test_connections(test_node_id, connection_data)

        logger.info(
            "4 nœuds générés pour choix avec test: %s, parent: %s",
            choice_content.test,
            parent_node_id,
        )

        return GenerationResult(
            nodes=generated_nodes,
            suggested_connections=connections,
            parent_node_id=parent_node_id,
        )

    async def _generate_normal(
        self,
        *,
        llm_client: ILLMClient,
        parent_node_id: str,
        parent_choices: list,
        parent_speaker: str,
        parent_line: str,
        instructions: str,
        system_prompt_override: Optional[str],
        max_choices: Optional[int],
        target_choice_index: Optional[int],
    ) -> GenerationResult:
        enriched = _build_enriched_instructions(parent_speaker, parent_line, instructions)
        return await self._generate_and_enrich(
            llm_client=llm_client,
            parent_node_id=parent_node_id,
            parent_choices=parent_choices,
            enriched_instructions=enriched,
            system_prompt_override=system_prompt_override,
            max_choices=max_choices,
            target_choice_index=target_choice_index,
        )

    # ------------------------------------------------------------------
    # Helpers partagés
    # ------------------------------------------------------------------

    async def _generate_and_enrich(
        self,
        *,
        llm_client: ILLMClient,
        parent_node_id: str,
        parent_choices: list,
        enriched_instructions: str,
        system_prompt_override: Optional[str],
        max_choices: Optional[int],
        target_choice_index: Optional[int],
    ) -> GenerationResult:
        """Génération standard + enrichissement IDs + construction des connexions."""
        response = await self._generation_service.generate_dialogue_node(
            llm_client=llm_client,
            prompt=enriched_instructions,
            system_prompt_override=system_prompt_override,
            max_choices=max_choices,
        )

        normalized_parent_id = _normalize_parent_id(parent_node_id)

        if target_choice_index is not None:
            start_id = f"{normalized_parent_id}_CHOICE_{target_choice_index}"
        else:
            start_id = f"{normalized_parent_id}_CHILD"

        enriched_nodes = self._generation_service.enrich_with_ids(
            content=response, start_id=start_id
        )
        generated_node = enriched_nodes[0]

        connections = self._build_normal_connections(
            parent_node_id=parent_node_id,
            generated_node_id=generated_node["id"],
            parent_choices=parent_choices,
            target_choice_index=target_choice_index,
        )

        logger.info(
            "Nœud généré en contexte: %s, parent: %s",
            generated_node["id"],
            parent_node_id,
        )

        return GenerationResult(
            nodes=[generated_node],
            suggested_connections=connections,
            parent_node_id=parent_node_id,
        )

    @staticmethod
    def _build_normal_connections(
        *,
        parent_node_id: str,
        generated_node_id: str,
        parent_choices: list,
        target_choice_index: Optional[int],
    ) -> List[Dict[str, Any]]:
        """Construit les connexions pour une génération standard (choix ou nextNode)."""
        if target_choice_index is not None:
            return [
                {
                    "from": parent_node_id,
                    "to": generated_node_id,
                    "via_choice_index": target_choice_index,
                    "connection_type": "choice",
                }
            ]

        if parent_choices:
            for i, choice in enumerate(parent_choices):
                if not choice.get("targetNode") or choice.get("targetNode") == "END":
                    return [
                        {
                            "from": parent_node_id,
                            "to": generated_node_id,
                            "via_choice_index": i,
                            "connection_type": "choice",
                        }
                    ]
            return []

        return [
            {
                "from": parent_node_id,
                "to": generated_node_id,
                "connection_type": "nextNode",
            }
        ]

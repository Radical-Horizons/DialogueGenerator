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

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from core.llm.llm_client import ILLMClient
from models.dialogue_structure.unity_dialogue_node import UnityDialogueChoiceContent
from constants import PlayableCharacters
from services.dialogue_path_context import (
    DialoguePathStep,
    ancestor_path_node_ids,
    build_ancestor_path_steps,
    build_enriched_generation_prompt,
    format_dialogue_reference,
    format_generation_prompt,
    infer_child_generation_depth,
)
from services.dialogue_dramatic_progression import (
    compose_generation_instructions,
    DEFAULT_NODE_SCENE_INSTRUCTIONS,
)
from services.graph_generation_service import GraphGenerationService
from services.llm_call_provenance import capture_llm_calls, link_nodes_to_calls
from services.graph_prompt_context import GraphPromptContextFactory, PromptRenderer
from services.unity_dialogue_generation_service import (
    UnityDialogueGenerationService,
    generate_stable_node_id,
)
from services.unity_node_validation_service import (
    ChoicesMode,
    find_off_catalog_tests,
    infer_choices_mode,
    validate_enriched_node,
)

logger = logging.getLogger(__name__)

DEFAULT_INSTRUCTIONS = DEFAULT_NODE_SCENE_INSTRUCTIONS
DEFAULT_PLAYER_CHARACTER = PlayableCharacters.DEFAULT_PLAYER

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
    warnings: List[str] = field(default_factory=list)


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


def _resolve_path_steps(
    dialogue_nodes: Optional[List[Dict[str, Any]]],
    parent_node_id: str,
) -> Optional[List[DialoguePathStep]]:
    """Chemin ancêtre complet si la liste de nœuds est fournie."""
    if not dialogue_nodes:
        return None
    steps = build_ancestor_path_steps(dialogue_nodes, parent_node_id)
    return steps or None


def _split_test_node_id(node_id: str) -> Optional[Tuple[str, int]]:
    """``test-node-<dialogue>-choice-<i>`` → (id du nœud de dialogue, index du choix)."""
    if not node_id.startswith("test-node-"):
        return None
    parts = node_id[len("test-node-"):].split("-choice-")
    if len(parts) != 2:
        return None
    try:
        return parts[0], int(parts[1])
    except ValueError:
        return None


def _tested_choice_text(
    dialogue_nodes: Optional[List[Dict[str, Any]]],
    dialogue_node_id: str,
    choice_index: int,
) -> str:
    """Texte du choix testé, lu sur le nœud de dialogue (le TestNode n'en garde qu'une copie)."""
    for node in dialogue_nodes or []:
        if str(node.get("id")) != dialogue_node_id:
            continue
        choices = node.get("choices") or []
        if 0 <= choice_index < len(choices):
            return str(choices[choice_index].get("text") or "")
    return ""


def _resolve_npc_speaker(
    npc_speaker_id: Optional[str],
    context_selections: Optional[Dict[str, Any]],
    parent_node_content: Dict[str, Any],
) -> str:
    """PNJ de la scène : explicite, sinon protagoniste B du contexte enrichi, sinon speaker parent."""
    if npc_speaker_id:
        return npc_speaker_id
    protagonists = (context_selections or {}).get("scene_protagonists") or {}
    from_context = protagonists.get("personnage_b") if isinstance(protagonists, dict) else None
    return str(from_context or parent_node_content.get("speaker") or "PNJ")


def _build_enriched_instructions(
    parent_speaker: str,
    parent_line: str,
    user_instructions: str,
    choice_text: Optional[str] = None,
    *,
    dialogue_nodes: Optional[List[Dict[str, Any]]] = None,
    parent_node_id: Optional[str] = None,
    path_steps: Optional[List[DialoguePathStep]] = None,
    player_choice_label: str = DEFAULT_PLAYER_CHARACTER,
) -> str:
    """Construit le prompt enrichi avec le chemin ancêtre ou le parent immédiat."""
    if path_steps is None and dialogue_nodes and parent_node_id:
        path_steps = _resolve_path_steps(dialogue_nodes, parent_node_id)

    if path_steps:
        return format_generation_prompt(
            path_steps,
            user_instructions,
            choice_text,
            player_choice_label=player_choice_label,
        )

    return build_enriched_generation_prompt(
        nodes=None,
        parent_node_id=parent_node_id or "",
        parent_speaker=parent_speaker,
        parent_line=parent_line,
        user_instructions=user_instructions,
        choice_text=choice_text,
        player_choice_label=player_choice_label,
    )


def _with_dialogue_reference(
    render_prompt: Optional[PromptRenderer],
    reference: str,
) -> Optional[PromptRenderer]:
    """Préfixe chaque corps de prompt par le reste du dialogue (avant l'historique)."""
    if not reference:
        return render_prompt

    def render(body: str, max_choices: Optional[int]) -> str:
        full_body = reference + body
        return render_prompt(full_body, max_choices) if render_prompt else full_body

    return render


class GraphNodeOrchestrator:
    """Orchestre la génération de nœuds selon le mode demandé.

    Args:
        generation_service: Service de génération Unity (créé si ``None``).
        prompt_context_factory: Résout contexte GDD et catalogues. Sans lui, le prompt
            se réduit à l'historique et aux instructions (tests unitaires).
    """

    def __init__(
        self,
        generation_service: Optional[UnityDialogueGenerationService] = None,
        prompt_context_factory: Optional[GraphPromptContextFactory] = None,
    ) -> None:
        self._generation_service = generation_service or UnityDialogueGenerationService()
        self._prompt_context_factory = prompt_context_factory

    async def _build_prompt_renderer(
        self,
        *,
        context_selections: Optional[Dict[str, Any]],
        npc_speaker_id: str,
        player_character_id: str,
        scene_instruction: str,
        narrative_tags: Optional[List[str]],
        llm_model_identifier: Optional[str],
    ) -> Optional[PromptRenderer]:
        """Contexte GDD + catalogues résolus une fois pour tous les appels de la requête."""
        if self._prompt_context_factory is None or not context_selections:
            return None
        prompt_context = await asyncio.to_thread(
            self._prompt_context_factory.build,
            context_selections,
            npc_speaker_id=npc_speaker_id,
            player_character_id=player_character_id,
            scene_instruction=scene_instruction,
            narrative_tags=narrative_tags,
            llm_model_identifier=llm_model_identifier,
        )
        return prompt_context.render

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
        dialogue_nodes: Optional[List[Dict[str, Any]]] = None,
        player_character_id: Optional[str] = None,
        max_depth: Optional[int] = None,
        choices_mode: Optional[ChoicesMode] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None,
        npc_speaker_id: Optional[str] = None,
        narrative_tags: Optional[List[str]] = None,
        llm_model_identifier: Optional[str] = None,
    ) -> GenerationResult:
        """Point d'entrée unique – dispatche vers le bon mode de génération.

        ``context_selections`` (sélection enrichie pour la scène) est rendu en contexte
        GDD + catalogues dans chaque prompt, comme pour le flux « Générer ».

        Raises:
            ValueError: Paramètres incohérents (pas de choix pour batch, index invalide…).
        """
        parent_choices: list = parent_node_content.get("choices", [])
        raw_instructions = _resolve_instructions(user_instructions)
        test_node_ref = _split_test_node_id(parent_node_id)
        history_parent_id = test_node_ref[0] if test_node_ref else parent_node_id
        path_steps = _resolve_path_steps(dialogue_nodes, history_parent_id)
        instructions = compose_generation_instructions(
            raw_instructions,
            depth=infer_child_generation_depth(path_steps),
            max_depth=max_depth,
            is_leaf=max_choices == 0,
            interactive=max_depth is None,
        )
        choice_label = player_character_id or DEFAULT_PLAYER_CHARACTER
        effective_choices_mode = infer_choices_mode(choices_mode, max_choices)
        render_prompt = await self._build_prompt_renderer(
            context_selections=context_selections,
            npc_speaker_id=_resolve_npc_speaker(
                npc_speaker_id, context_selections, parent_node_content
            ),
            player_character_id=choice_label,
            scene_instruction=raw_instructions,
            narrative_tags=narrative_tags,
            llm_model_identifier=llm_model_identifier,
        )
        render_prompt = _with_dialogue_reference(
            render_prompt,
            format_dialogue_reference(
                dialogue_nodes,
                ancestor_path_node_ids(dialogue_nodes, history_parent_id),
                player_choice_label=choice_label,
            ),
        )
        if system_prompt_override is None and self._prompt_context_factory is not None:
            system_prompt_override = self._prompt_context_factory.default_system_prompt()

        async def dispatch() -> GenerationResult:
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
                    dialogue_nodes=dialogue_nodes,
                    player_choice_label=choice_label,
                    choices_mode=effective_choices_mode,
                    progress_callback=progress_callback,
                    render_prompt=render_prompt,
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
                    dialogue_nodes=dialogue_nodes,
                    path_steps=path_steps,
                    player_choice_label=choice_label,
                    render_prompt=render_prompt,
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
                    dialogue_nodes=dialogue_nodes,
                    player_choice_label=choice_label,
                    choices_mode=effective_choices_mode,
                    path_steps=path_steps,
                    render_prompt=render_prompt,
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
                dialogue_nodes=dialogue_nodes,
                player_choice_label=choice_label,
                choices_mode=effective_choices_mode,
                path_steps=path_steps,
                render_prompt=render_prompt,
            )

        result = await dispatch()
        result.warnings = [
            warning for node in result.nodes for warning in find_off_catalog_tests(node)
        ]
        return result

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
        dialogue_nodes: Optional[List[Dict[str, Any]]] = None,
        player_choice_label: str = DEFAULT_PLAYER_CHARACTER,
        choices_mode: ChoicesMode = "capped",
        progress_callback: Optional[Callable[[int, int], None]] = None,
        render_prompt: Optional[PromptRenderer] = None,
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
            progress_callback=progress_callback,
            dialogue_nodes=dialogue_nodes,
            player_choice_label=player_choice_label,
            choices_mode=choices_mode,
            render_prompt=render_prompt,
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
        dialogue_nodes: Optional[List[Dict[str, Any]]] = None,
        path_steps: Optional[List[DialoguePathStep]] = None,
        player_choice_label: str = DEFAULT_PLAYER_CHARACTER,
        render_prompt: Optional[PromptRenderer] = None,
    ) -> Optional[GenerationResult]:
        """Retourne ``None`` si l'ID du test-node n'est pas parseable (fallback normal).

        ``path_steps`` est le chemin jusqu'au nœud de dialogue qui porte le choix testé.
        """
        test_node_id = parent_node_id
        test_node_ref = _split_test_node_id(test_node_id)
        if test_node_ref is None:
            if test_node_id.startswith("test-node-"):
                logger.warning(
                    "Impossible d'extraire parent_id et choice_index depuis TestNode ID %s",
                    test_node_id,
                )
            return None
        parent_dialogue_id, choice_index = test_node_ref

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
        tested_choice_text = _tested_choice_text(dialogue_nodes, parent_dialogue_id, choice_index)

        choice_content = UnityDialogueChoiceContent.model_validate(
            {"text": tested_choice_text, "test": test_value}
        )
        result = await self._generation_service.generate_nodes_for_choice_with_test(
            llm_client=llm_client,
            choice_content=choice_content,
            parent_node_id=parent_dialogue_id,
            choice_index=choice_index,
            instructions=instructions,
            parent_speaker=parent_speaker,
            parent_line=parent_line,
            system_prompt_override=system_prompt_override,
            path_steps=path_steps,
            player_choice_label=player_choice_label,
            render_prompt=render_prompt,
        )

        generated_nodes = result["nodes"]
        connection_data = result["connections"][0]
        connections = _build_test_connections(test_node_id, connection_data)

        logger.info(
            "4 nœuds générés depuis TestNode: %s, parent DialogueNode: %s, choice_index: %s",
            test_node_id,
            parent_dialogue_id,
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
        dialogue_nodes: Optional[List[Dict[str, Any]]] = None,
        player_choice_label: str = DEFAULT_PLAYER_CHARACTER,
        choices_mode: ChoicesMode = "capped",
        path_steps: Optional[List[DialoguePathStep]] = None,
        render_prompt: Optional[PromptRenderer] = None,
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
                path_steps=path_steps,
                player_choice_label=player_choice_label,
                render_prompt=render_prompt,
            )

        choice_text = choice_data.get("text", "")
        enriched = _build_enriched_instructions(
            parent_speaker,
            parent_line,
            instructions,
            choice_text=choice_text,
            dialogue_nodes=dialogue_nodes,
            parent_node_id=parent_node_id,
            path_steps=path_steps,
            player_choice_label=player_choice_label,
        )
        return await self._generate_and_enrich(
            llm_client=llm_client,
            parent_node_id=parent_node_id,
            parent_choices=parent_choices,
            enriched_instructions=enriched,
            system_prompt_override=system_prompt_override,
            max_choices=max_choices,
            target_choice_index=target_choice_index,
            choices_mode=choices_mode,
            render_prompt=render_prompt,
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
        path_steps: Optional[List[DialoguePathStep]] = None,
        player_choice_label: str = DEFAULT_PLAYER_CHARACTER,
        render_prompt: Optional[PromptRenderer] = None,
    ) -> GenerationResult:
        choice_content = UnityDialogueChoiceContent.model_validate(choice_data)
        result = await self._generation_service.generate_nodes_for_choice_with_test(
            llm_client=llm_client,
            choice_content=choice_content,
            parent_node_id=parent_node_id,
            choice_index=choice_index,
            instructions=instructions,
            parent_speaker=parent_speaker,
            parent_line=parent_line,
            system_prompt_override=system_prompt_override,
            path_steps=path_steps,
            player_choice_label=player_choice_label,
            render_prompt=render_prompt,
        )

        generated_nodes = result["nodes"]
        connection_data = result["connections"][0]

        # Utiliser parent_node_id brut pour que suggested_connections.from corresponde à l’id du TestNode côté client
        test_node_id = f"test-node-{parent_node_id}-choice-{choice_index}"
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
        dialogue_nodes: Optional[List[Dict[str, Any]]] = None,
        player_choice_label: str = DEFAULT_PLAYER_CHARACTER,
        choices_mode: ChoicesMode = "capped",
        path_steps: Optional[List[DialoguePathStep]] = None,
        render_prompt: Optional[PromptRenderer] = None,
    ) -> GenerationResult:
        enriched = _build_enriched_instructions(
            parent_speaker,
            parent_line,
            instructions,
            dialogue_nodes=dialogue_nodes,
            parent_node_id=parent_node_id,
            path_steps=path_steps,
            player_choice_label=player_choice_label,
        )
        return await self._generate_and_enrich(
            llm_client=llm_client,
            parent_node_id=parent_node_id,
            parent_choices=parent_choices,
            enriched_instructions=enriched,
            system_prompt_override=system_prompt_override,
            max_choices=max_choices,
            target_choice_index=target_choice_index,
            choices_mode=choices_mode,
            render_prompt=render_prompt,
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
        choices_mode: ChoicesMode = "capped",
        render_prompt: Optional[PromptRenderer] = None,
    ) -> GenerationResult:
        """Génération standard + enrichissement IDs + construction des connexions."""
        if max_choices == 0:
            llm_max_choices: Optional[int] = 0
        elif choices_mode == "free":
            llm_max_choices = None
        else:
            llm_max_choices = max_choices

        prompt = (
            render_prompt(enriched_instructions, llm_max_choices)
            if render_prompt
            else enriched_instructions
        )
        with capture_llm_calls() as llm_calls:
            response = await self._generation_service.generate_dialogue_node(
                llm_client=llm_client,
                prompt=prompt,
                system_prompt_override=system_prompt_override,
                max_choices=llm_max_choices,
            )

        enriched_nodes = self._generation_service.enrich_with_ids(
            content=response,
            start_id=generate_stable_node_id(),
        )
        generated_node = enriched_nodes[0]
        link_nodes_to_calls([generated_node["id"]], llm_calls)
        pre_truncate_free = choices_mode == "free" and max_choices not in (0, None)
        validate_enriched_node(
            generated_node,
            max_choices=None if pre_truncate_free else max_choices,
            choices_mode="free" if pre_truncate_free else choices_mode,
        )

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

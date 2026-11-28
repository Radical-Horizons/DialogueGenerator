"""Contexte GDD et catalogues pour les prompts de génération de nœuds du graphe.

Même construction que le flux « Générer » (``UnityDialogueOrchestrator``) :
``ContextBuilder.build_context_json_with_previous_dialogue`` pour le contexte structuré,
``load_prompt_catalogs`` pour caractéristiques / compétences / traits, puis
``PromptEngine.build_prompt``. Seule différence : les instructions de scène portent
l'historique du chemin (``dialogue_path_context``) et la consigne du nœud à écrire.

Le contexte est résolu **une fois** par requête ; ``render`` ne fait qu'assembler le
prompt XML autour du corps propre à chaque appel LLM (un choix, une issue de test…).
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from constants import Defaults
from core.context.context_builder import ContextBuilder
from core.prompt.prompt_engine import PromptEngine, PromptInput
from services.prompt_catalog_loader import load_prompt_catalogs
from services.skill_catalog_service import SkillCatalogService
from services.trait_catalog_service import TraitCatalogService

logger = logging.getLogger(__name__)

# (corps des instructions, plafond de choix transmis au LLM) -> prompt complet.
# Plafond ``None`` = mode libre (2 à 8 choix), ``0`` = feuille.
PromptRenderer = Callable[[str, Optional[int]], str]


@dataclass(frozen=True)
class GraphPromptContext:
    """Contexte GDD structuré et catalogues, résolus pour une requête de génération."""

    prompt_engine: PromptEngine
    structured_context: Any
    npc_speaker_id: str
    player_character_id: str
    skills_list: List[str]
    attributes_list: List[str]
    traits_list: List[str]
    scene_location: Optional[Dict[str, Any]] = None
    narrative_tags: Optional[List[str]] = None
    author_profile: Optional[str] = None
    max_context_tokens: int = Defaults.CONTEXT_TOKENS
    llm_model_identifier: Optional[str] = None

    def render(self, body: str, max_choices: Optional[int]) -> str:
        """Assemble le prompt complet (contrat, catalogues, contexte GDD, scène).

        Args:
            body: Historique du chemin + consigne du nœud (section instructions de scène).
            max_choices: Plafond de choix envoyé au LLM (``None`` = libre, ``0`` = feuille).

        Returns:
            Prompt XML identique en structure à celui du flux « Générer ».
        """
        built = self.prompt_engine.build_prompt(
            PromptInput(
                user_instructions=body,
                npc_speaker_id=self.npc_speaker_id,
                player_character_id=self.player_character_id,
                skills_list=self.skills_list,
                attributes_list=self.attributes_list,
                traits_list=self.traits_list,
                structured_context=self.structured_context,
                scene_location=self.scene_location,
                choices_mode="free" if max_choices is None else "capped",
                max_choices=max_choices,
                narrative_tags=self.narrative_tags,
                author_profile=self.author_profile,
                max_context_tokens=self.max_context_tokens,
                llm_model_identifier=self.llm_model_identifier,
            )
        )
        return built.raw_prompt


class GraphPromptContextFactory:
    """Résout le contexte GDD et les catalogues d'une génération de nœud de graphe."""

    def __init__(
        self,
        context_builder: ContextBuilder,
        prompt_engine: PromptEngine,
        skill_service: SkillCatalogService,
        trait_service: TraitCatalogService,
    ) -> None:
        """Injecte les services partagés avec le flux « Générer ».

        Args:
            context_builder: Constructeur de contexte GDD (singleton du container).
            prompt_engine: Moteur de prompt (singleton du container).
            skill_service: Catalogue des compétences.
            trait_service: Catalogue des traits.
        """
        self._context_builder = context_builder
        self._prompt_engine = prompt_engine
        self._skill_service = skill_service
        self._trait_service = trait_service

    def default_system_prompt(self) -> str:
        """System prompt du flux « Générer » (``config/system_prompts``), pour le graphe aussi.

        Sans lui, le graphe retombait sur le gabarit générique de ``llm_config.json``.
        """
        return self._prompt_engine.system_prompt_template

    def build(
        self,
        context_selections: Dict[str, Any],
        *,
        npc_speaker_id: str,
        player_character_id: str,
        scene_instruction: str,
        narrative_tags: Optional[List[str]] = None,
        author_profile: Optional[str] = None,
        llm_model_identifier: Optional[str] = None,
        max_context_tokens: int = Defaults.CONTEXT_TOKENS,
    ) -> GraphPromptContext:
        """Construit le contexte (bloquant : à appeler hors boucle event).

        Args:
            context_selections: Sélection déjà enrichie pour la scène (PJ, PNJ, extrait).
            npc_speaker_id: PNJ qui parle dans ``line``.
            player_character_id: PJ qui parle dans ``choices``.
            scene_instruction: Consigne de l'auteur (sert au tri du contexte).
            narrative_tags: Tags de ton éventuels.
            author_profile: Directives d'auteur éventuelles.
            llm_model_identifier: Modèle (comptage de tokens du prompt).
            max_context_tokens: Budget du bloc contexte GDD.

        Returns:
            Contexte prêt à être rendu autour de chaque corps de prompt.
        """
        from api.schemas.dialogue import ContextSelection

        selection = ContextSelection.model_validate(context_selections)
        service_dict = selection.to_service_dict()
        structured_context = self._context_builder.build_context_json_with_previous_dialogue(
            previous_dialogue_preview=None,
            selected_elements=service_dict,
            scene_instruction=scene_instruction,
            field_configs=None,
            organization_mode="narrative",
            max_tokens=max_context_tokens,
            include_dialogue_type=True,
            element_modes=service_dict.get("_element_modes"),
        )
        skills_list, attributes_list, traits_list = load_prompt_catalogs(
            self._skill_service, self._trait_service
        )
        logger.debug(
            "Contexte graphe résolu : PNJ=%s, PJ=%s, %d compétences, %d traits",
            npc_speaker_id,
            player_character_id,
            len(skills_list),
            len(traits_list),
        )
        return GraphPromptContext(
            prompt_engine=self._prompt_engine,
            structured_context=structured_context,
            npc_speaker_id=npc_speaker_id,
            player_character_id=player_character_id,
            skills_list=skills_list,
            attributes_list=attributes_list,
            traits_list=traits_list,
            scene_location=selection.scene_location,
            narrative_tags=narrative_tags,
            author_profile=author_profile,
            max_context_tokens=max_context_tokens,
            llm_model_identifier=llm_model_identifier,
        )


class MemoizedPromptContextFactory:
    """Même contrat que la fabrique, sans reconstruire deux fois le même contexte.

    Sert à estimer un lot : ses parents partagent presque toujours la fiche de scène.
    Durée de vie : une estimation (le GDD peut changer ensuite).
    """

    def __init__(self, factory: GraphPromptContextFactory) -> None:
        """Enveloppe la fabrique réelle."""
        self._factory = factory
        self._built: Dict[str, GraphPromptContext] = {}

    def default_system_prompt(self) -> str:
        """System prompt de la fabrique enveloppée."""
        return self._factory.default_system_prompt()

    def build(self, context_selections: Dict[str, Any], **kwargs: Any) -> GraphPromptContext:
        """Comme ``GraphPromptContextFactory.build``, mémorisé par arguments."""
        key = json.dumps(
            [context_selections, kwargs], sort_keys=True, ensure_ascii=False, default=str
        )
        if key not in self._built:
            self._built[key] = self._factory.build(context_selections, **kwargs)
        return self._built[key]

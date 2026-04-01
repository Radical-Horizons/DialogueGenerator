import logging
import json
import re
from typing import Optional, Any, Tuple, List, Dict, Union, Type
from pydantic import BaseModel
import uuid
import asyncio

from core.context.context_builder import ContextBuilder
from core.prompt.prompt_engine import PromptEngine
from core.llm.llm_client import ILLMClient
from services.context_truncator import cap_context_text_to_budget

logger = logging.getLogger(__name__)


class DialogueGenerationService:
    """Service de génération de dialogues pour Unity.
    
    Ce service orchestre la construction du contexte GDD et la génération
    de dialogues au format Unity JSON. Il coordonne ContextBuilder et PromptEngine
    pour produire les prompts nécessaires à la génération via LLM.
    
    Responsabilités principales :
    - Construction du résumé contextuel à partir des sélections GDD
    - Gestion des erreurs et restauration du prompt système
    - Extraction de JSON depuis les réponses LLM
    """
    def __init__(self, context_builder: ContextBuilder, prompt_engine: PromptEngine):
        """
        Initialise le service de génération de dialogues.
        
        Args:
            context_builder: Composant qui construit le contexte basé sur les sélections utilisateur
            prompt_engine: Composant qui construit les prompts pour le LLM
        """
        self.context_builder = context_builder
        self.prompt_engine = prompt_engine
        
        # Initialisation du logger
        self.logger = logging.getLogger(__name__)
        logger.info("DialogueGenerationService initialized.")

    def _build_context_summary(
        self,
        context_selections: Dict[str, Any],
        user_instructions: str,
        max_tokens: int,
        no_limit: bool = False,
        field_configs: Optional[Dict[str, List[str]]] = None,
        organization_mode: Optional[str] = None
    ) -> str:
        """Construit le résumé contextuel à partir des sélections et instructions utilisateur.
        
        Utilise ContextBuilder pour construire un contexte structuré en JSON,
        puis le sérialise en texte pour compatibilité avec l'ancienne signature.
        Si no_limit est True, max_tokens est ignoré (valeur très haute transmise).
        
        Args:
            context_selections: Sélections de contexte GDD (personnages, lieux, etc.).
            user_instructions: Instructions utilisateur pour la scène.
            max_tokens: Nombre maximum de tokens pour le contexte.
            no_limit: Si True, ignore la limite de tokens (utilise 999999).
            field_configs: Configuration optionnelle des champs à inclure par catégorie.
            organization_mode: Mode d'organisation du contexte (ex: "narrative", "default").
        
        Returns:
            Le contexte formaté en texte, prêt à être inclus dans le prompt LLM.
        """
        if no_limit:
            max_tokens = 999999
        # Log pour déboguer les personnages sélectionnés
        logger.debug(f"[_build_context_summary] context_selections reçu: {context_selections}")
        logger.debug(f"[_build_context_summary] characters dans context_selections: {context_selections.get('characters', [])}")
        
        # Extraire _element_modes si présent
        context_selections_payload = (
            dict(context_selections) if isinstance(context_selections, dict) else {}
        )
        element_modes = context_selections_payload.pop("_element_modes", None)
        
        # Utiliser build_context_json (obligatoire, plus de fallback)
        structured_context = self.context_builder.build_context_json(
            selected_elements=context_selections_payload,
            scene_instruction=user_instructions,
            field_configs=field_configs,
            organization_mode=organization_mode or "narrative",
            max_tokens=max_tokens,
            include_dialogue_type=True,
            element_modes=element_modes
        )
        # Sérialiser en texte pour compatibilité avec l'ancienne signature
        text = self.context_builder.serialize_context_to_text(structured_context)
        if no_limit:
            return text
        return cap_context_text_to_budget(text, max_tokens)

    def _restore_prompt_on_error(self, original_system_prompt: Optional[str]) -> None:
        """Restaure le prompt système original après une erreur.
        
        Utilisé pour réinitialiser le prompt système du PromptEngine
        si une opération a modifié temporairement le template et a échoué.
        
        Args:
            original_system_prompt: Le prompt système original à restaurer,
                ou None si aucun prompt à restaurer.
        """
        if original_system_prompt is not None:
            if hasattr(self.prompt_engine, 'system_prompt_template') and self.prompt_engine.system_prompt_template != original_system_prompt:
                self.prompt_engine.system_prompt_template = original_system_prompt
                logger.info("Original system prompt restored after operation or error.")
            elif not hasattr(self.prompt_engine, 'system_prompt_template'):
                 logger.warning("PromptEngine does not have system_prompt_template attribute during error recovery.")

    @staticmethod
    def _extract_balanced_json_object(fragment: str) -> Optional[str]:
        """Extrait le premier objet JSON équilibré ``{...}`` depuis un fragment."""
        start = fragment.find("{")
        if start < 0:
            return None
        depth = 0
        in_string = False
        escape = False
        quote_char = ""
        for i in range(start, len(fragment)):
            ch = fragment[i]
            if in_string:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == quote_char:
                    in_string = False
                continue
            if ch in ('"', "'"):
                in_string = True
                quote_char = ch
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return fragment[start : i + 1]
        return None

    def _extract_json_from_text(self, text: str) -> Optional[str]:
        """Extrait une chaîne JSON d'un texte pouvant contenir des blocs markdown.
        
        Recherche d'abord un JSON dans un bloc markdown (```json ... ``` ou ``` ... ```),
        puis le premier objet ``{...}`` équilibré dans le texte.
        
        Args:
            text: Le texte d'entrée à analyser.
        
        Returns:
            La chaîne JSON extraite, ou None si aucune n'est trouvée.
        """
        fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if fence:
            inner = fence.group(1).strip()
            balanced = self._extract_balanced_json_object(inner)
            if balanced:
                return balanced
        return self._extract_balanced_json_object(text)

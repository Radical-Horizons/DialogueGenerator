"""Orchestrateur pour génération Unity Dialogue (REST + SSE streaming).

Ce service encapsule toute la logique de génération Unity Dialogue,
permettant de l'utiliser à la fois pour l'endpoint REST et le streaming SSE.
"""
import logging
import asyncio
import numbers
import random
from typing import AsyncGenerator, Callable, Dict, Any, Optional
from dataclasses import dataclass

from services.dialogue_generation_service import DialogueGenerationService
from services.unity_dialogue_generation_service import UnityDialogueGenerationService
from core.prompt.prompt_engine import PromptEngine, PromptInput, BuiltPrompt
from services.skill_catalog_service import SkillCatalogService
from services.prompt_catalog_loader import load_prompt_catalogs
from services.trait_catalog_service import TraitCatalogService
from services.configuration_service import ConfigurationService
from services.llm_usage_service import LLMUsageService
from services.context_truncator import cap_context_text_to_budget
from services.scene_dramatis import enrich_context_selections_for_scene, resolve_scene_dramatis
from services.scene_instruction_loader import augment_first_meeting_instructions
from services.dialogue_dramatic_progression import (
    DEFAULT_PROGRESSION_MAX_DEPTH,
    compose_generation_instructions,
)
from services.json_renderer.unity_json_renderer import UnityJsonRenderer
from services.unity_node_validation_service import infer_choices_mode
from api.schemas.dialogue import GenerateUnityDialogueRequest, GenerateUnityDialogueResponse
from api.exceptions import InternalServerException, ValidationException
from factories.llm_factory import LLMClientFactory
from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse

logger = logging.getLogger(__name__)


def _llm_max_choices_for_request(request_data: GenerateUnityDialogueRequest) -> Optional[int]:
    """Plafond LLM aligné UI (free → None sauf feuille max_choices=0)."""
    mode = infer_choices_mode(request_data.choices_mode, request_data.max_choices)
    if request_data.max_choices == 0:
        return 0
    if mode == "free":
        return None
    return request_data.max_choices


def _coerce_context_text(summary: object) -> str:
    """Convertit le résumé de contexte en ``str`` (mocks de tests inclus)."""
    if isinstance(summary, str):
        return summary
    if summary is None:
        return ""
    return str(summary)


def _safe_int_usage(value: object, default: int = 0) -> int:
    """Retourne un entier d'usage LLM ; ignore les mocks et types non numériques."""
    if isinstance(value, numbers.Integral) and not isinstance(value, bool):
        return int(value)
    if isinstance(value, numbers.Real) and not isinstance(value, bool):
        return int(value)
    return default


def _safe_float_cost(value: object, default: float = 0.0) -> float:
    """Retourne un coût numérique ; ignore les mocks et types non numériques."""
    if isinstance(value, numbers.Real) and not isinstance(value, bool):
        return float(value)
    return default


@dataclass
class GenerationEvent:
    """Événement de génération pour SSE streaming.
    
    Représente un événement émis pendant le processus de génération
    de dialogue Unity, utilisé pour le streaming Server-Sent Events (SSE).
    
    Attributes:
        type: Type d'événement. Valeurs possibles :
            - 'step' : Étape de progression (ex: 'Prompting', 'Generating', 'Validating')
            - 'metadata' : Métadonnées de génération (tokens, coût, etc.)
            - 'chunk' : Chunk de contenu streamé (texte ou JSON delta)
            - 'complete' : Génération terminée avec résultat
            - 'error' : Erreur survenue pendant la génération
        data: Données associées à l'événement, format dépendant du type.
    """
    type: str
    data: Dict[str, Any]


class UnityDialogueOrchestrator:
    """Orchestrateur pour génération Unity Dialogue (REST + SSE).
    
    Encapsule toute la logique de génération Unity Dialogue, permettant
    de l'utiliser à la fois pour l'endpoint REST et le streaming SSE.
    """
    
    def __init__(
        self,
        dialogue_service: DialogueGenerationService,
        prompt_engine: PromptEngine,
        skill_service: SkillCatalogService,
        trait_service: TraitCatalogService,
        config_service: ConfigurationService,
        usage_service: LLMUsageService,
        request_id: str,
        unity_generation_service: Optional[UnityDialogueGenerationService] = None,
    ):
        """Initialise l'orchestrateur avec toutes les dépendances.
        
        Args:
            dialogue_service: Service de génération de dialogue.
            prompt_engine: Moteur de construction de prompts.
            skill_service: Service de catalogue des compétences.
            trait_service: Service de catalogue des traits.
            config_service: Service de configuration.
            usage_service: Service de tracking usage LLM.
            request_id: ID de la requête pour logging.
            unity_generation_service: Service de génération Unity (injecté par le container).
        """
        self.dialogue_service = dialogue_service
        self.prompt_engine = prompt_engine
        self.skill_service = skill_service
        self.trait_service = trait_service
        self.config_service = config_service
        self.usage_service = usage_service
        self.request_id = request_id
        self._unity_generation_service = unity_generation_service
    
    async def generate_with_events(
        self,
        request_data: GenerateUnityDialogueRequest,
        check_cancelled: Callable[[], bool]
    ) -> AsyncGenerator[GenerationEvent, None]:
        """Génère avec yield d'événements SSE.
        
        Args:
            request_data: Paramètres de génération Unity Dialogue.
            check_cancelled: Fonction pour vérifier si la génération a été annulée.
            
        Yields:
            GenerationEvent: Événements de progression (step, metadata, complete, error).
        """
        try:
            # Étape 1: Prompting
            yield GenerationEvent(type='step', data={'step': 'Prompting'})
            
            if check_cancelled():
                yield GenerationEvent(type='error', data={'message': 'Génération annulée', 'code': 'cancelled'})
                return
            
            # 1. Résoudre PJ/PNJ et enrichir le contexte GDD (fiches + aléatoire excerpt)
            context_builder = self.dialogue_service.context_builder
            character_catalog = context_builder.get_characters_names()
            dramatis = resolve_scene_dramatis(
                player_character_id=request_data.player_character_id,
                npc_speaker_id=request_data.npc_speaker_id,
                context_selections=request_data.context_selections.model_dump(),
                character_catalog=character_catalog,
            )
            context_seed = getattr(request_data, "context_seed", None)
            enriched_context = enrich_context_selections_for_scene(
                request_data.context_selections,
                dramatis,
                character_catalog=character_catalog,
                random_excerpt_count=1,
                rng=random.Random(context_seed) if context_seed is not None else None,
                context_builder=context_builder,
            )
            context_selections_dict = enriched_context.to_service_dict()
            all_characters = context_selections_dict.get("characters", [])
            if not all_characters:
                raise ValidationException(
                    message="Au moins un personnage doit être sélectionné",
                    request_id=self.request_id,
                )
            npc_speaker_id = dramatis.npc_speaker_id
            player_character_id = dramatis.player_character_id

            raw_scene_instructions = (request_data.user_instructions or "").strip()
            if request_data.scene_type == "first_meeting" and (
                "--- Référence canonique" not in raw_scene_instructions
            ):
                raw_scene_instructions = augment_first_meeting_instructions(
                    raw_scene_instructions,
                    npc_speaker_id=npc_speaker_id,
                    context_builder=context_builder,
                )

            scene_instruction = compose_generation_instructions(
                raw_scene_instructions,
                depth=0,
                max_depth=DEFAULT_PROGRESSION_MAX_DEPTH,
                is_start=True,
                scene_type=request_data.scene_type,
            )
            
            # 2. Charger catalogues (services injectés)
            skills_list, attributes_list, traits_list = load_prompt_catalogs(
                self.skill_service, self.trait_service
            )
            
            # 3. Construire le contexte GDD (JSON obligatoire, plus de fallback)
            if request_data.previous_dialogue_preview:
                context_builder.set_previous_dialogue_context(request_data.previous_dialogue_preview)
            
            structured_context = context_builder.build_context_json(
                selected_elements=context_selections_dict,
                scene_instruction=scene_instruction,
                field_configs=None,
                organization_mode=request_data.organization_mode or "narrative",
                max_tokens=request_data.max_context_tokens,
                include_dialogue_type=True,
                element_modes=context_selections_dict.get("_element_modes")
            )
            # Sérialiser en texte pour le LLM, puis appliquer le plafond utilisateur (budget contexte)
            serialized_context = _coerce_context_text(
                context_builder.serialize_context_to_text(structured_context)
            )
            all_character_names = context_selections_dict.get("characters") or []
            context_summary = cap_context_text_to_budget(
                serialized_context,
                request_data.max_context_tokens,
                protect_entity_names=[npc_speaker_id] if npc_speaker_id else None,
                all_entity_names=all_character_names,
            )
            
            # 4. Construire le prompt Unity via le builder unique
            prompt_input = PromptInput(
                user_instructions=scene_instruction,
                npc_speaker_id=npc_speaker_id,
                player_character_id=player_character_id,
                skills_list=skills_list,
                attributes_list=attributes_list,
                traits_list=traits_list,
                context_summary=context_summary,
                structured_context=structured_context,
                scene_location=enriched_context.scene_location,
                max_choices=request_data.max_choices,
                choices_mode=request_data.choices_mode,
                narrative_tags=request_data.narrative_tags,
                author_profile=request_data.author_profile,
                game_rules=request_data.game_rules,
                vocabulary_config=request_data.vocabulary_config,
                include_narrative_guides=request_data.include_narrative_guides,
                in_game_flags=request_data.in_game_flags,
                max_context_tokens=request_data.max_context_tokens,
                llm_model_identifier=request_data.llm_model_identifier,
            )
            
            built = self.prompt_engine.build_prompt(prompt_input)
            prompt = built.raw_prompt
            prompt_hash = built.prompt_hash
            estimated_tokens = built.token_count
            
            # Étape 2: Generating
            yield GenerationEvent(type='step', data={'step': 'Generating'})
            
            if check_cancelled():
                yield GenerationEvent(type='error', data={'message': 'Génération annulée', 'code': 'cancelled'})
                return
            
            # 6. Créer le client LLM (avec fallback si configuré, Story 1.16)
            fallback_chain = self.config_service.get_llm_fallback_chain()
            if not isinstance(fallback_chain, list):
                fallback_chain = []
            try:
                if len(fallback_chain) >= 2 and fallback_chain[0] == request_data.llm_model_identifier:
                    llm_client = LLMClientFactory.create_client_with_fallback(
                        primary_model_id=request_data.llm_model_identifier,
                        fallback_model_ids=fallback_chain[1:],
                        config=self.config_service.get_llm_config(),
                        available_models=self.config_service.get_available_llm_models(),
                        usage_service=self.usage_service,
                        request_id=self.request_id,
                        endpoint="generate/unity-dialogue",
                    )
                else:
                    llm_client = LLMClientFactory.create_client(
                        model_id=request_data.llm_model_identifier,
                        config=self.config_service.get_llm_config(),
                        available_models=self.config_service.get_available_llm_models(),
                        usage_service=self.usage_service,
                        request_id=self.request_id,
                        endpoint="generate/unity-dialogue",
                    )
            except ValueError as client_error:
                yield GenerationEvent(
                    type='error',
                    data={
                        'message': str(client_error),
                        'code': 'llm_client_unavailable',
                    },
                )
                return
            
            # Configurer max_tokens : utiliser la valeur fournie ou la valeur par défaut
            from constants import Defaults
            if request_data.max_completion_tokens is not None:
                llm_client.max_tokens = request_data.max_completion_tokens
            else:
                # Utiliser la valeur par défaut si non spécifiée
                llm_client.max_tokens = Defaults.DEFAULT_MAX_COMPLETION_TOKENS
            
            # Configurer le reasoning effort si fourni (uniquement pour GPT-5.2)
            if request_data.reasoning_effort is not None:
                llm_client.reasoning_effort = request_data.reasoning_effort
            
            # Configurer le reasoning summary si fourni (uniquement "auto" supporté)
            if request_data.reasoning_summary is not None:
                llm_client.reasoning_summary = request_data.reasoning_summary
            
            # Configurer top_p si fourni
            if request_data.top_p is not None:
                llm_client.top_p = request_data.top_p
            
            # 7. Générer via Structured Output avec streaming natif
            unity_service = self._unity_generation_service or UnityDialogueGenerationService()
            
            # Vérifier si le client supporte le streaming natif
            # NOTE: `hasattr(mock, "generate_variants_streaming")` retourne True avec unittest.mock,
            # ce qui fait basculer à tort en mode streaming dans certains tests.
            # On exige donc une callable async (coroutine ou async generator).
            import inspect
            streaming_attr = getattr(llm_client, 'generate_variants_streaming', None)
            has_streaming = (
                streaming_attr is not None
                and callable(streaming_attr)
                and (inspect.isasyncgenfunction(streaming_attr) or asyncio.iscoroutinefunction(streaming_attr))
            )
            
            if has_streaming:
                # Utiliser le streaming natif
                logger.info("Utilisation du streaming natif Responses API")
                generation_response = None
                sequence_counter = 0
                
                # Importer StreamChunk pour le type checking
                from core.llm.openai.stream_parser import StreamChunk
                
                # Générer avec streaming - les chunks sont yieldés directement
                async for item in llm_client.generate_variants_streaming(
                    prompt=prompt,
                    k=1,
                    response_model=UnityDialogueGenerationResponse,
                    user_system_prompt_override=request_data.system_prompt_override,
                ):
                    if check_cancelled():
                        yield GenerationEvent(type='error', data={'message': 'Génération annulée', 'code': 'cancelled'})
                        return
                    
                    # Vérifier si c'est un chunk de streaming ou le résultat final
                    if isinstance(item, StreamChunk):
                        # Convertir les chunks du stream parser en GenerationEvent
                        if item.event_type == "response.output_text.delta":
                            # Chunk de texte
                            text_delta = item.data.get("text", "")
                            if text_delta:
                                yield GenerationEvent(
                                    type='chunk',
                                    data={'content': text_delta, 'sequence': sequence_counter}
                                )
                                sequence_counter += 1
                        
                        elif item.event_type == "response.function_call_arguments.delta":
                            # Chunk de function call (structured output) - streamer le delta JSON brut caractère par caractère
                            delta = item.data.get("delta", "")
                            if delta:
                                # Streamer le delta JSON pour feedback visuel (caractère par caractère)
                                yield GenerationEvent(
                                    type='chunk',
                                    data={'content': delta, 'sequence': sequence_counter, 'type': 'function_call_delta'}
                                )
                                sequence_counter += 1
                        
                        elif item.event_type == "response.reasoning_text.delta":
                            # Chunk de reasoning - optionnel, peut être ignoré ou streamé séparément
                            delta = item.data.get("delta", "")
                            if delta:
                                # Streamer le reasoning pour feedback (optionnel)
                                logger.debug(f"Reasoning delta: {delta[:50]}...")
                        
                        elif item.event_type == "response.completed":
                            # Réponse complète - sera traitée après le stream
                            pass
                        
                        elif item.event_type == "response.failed":
                            # Erreur
                            error_data = item.data.get("error", {})
                            yield GenerationEvent(type='error', data={'message': str(error_data), 'code': 'api_error'})
                            return
                    
                    elif isinstance(item, UnityDialogueGenerationResponse):
                        # Le résultat final arrive à la fin du stream
                        generation_response = item
                    elif isinstance(item, str):
                        # Vérifier si c'est une erreur
                        if item.startswith("Erreur:") or item.startswith("Erreur "):
                            logger.error(f"Erreur dans la génération: {item}")
                            yield GenerationEvent(type='error', data={'message': item, 'code': 'generation_error'})
                            return
                        else:
                            # Chaîne inattendue
                            logger.warning(f"Chaîne inattendue reçue du stream: {item[:200]}")
                
                if not generation_response:
                    logger.error("Aucune réponse générée après le stream complet")
                    yield GenerationEvent(type='error', data={'message': 'Aucune réponse générée', 'code': 'no_response'})
                    return
                generation_response = unity_service.normalize_generation_response(
                    generation_response,
                    max_choices=_llm_max_choices_for_request(request_data),
                )
            else:
                # Fallback vers méthode non-streaming (pour DummyLLMClient, MistralClient, etc.)
                logger.info("Client ne supporte pas le streaming natif, utilisation de la méthode standard")
                generation_response = await unity_service.generate_dialogue_node(
                    llm_client=llm_client,
                    prompt=prompt,
                    system_prompt_override=request_data.system_prompt_override,
                    max_choices=_llm_max_choices_for_request(request_data),
                )
            
            if check_cancelled():
                yield GenerationEvent(type='error', data={'message': 'Génération annulée', 'code': 'cancelled'})
                return
            
            # 8. Enrichir et normaliser
            # FIX: Envoyer 'Validating' APRÈS l'enrichissement pour que l'utilisateur voie la validation en cours
            # (Les opérations synchrones peuvent bloquer le générateur async, donc on envoie l'événement après)
            enriched_nodes = unity_service.enrich_with_ids(content=generation_response, start_id="START")
            renderer = UnityJsonRenderer()
            json_content = renderer.render_unity_nodes(nodes=enriched_nodes, normalize=True)
            
            # Étape 3: Validating (après enrichissement pour garantir l'ordre d'envoi)
            yield GenerationEvent(type='step', data={'step': 'Validating'})
            
            if check_cancelled():
                yield GenerationEvent(type='error', data={'message': 'Génération annulée', 'code': 'cancelled'})
                return
            
            # 9. Extraire le titre
            dialogue_title = generation_response.title if hasattr(generation_response, 'title') else None
            
            # Convertir structured_prompt en dict pour la réponse
            structured_prompt_dict = None
            if built.structured_prompt:
                try:
                    structured_prompt_dict = built.structured_prompt.model_dump()
                except Exception as e:
                    logger.warning(f"Erreur lors de la conversion du structured_prompt en dict: {e}")
            
            # Extraire le reasoning trace du client LLM si disponible
            reasoning_trace = getattr(llm_client, 'reasoning_trace', None)
            
            cost = _safe_float_cost(getattr(llm_client, "last_call_cost", 0.0), 0.0)
            usage_pt = _safe_int_usage(getattr(llm_client, "last_usage_prompt_tokens", 0), 0)
            usage_ct = _safe_int_usage(getattr(llm_client, "last_usage_completion_tokens", 0), 0)
            
            # Metadata (Story 1.16: fallback si utilisé)
            metadata_data: Dict[str, Any] = {
                "tokens": estimated_tokens,
                "prompt_tokens_estimated": estimated_tokens,
                "usage_prompt_tokens": usage_pt,
                "usage_completion_tokens": usage_ct,
                "cost_usd": cost,
                "cost": cost,
            }
            fallback_info = getattr(llm_client, '_last_used_fallback', None)
            if fallback_info and isinstance(fallback_info, (list, tuple)) and len(fallback_info) >= 2:
                metadata_data['used_fallback'] = True
                metadata_data['fallback_from'] = fallback_info[0]
                metadata_data['fallback_to'] = fallback_info[1]
            yield GenerationEvent(type='metadata', data=metadata_data)
            
            # Étape 4: Complete
            result = GenerateUnityDialogueResponse(
                json_content=json_content,
                title=dialogue_title,
                raw_prompt=prompt,
                prompt_hash=prompt_hash,
                estimated_tokens=estimated_tokens,
                warning=getattr(llm_client, 'warning', None),
                structured_prompt=structured_prompt_dict,
                reasoning_trace=reasoning_trace
            )
            
            yield GenerationEvent(type='complete', data={'result': result.model_dump(mode='json')})
            
        except ValidationException:
            # Re-raise ValidationException sans modification
            raise
        except Exception as e:
            logger.exception(f"Erreur génération Unity (request_id: {self.request_id}): {e}")
            yield GenerationEvent(type='error', data={'message': str(e)})
    
    async def generate(
        self,
        request_data: GenerateUnityDialogueRequest
    ) -> GenerateUnityDialogueResponse:
        """Génère sans streaming (usage REST).
        
        Args:
            request_data: Paramètres de génération Unity Dialogue.
            
        Returns:
            GenerateUnityDialogueResponse: Réponse avec dialogue Unity JSON.
            
        Raises:
            ValidationException: Si validation échoue.
            InternalServerException: Si génération échoue.
        """
        result = None
        error_message = None
        
        async for event in self.generate_with_events(request_data, lambda: False):
            if event.type == 'complete':
                result = GenerateUnityDialogueResponse(**event.data['result'])
            elif event.type == 'error':
                error_message = event.data['message']
        
        if result is None:
            if error_message:
                raise InternalServerException(message=error_message, request_id=self.request_id)
            else:
                raise InternalServerException(
                    message="Génération échouée sans résultat",
                    request_id=self.request_id
                )
        
        return result

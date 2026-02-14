"""Orchestrateur pour génération Unity Dialogue (REST + SSE streaming).

Ce service encapsule toute la logique de génération Unity Dialogue,
permettant de l'utiliser à la fois pour l'endpoint REST et le streaming SSE.
"""
import logging
import asyncio
from typing import AsyncGenerator, Callable, Dict, Any, Optional
from dataclasses import dataclass

from services.dialogue_generation_service import DialogueGenerationService
from core.prompt.prompt_engine import PromptEngine, PromptInput, BuiltPrompt
from services.skill_catalog_service import SkillCatalogService
from services.trait_catalog_service import TraitCatalogService
from services.configuration_service import ConfigurationService
from services.llm_usage_service import LLMUsageService
from services.unity_dialogue_generation_service import UnityDialogueGenerationService
from services.json_renderer.unity_json_renderer import UnityJsonRenderer
from api.schemas.dialogue import GenerateUnityDialogueRequest, GenerateUnityDialogueResponse
from api.exceptions import InternalServerException, ValidationException
from factories.llm_factory import LLMClientFactory
from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse

logger = logging.getLogger(__name__)


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
        request_id: str
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
        """
        self.dialogue_service = dialogue_service
        self.prompt_engine = prompt_engine
        self.skill_service = skill_service
        self.trait_service = trait_service
        self.config_service = config_service
        self.usage_service = usage_service
        self.request_id = request_id
    
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
            
            # 1. Convertir ContextSelection en dict
            context_selections_dict = request_data.context_selections.to_service_dict()
            all_characters = context_selections_dict.get('characters', [])
            if not all_characters:
                raise ValidationException(
                    message="Au moins un personnage doit être sélectionné",
                    request_id=self.request_id
                )
            
            # 2. Déterminer le PNJ interlocuteur
            npc_speaker_id = request_data.npc_speaker_id or all_characters[0]
            
            # 3. Charger catalogues (services injectés)
            skills_list = []
            try:
                skills_list = self.skill_service.load_skills()
            except Exception as e:
                logger.warning(
                    f"Erreur lors du chargement des compétences (request_id: {self.request_id}): {e}",
                    exc_info=True
                )
                # Continuer avec une liste vide si le chargement échoue
            
            traits_list = []
            try:
                traits_list = self.trait_service.get_trait_labels()
            except Exception as e:
                logger.warning(
                    f"Erreur lors du chargement des traits (request_id: {self.request_id}): {e}",
                    exc_info=True
                )
                # Continuer avec une liste vide si le chargement échoue
            
            # 4. Construire le contexte GDD (JSON obligatoire, plus de fallback)
            context_builder = self.dialogue_service.context_builder
            if request_data.previous_dialogue_preview:
                context_builder.set_previous_dialogue_context(request_data.previous_dialogue_preview)
            
            structured_context = context_builder.build_context_json(
                selected_elements=context_selections_dict,
                scene_instruction=request_data.user_instructions,
                field_configs=None,
                organization_mode="narrative",
                max_tokens=request_data.max_context_tokens,
                include_dialogue_type=True,
                element_modes=context_selections_dict.get("_element_modes")
            )
            # Sérialiser en texte pour le LLM
            context_summary = context_builder._context_serializer.serialize_to_text(structured_context)
            
            # 5. Construire le prompt Unity via le builder unique
            prompt_input = PromptInput(
                user_instructions=request_data.user_instructions,
                npc_speaker_id=npc_speaker_id,
                player_character_id="URESAIR",
                skills_list=skills_list,
                traits_list=traits_list,
                context_summary=context_summary,
                structured_context=structured_context,
                scene_location=request_data.context_selections.scene_location,
                max_choices=request_data.max_choices,
                choices_mode=request_data.choices_mode,
                narrative_tags=request_data.narrative_tags,
                author_profile=request_data.author_profile,
                vocabulary_config=request_data.vocabulary_config,
                include_narrative_guides=request_data.include_narrative_guides,
                in_game_flags=request_data.in_game_flags
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
            
            # 6. Créer le client LLM
            llm_client = LLMClientFactory.create_client(
                model_id=request_data.llm_model_identifier,
                config=self.config_service.get_llm_config(),
                available_models=self.config_service.get_available_llm_models(),
                usage_service=self.usage_service,
                request_id=self.request_id,
                endpoint="generate/unity-dialogue"
            )
            
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
            unity_service = UnityDialogueGenerationService()
            
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
            else:
                # Fallback vers méthode non-streaming (pour DummyLLMClient, MistralClient, etc.)
                logger.info("Client ne supporte pas le streaming natif, utilisation de la méthode standard")
                generation_response = await unity_service.generate_dialogue_node(
                    llm_client=llm_client,
                    prompt=prompt,
                    system_prompt_override=request_data.system_prompt_override,
                    max_choices=request_data.max_choices
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
            
            # Calculer le coût (si disponible)
            cost = 0.0
            if hasattr(llm_client, 'last_call_cost'):
                cost = llm_client.last_call_cost or 0.0
            elif hasattr(self.usage_service, 'get_last_call_cost'):
                cost = self.usage_service.get_last_call_cost() or 0.0
            
            # Metadata
            yield GenerationEvent(type='metadata', data={
                'tokens': estimated_tokens,
                'cost': cost
            })
            
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

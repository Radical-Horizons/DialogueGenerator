"""Router pour la génération de dialogues."""
import logging
import re
import json
from pathlib import Path
from typing import Annotated, Dict, Any
from fastapi import APIRouter, Depends, Request, status
from starlette.requests import Request
from api.schemas.dialogue import (
    EstimateTokensRequest,
    EstimateTokensResponse,
    PreviewPromptRequest,
    PreviewPromptResponse,
    GenerateUnityDialogueRequest,
    GenerateUnityDialogueResponse,
    ExportUnityDialogueRequest,
    ExportUnityDialogueResponse
)
from pydantic import BaseModel, Field
from api.dependencies import (
    get_dialogue_generation_service,
    get_request_id,
    get_prompt_engine,
    get_config_service,
    get_skill_catalog_service,
    get_trait_catalog_service
)
from core.prompt.prompt_engine import PromptEngine, PromptInput, BuiltPrompt
from api.exceptions import InternalServerException, ValidationException, NotFoundException, OpenAIException
from services.dialogue_generation_service import DialogueGenerationService
from services.configuration_service import ConfigurationService
from services.skill_catalog_service import SkillCatalogService
from services.trait_catalog_service import TraitCatalogService
from services.unity_dialogue_export_service import write_unity_dialogue_to_file
from core.llm.llm_client import ILLMClient

logger = logging.getLogger(__name__)

router = APIRouter()


def _transform_openai_error(error: Exception, request_id: str) -> OpenAIException:
    """Transforme une erreur OpenAI en exception API standardisée.
    
    Args:
        error: L'exception OpenAI.
        request_id: ID de la requête.
        
    Returns:
        OpenAIException avec code et message appropriés.
    """
    error_str = str(error).lower()
    error_type = type(error).__name__
    
    # Détecter le type d'erreur OpenAI
    if "rate limit" in error_str or "429" in error_str:
        return OpenAIException(
            code="OPENAI_RATE_LIMIT",
            message="Limite de taux OpenAI atteinte. Veuillez réessayer plus tard.",
            details={"error_type": error_type, "error_message": str(error)},
            request_id=request_id
        )
    elif "timeout" in error_str or "timed out" in error_str:
        return OpenAIException(
            code="OPENAI_TIMEOUT",
            message="Délai d'attente OpenAI dépassé. Veuillez réessayer.",
            details={"error_type": error_type, "error_message": str(error)},
            request_id=request_id
        )
    elif "invalid" in error_str or "400" in error_str:
        return OpenAIException(
            code="OPENAI_INVALID_REQUEST",
            message="Requête invalide vers OpenAI. Vérifiez les paramètres.",
            details={"error_type": error_type, "error_message": str(error)},
            request_id=request_id
        )
    else:
        # Erreur générique OpenAI
        return OpenAIException(
            code="OPENAI_ERROR",
            message="Erreur lors de l'appel à OpenAI",
            details={"error_type": error_type, "error_message": str(error)},
            request_id=request_id
        )


# NOTE: L'endpoint /generate/interactions a été supprimé. Utiliser /generate/unity-dialogue à la place.


def _build_prompt_from_request(
    request_data: EstimateTokensRequest,
    dialogue_service: DialogueGenerationService,
    prompt_engine: PromptEngine,
    skill_service: SkillCatalogService,
    trait_service: TraitCatalogService
) -> BuiltPrompt:
    """Fonction helper pour construire un prompt à partir d'une requête.
    
    Args:
        request_data: Données de la requête (sélections, instructions).
        dialogue_service: Service de dialogue.
        prompt_engine: Moteur de prompt.
        skill_service: Service de catalogue des compétences injecté.
        trait_service: Service de catalogue des traits injecté.
        
    Returns:
        BuiltPrompt contenant le prompt construit.
        
    Raises:
        ValueError: Si le XML généré est invalide.
    """
    # 1. Convertir ContextSelection en dict
    context_selections_dict = request_data.context_selections.to_service_dict()
    
    # 2. Charger catalogues (skills/traits) pour injection
    skills_list = []
    try:
        skills_list = skill_service.load_skills()
    except Exception as e:
        logger.warning(f"Erreur lors du chargement des compétences: {e}", exc_info=True)
        # Continuer avec une liste vide si le chargement échoue
    
    traits_list = []
    try:
        traits_list = trait_service.get_trait_labels()
    except Exception as e:
        logger.warning(f"Erreur lors du chargement des traits: {e}", exc_info=True)
        # Continuer avec une liste vide si le chargement échoue

    # 3. Déterminer le PNJ speaker
    npc_speaker_id = request_data.npc_speaker_id
    all_characters = context_selections_dict.get('characters', [])
    if not npc_speaker_id and all_characters:
        npc_speaker_id = all_characters[0]
    elif not npc_speaker_id:
        npc_speaker_id = "PNJ"

    # 4. Construire le contexte GDD via ContextBuilder
    context_builder = dialogue_service.context_builder
    if request_data.previous_dialogue_preview:
        context_builder.set_previous_dialogue_context(request_data.previous_dialogue_preview)
    
    # Construire le contexte JSON (obligatoire, plus de fallback)
    structured_context = context_builder.build_context_json(
        selected_elements=context_selections_dict,
        scene_instruction=request_data.user_instructions,
        field_configs=request_data.field_configs,
        organization_mode=request_data.organization_mode or "narrative",
        max_tokens=request_data.max_context_tokens,
        include_dialogue_type=True,
        element_modes=context_selections_dict.get("_element_modes")
    )
    # Sérialiser en texte pour le LLM
    context_text = context_builder._context_serializer.serialize_to_text(structured_context)

    # 5. Construire le prompt unifié via le builder unique (PromptInput)
    prompt_input = PromptInput(
        user_instructions=request_data.user_instructions,
        npc_speaker_id=npc_speaker_id,
        player_character_id="URESAIR",
        skills_list=skills_list,
        traits_list=traits_list,
        context_summary=context_text,
        structured_context=structured_context,
        scene_location=request_data.context_selections.scene_location,
        max_choices=request_data.max_choices,
        choices_mode=request_data.choices_mode,
        narrative_tags=request_data.narrative_tags,
        author_profile=request_data.author_profile,
        vocabulary_config=request_data.vocabulary_config,
        include_narrative_guides=request_data.include_narrative_guides,
        in_game_flags=request_data.in_game_flags  # Ajouter les flags
    )
    
    return prompt_engine.build_prompt(prompt_input)


@router.post(
    "/preview-prompt",
    response_model=PreviewPromptResponse,
    status_code=status.HTTP_200_OK
)
async def preview_prompt(
    request_data: PreviewPromptRequest,
    request: Request,
    dialogue_service: Annotated[DialogueGenerationService, Depends(get_dialogue_generation_service)],
    prompt_engine: Annotated[PromptEngine, Depends(get_prompt_engine)],
    skill_service: Annotated[SkillCatalogService, Depends(get_skill_catalog_service)],
    trait_service: Annotated[TraitCatalogService, Depends(get_trait_catalog_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> PreviewPromptResponse:
    """Prévisualise le prompt brut construit sans estimer les tokens.
    
    Cet endpoint est dédié à la prévisualisation du prompt avant génération.
    Pour estimer les tokens, utiliser /estimate-tokens à la place.
    
    Args:
        request_data: Données de la requête (sélections, instructions).
        request: La requête HTTP.
        dialogue_service: Service de dialogue injecté.
        prompt_engine: Moteur de prompt injecté.
        request_id: ID de la requête.
        
    Returns:
        Prompt brut construit (format XML) et sa structure JSON.
    """
    try:
        # Convertir PreviewPromptRequest en EstimateTokensRequest pour réutiliser la logique
        estimate_request = EstimateTokensRequest(
            context_selections=request_data.context_selections,
            user_instructions=request_data.user_instructions,
            npc_speaker_id=request_data.npc_speaker_id,
            max_context_tokens=request_data.max_context_tokens,
            system_prompt_override=request_data.system_prompt_override,
            author_profile=request_data.author_profile,
            max_choices=request_data.max_choices,
            choices_mode=request_data.choices_mode,
            narrative_tags=request_data.narrative_tags,
            vocabulary_config=request_data.vocabulary_config,
            include_narrative_guides=request_data.include_narrative_guides,
            previous_dialogue_preview=request_data.previous_dialogue_preview,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode,
            in_game_flags=request_data.in_game_flags  # Ajouter les flags
        )
        
        try:
            built = _build_prompt_from_request(estimate_request, dialogue_service, prompt_engine, skill_service, trait_service)
        except ValueError as xml_error:
            # Erreur XML détectée - récupérer les détails depuis l'exception
            if "XML invalide" in str(xml_error) and hasattr(xml_error, 'xml_error_details'):
                error_details = {
                    "error": str(xml_error),
                    "error_type": "XML_VALIDATION_ERROR",
                    "xml_error_details": xml_error.xml_error_details,
                    "raw_xml": getattr(xml_error, 'raw_xml', None)
                }
                logger.error(f"Erreur XML détaillée (request_id: {request_id}): {xml_error.xml_error_details}")
                raise InternalServerException(
                    message="Erreur lors de la construction du prompt: XML invalide généré",
                    details=error_details,
                    request_id=request_id
                )
            # Si pas de détails XML, re-lancer l'erreur originale
            raise
        
        # Convertir structured_prompt en dict pour la réponse
        structured_prompt_dict = None
        if built.structured_prompt:
            try:
                structured_prompt_dict = built.structured_prompt.model_dump()
            except Exception as e:
                logger.warning(f"Erreur lors de la conversion du structured_prompt en dict: {e}")

        return PreviewPromptResponse(
            raw_prompt=built.raw_prompt,
            prompt_hash=built.prompt_hash,
            structured_prompt=structured_prompt_dict
        )
        
    except ValidationException:
        # Re-raise les ValidationException telles quelles
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de la prévisualisation du prompt (request_id: {request_id}): {type(e).__name__}: {str(e)}")
        error_details = {
            "error": str(e),
            "error_type": type(e).__name__,
        }
        import sys
        import traceback
        if hasattr(sys, '_getframe'):
            error_details["traceback"] = traceback.format_exc()
        raise InternalServerException(
            message="Erreur lors de la prévisualisation du prompt",
            details=error_details,
            request_id=request_id
        )


@router.post(
    "/estimate-tokens",
    response_model=EstimateTokensResponse,
    status_code=status.HTTP_200_OK
)
async def estimate_tokens(
    request_data: EstimateTokensRequest,
    request: Request,
    dialogue_service: Annotated[DialogueGenerationService, Depends(get_dialogue_generation_service)],
    prompt_engine: Annotated[PromptEngine, Depends(get_prompt_engine)],
    skill_service: Annotated[SkillCatalogService, Depends(get_skill_catalog_service)],
    trait_service: Annotated[TraitCatalogService, Depends(get_trait_catalog_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> EstimateTokensResponse:
    """Estime le nombre de tokens pour un contexte donné.
    
    Args:
        request_data: Données de la requête (sélections, instructions).
        request: La requête HTTP.
        dialogue_service: Service de dialogue injecté.
        request_id: ID de la requête.
        
    Returns:
        Estimation du nombre de tokens et prompt brut réel.
    """
    try:
        # Construire le prompt en réutilisant la fonction helper
        try:
            built = _build_prompt_from_request(request_data, dialogue_service, prompt_engine, skill_service, trait_service)
        except ValueError as xml_error:
            # Erreur XML détectée - récupérer les détails depuis l'exception
            if "XML invalide" in str(xml_error) and hasattr(xml_error, 'xml_error_details'):
                error_details = {
                    "error": str(xml_error),
                    "error_type": "XML_VALIDATION_ERROR",
                    "xml_error_details": xml_error.xml_error_details,
                    "raw_xml": getattr(xml_error, 'raw_xml', None)
                }
                logger.error(f"Erreur XML détaillée (request_id: {request_id}): {xml_error.xml_error_details}")
                raise InternalServerException(
                    message="Erreur lors de l'estimation de tokens: XML invalide généré",
                    details=error_details,
                    request_id=request_id
                )
            # Si pas de détails XML, re-lancer l'erreur originale
            raise
        
        # Calculer context_tokens (tokens du contexte seul)
        context_builder = dialogue_service.context_builder
        context_selections_dict = request_data.context_selections.to_service_dict()
        if request_data.previous_dialogue_preview:
            context_builder.set_previous_dialogue_context(request_data.previous_dialogue_preview)
        
        structured_context = context_builder.build_context_json(
            selected_elements=context_selections_dict,
            scene_instruction=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
            max_tokens=request_data.max_context_tokens,
            include_dialogue_type=True,
            element_modes=context_selections_dict.get("_element_modes")
        )
        context_text = context_builder._context_serializer.serialize_to_text(structured_context)
        context_tokens = context_builder._count_tokens(context_text)
        
        # Convertir structured_prompt en dict pour la réponse
        structured_prompt_dict = None
        if built.structured_prompt:
            try:
                structured_prompt_dict = built.structured_prompt.model_dump()
            except Exception as e:
                logger.warning(f"Erreur lors de la conversion du structured_prompt en dict: {e}")

        return EstimateTokensResponse(
            context_tokens=context_tokens,
            token_count=built.token_count,
            raw_prompt=built.raw_prompt,
            prompt_hash=built.prompt_hash,
            structured_prompt=structured_prompt_dict
        )
        
    except ValidationException:
        # Re-raise les ValidationException telles quelles
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de l'estimation de tokens (request_id: {request_id}): {type(e).__name__}: {str(e)}")
        # Inclure plus de détails pour le debug
        error_details = {
            "error": str(e),
            "error_type": type(e).__name__,
        }
        # Ajouter la traceback en développement uniquement
        import sys
        import traceback
        if hasattr(sys, '_getframe'):
            error_details["traceback"] = traceback.format_exc()
        raise InternalServerException(
            message="Erreur lors de l'estimation de tokens",
            details=error_details,
            request_id=request_id
        )


@router.post(
    "/generate/unity-dialogue",
    response_model=GenerateUnityDialogueResponse,
    status_code=status.HTTP_200_OK
)
async def generate_unity_dialogue(
    request_data: GenerateUnityDialogueRequest,
    request: Request,
    dialogue_service: Annotated[DialogueGenerationService, Depends(get_dialogue_generation_service)],
    prompt_engine: Annotated[PromptEngine, Depends(get_prompt_engine)],
    skill_service: Annotated[SkillCatalogService, Depends(get_skill_catalog_service)],
    trait_service: Annotated[TraitCatalogService, Depends(get_trait_catalog_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> GenerateUnityDialogueResponse:
    """Génère un nœud de dialogue au format Unity JSON.
    
    Utilise UnityDialogueOrchestrator pour factoriser la logique
    avec le streaming SSE.
    """
    try:
        # Créer orchestrateur avec toutes les dépendances
        from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator
        from api.dependencies import get_config_service, create_llm_usage_service
        
        config_service = get_config_service(request)
        usage_service = create_llm_usage_service()
        
        orchestrator = UnityDialogueOrchestrator(
            dialogue_service=dialogue_service,
            prompt_engine=prompt_engine,
            skill_service=skill_service,
            trait_service=trait_service,
            config_service=config_service,
            usage_service=usage_service,
            request_id=request_id
        )
        
        # Appel simple sans streaming (usage REST)
        return await orchestrator.generate(request_data)
        
    except Exception as e:
        if isinstance(e, ValidationException): raise
        logger.exception(f"Erreur lors de la génération Unity JSON (request_id: {request_id})")
        raise InternalServerException(message=str(e), request_id=request_id)



@router.post(
    "/unity/export",
    response_model=ExportUnityDialogueResponse,
    status_code=status.HTTP_200_OK
)
async def export_unity_dialogue(
    request_data: ExportUnityDialogueRequest,
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> ExportUnityDialogueResponse:
    """Exporte un dialogue Unity JSON vers un fichier.
    
    Args:
        request_data: Données de la requête d'export (JSON, titre, nom de fichier).
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Réponse contenant le chemin du fichier créé.
        
    Raises:
        ValidationException: Si le chemin Unity n'est pas configuré ou si le JSON est invalide.
        InternalServerException: Si l'écriture du fichier échoue.
    """
    try:
        file_path, filename = write_unity_dialogue_to_file(
            config_service=config_service,
            json_content=request_data.json_content,
            filename=request_data.filename,
            title=request_data.title,
            request_id=request_id,
        )
        return ExportUnityDialogueResponse(
            file_path=str(file_path.absolute()),
            filename=filename,
            success=True,
        )
    except ValidationException:
        raise
    except Exception as e:
        logger.exception("Erreur lors de l'export Unity JSON (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de l'export du dialogue Unity JSON",
            details={"error": str(e)},
            request_id=request_id,
        )


class RawJsonContextResponse(BaseModel):
    """Réponse pour l'endpoint debug raw-json.
    
    Attributes:
        structured_context: Structure JSON brute du contexte (PromptStructure).
        prompt_hash: Hash SHA-256 du prompt pour référence.
    """
    structured_context: Dict[str, Any] = Field(..., description="Structure JSON brute du contexte")
    prompt_hash: str = Field(..., description="Hash SHA-256 du prompt pour référence")


@router.post(
    "/debug/raw-json",
    response_model=RawJsonContextResponse,
    status_code=status.HTTP_200_OK,
    tags=["Debug"]
)
async def get_raw_json_context(
    request_data: EstimateTokensRequest,
    request: Request,
    dialogue_service: Annotated[DialogueGenerationService, Depends(get_dialogue_generation_service)],
    prompt_engine: Annotated[PromptEngine, Depends(get_prompt_engine)],
    skill_service: Annotated[SkillCatalogService, Depends(get_skill_catalog_service)],
    trait_service: Annotated[TraitCatalogService, Depends(get_trait_catalog_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> RawJsonContextResponse:
    """Expose le JSON brut du contexte structuré pour debug.
    
    Reconstruit le contexte depuis les paramètres de la requête et retourne
    la structure JSON brute (PromptStructure) avant conversion en XML.
    
    Args:
        request_data: Paramètres de la requête (même format que estimate-tokens).
        request: La requête HTTP.
        dialogue_service: DialogueGenerationService injecté.
        prompt_engine: PromptEngine injecté.
        request_id: ID de la requête.
        
    Returns:
        Structure JSON brute du contexte et hash du prompt.
    """
    try:
        # Convertir ContextSelection en dict
        context_selections_dict = request_data.context_selections.to_service_dict()
        
        # Construire le contexte JSON (même logique que estimate-tokens)
        context_builder = dialogue_service.context_builder
        if request_data.previous_dialogue_preview:
            context_builder.set_previous_dialogue_context(request_data.previous_dialogue_preview)
        
        structured_context = context_builder.build_context_json(
            selected_elements=context_selections_dict,
            scene_instruction=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
            max_tokens=request_data.max_context_tokens,
            include_dialogue_type=True,
            element_modes=context_selections_dict.get("_element_modes")
        )
        
        # Construire le prompt pour obtenir le hash (services injectés)
        skills_list = []
        try:
            skills_list = skill_service.load_skills()
        except Exception as e:
            logger.warning(f"Erreur lors du chargement des compétences (request_id: {request_id}): {e}", exc_info=True)
            # Continuer avec une liste vide si le chargement échoue
        
        traits_list = []
        try:
            traits_list = trait_service.get_trait_labels()
        except Exception as e:
            logger.warning(f"Erreur lors du chargement des traits (request_id: {request_id}): {e}", exc_info=True)
            # Continuer avec une liste vide si le chargement échoue
        
        # Déterminer le PNJ interlocuteur
        all_characters = context_selections_dict.get('characters', [])
        npc_speaker_id = request_data.npc_speaker_id or (all_characters[0] if all_characters else "UNKNOWN")
        
        # Construire le prompt pour obtenir le hash
        prompt_input = PromptInput(
            user_instructions=request_data.user_instructions,
            npc_speaker_id=npc_speaker_id,
            player_character_id="URESAIR",
            skills_list=skills_list,
            traits_list=traits_list,
            context_summary=None,  # On utilise structured_context
            structured_context=structured_context,
            scene_location=request_data.context_selections.scene_location,
            max_choices=request_data.max_choices,
            choices_mode=request_data.choices_mode,
            narrative_tags=request_data.narrative_tags,
            author_profile=request_data.author_profile,
            vocabulary_config=request_data.vocabulary_config,
            include_narrative_guides=request_data.include_narrative_guides
        )
        
        built = prompt_engine.build_prompt(prompt_input)
        prompt_hash = built.prompt_hash
        
        # Convertir structured_context en dict
        structured_context_dict = structured_context.model_dump() if hasattr(structured_context, 'model_dump') else structured_context
        
        return RawJsonContextResponse(
            structured_context=structured_context_dict,
            prompt_hash=prompt_hash
        )
        
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération du JSON brut (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération du JSON brut",
            details={"error": str(e)},
            request_id=request_id
        )


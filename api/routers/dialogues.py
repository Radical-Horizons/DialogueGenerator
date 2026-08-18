"""Router pour la génération de dialogues."""
import asyncio
import logging
import os
import re
import json
from pathlib import Path
from typing import Annotated, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response

from api.routers.auth import get_current_user
from api.utils.job_ownership import job_owner_key
from starlette.requests import Request
from api.schemas.dialogue import (
    EstimateTokensRequest,
    EstimateTokensResponse,
    PreviewPromptRequest,
    PreviewPromptResponse,
    GenerateUnityDialogueRequest,
    GenerateUnityDialogueResponse,
    ExportUnityDialogueRequest,
    ExportUnityDialogueResponse,
    BatchExportRequest,
    BatchExportResponse,
    BatchExportFailedItemResponse,
    BatchDownloadRequest,
    BatchExportPreviewRequest,
    BatchExportPreviewResponse,
    BatchExportPreviewItemResponse,
    DialogueMetadataResponse,
)
from pydantic import BaseModel, Field
from api.schemas.batch_validation import (
    BatchValidateJobCreateResponse,
    BatchValidateJobRequest,
    BatchValidateJobStatusResponse,
    BatchValidateRequest,
    BatchValidateResponse,
    BatchValidationIssueResponse,
    BatchValidationItemResponse,
)
from api.dependencies import (
    get_dialogue_generation_service,
    get_request_id,
    get_prompt_engine,
    get_config_service,
    get_llm_pricing_service,
    get_skill_catalog_service,
    get_trait_catalog_service,
    get_unity_dialogue_orchestrator,
    get_export_log_service,
    get_document_persistence_service,
    get_dialogue_metadata_service,
    get_batch_validation_service,
    get_batch_validation_job_manager,
    get_llm_usage_service,
    require_non_guest,
)
from core.prompt.prompt_engine import PromptEngine, PromptInput, BuiltPrompt
from api.exceptions import InternalServerException, ValidationException, NotFoundException, OpenAIException
from services.dialogue_generation_service import DialogueGenerationService
from services.configuration_service import ConfigurationService
from services.scene_dramatis import enrich_context_selections_for_scene, resolve_scene_dramatis
from services.scene_instruction_loader import augment_first_meeting_instructions
from services.dialogue_dramatic_progression import (
    DEFAULT_PROGRESSION_MAX_DEPTH,
    compose_generation_instructions,
)
from services.skill_catalog_service import SkillCatalogService
from services.prompt_catalog_loader import load_prompt_catalogs
from services.trait_catalog_service import TraitCatalogService
from services.document_persistence_service import (
    DialogueAccessDeniedError,
    DocumentPersistenceService,
)
from services.document_id_validation import validate_document_id
from services.unity_export_validation_service import validate_unity_export_document
from services.batch_export_service import batch_export_documents
from services.batch_validation_service import (
    BATCH_VALIDATE_JOB_MIN,
    BatchValidationReport,
    BatchValidationService,
)
from api.services.batch_validation_job_manager import BatchValidationJobManager
from services.export_log_recorder import (
    extract_validation_errors,
    record_unity_export_failure,
    record_unity_export_success,
)
from services.export_log_service import ExportLogService
from services.llm_usage_service import LLMUsageService
from services.dialogue_metadata_service import (
    DialogueMetadataNotFoundError,
    DialogueMetadataService,
)
from services.unity_export_validation_service import validate_persisted_document
from services.unity_dialogue_download_service import (
    build_batch_download_zip,
    content_disposition_attachment,
    read_document_download_payload,
)
from services.unity_export_preview_service import (
    preview_batch_documents,
    preview_persisted_document,
)
from api.utils.validate_schema_api import validate_schema_response_from_result
from api.schemas.graph import ExportPreviewResponse, ValidateSchemaResponse
from services.llm_pricing_service import LLMPricingService
from services.token_estimation_service import DEFAULT_COMPLETION_TOKENS_PER_NODE
from constants import Defaults
from services.context_token_budget import compute_context_selection_token_metrics
from services.context_truncator import cap_context_text_to_budget, count_tokens_in_prompt_context_element
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator
from core.llm.llm_client import ILLMClient

logger = logging.getLogger(__name__)

_USD_TO_EUR_RATE: float = 0.92

router = APIRouter(dependencies=[Depends(get_current_user)])


def _require_dialogue_access(
    document_id: str,
    persistence_service: DocumentPersistenceService,
    current_user: dict[str, object],
    config_service: ConfigurationService,
) -> None:
    """Refuse toute lecture/export hors propriétaire ou administrateur."""
    try:
        resolved_id = validate_document_id(document_id)
        configured_path = config_service.get_unity_dialogues_path()
        persistence_service.require_access(
            resolved_id,
            current_user,
            (
                Path(configured_path) / f"{resolved_id}.json"
                if configured_path
                else None
            ),
        )
    except (DialogueAccessDeniedError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "dialogue_access_denied"},
        ) from exc


@router.get(
    "/{document_id}/metadata",
    response_model=DialogueMetadataResponse,
    status_code=status.HTTP_200_OK,
)
async def get_dialogue_metadata(
    document_id: str,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    metadata_service: Annotated[
        DialogueMetadataService,
        Depends(get_dialogue_metadata_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> DialogueMetadataResponse:
    """Retourne les métadonnées FR86 sans divulguer les dialogues inaccessibles."""
    try:
        resolved_id = validate_document_id(document_id)
        configured_path = config_service.get_unity_dialogues_path()
        persistence_service.require_access(
            resolved_id,
            current_user,
            (
                Path(configured_path) / f"{resolved_id}.json"
                if configured_path
                else None
            ),
        )
        metadata = metadata_service.get_dialogue_metadata(resolved_id)
        return DialogueMetadataResponse(
            document_id=metadata.document_id,
            name=metadata.name,
            owner_id=metadata.owner_id,
            owner_username=metadata.owner_username,
            last_modified_by=metadata.last_modified_by,
            last_modified_by_username=metadata.last_modified_by_username,
            created_at=metadata.created_at,
            updated_at=metadata.updated_at,
            node_count=metadata.node_count,
            total_cost_eur=metadata.total_cost_eur,
            cost_per_node_eur=metadata.cost_per_node_eur,
        )
    except (
        DialogueAccessDeniedError,
        DialogueMetadataNotFoundError,
        ValueError,
    ) as exc:
        raise NotFoundException(
            resource_type="Dialogue",
            resource_id=document_id,
            request_id=request_id,
        ) from exc


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
) -> tuple[BuiltPrompt, Any]:
    """Fonction helper pour construire un prompt à partir d'une requête.
    
    Args:
        request_data: Données de la requête (sélections, instructions).
        dialogue_service: Service de dialogue.
        prompt_engine: Moteur de prompt.
        skill_service: Service de catalogue des compétences injecté.
        trait_service: Service de catalogue des traits injecté.
        
    Returns:
        Tuple ``(BuiltPrompt, structured_context)``. La structure est construite au plafond
        de mesure puis le texte est plafonné au budget utilisateur pour le LLM.
        
    Raises:
        ValueError: Si le XML généré est invalide.
    """
    # 1. Convertir ContextSelection en dict
    context_selections_dict = request_data.context_selections.to_service_dict()
    
    # 2. Charger catalogues (skills/traits) pour injection
    skills_list, attributes_list, traits_list = load_prompt_catalogs(skill_service, trait_service)

    # 3. Résoudre PJ/PNJ et enrichir le contexte
    context_builder = dialogue_service.context_builder
    dramatis = resolve_scene_dramatis(
        player_character_id=request_data.player_character_id,
        npc_speaker_id=request_data.npc_speaker_id,
        context_selections=request_data.context_selections.model_dump(),
        character_catalog=context_builder.get_characters_names(),
    )
    enriched_context = enrich_context_selections_for_scene(
        request_data.context_selections,
        dramatis,
        character_catalog=context_builder.get_characters_names(),
        random_excerpt_count=1,
        context_builder=context_builder,
    )
    context_selections_dict = enriched_context.to_service_dict()
    npc_speaker_id = dramatis.npc_speaker_id
    player_character_id = dramatis.player_character_id

    raw_scene_instructions = (request_data.user_instructions or "").strip()
    if getattr(request_data, "scene_type", None) == "first_meeting" and (
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
        scene_type=getattr(request_data, "scene_type", None),
    )

    # 4. Construire le contexte GDD via ContextBuilder (set dialogue précédent +
    # build atomiques : ce ContextBuilder est un singleton partagé, et cette
    # fonction s'exécute déjà dans un thread déporté par ses appelants — voir
    # ContextBuilder.build_context_json_with_previous_dialogue).
    structured_context = context_builder.build_context_json_with_previous_dialogue(
        previous_dialogue_preview=request_data.previous_dialogue_preview,
        selected_elements=context_selections_dict,
        scene_instruction=scene_instruction,
        field_configs=request_data.field_configs,
        organization_mode=request_data.organization_mode or "narrative",
        max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        include_dialogue_type=True,
        element_modes=context_selections_dict.get("_element_modes")
    )
    # Sérialiser en texte pour le LLM puis appliquer le plafond (aligné orchestrateur SSE)
    context_text = cap_context_text_to_budget(
        context_builder.serialize_context_to_text(structured_context),
        request_data.max_context_tokens,
    )

    # 5. Construire le prompt unifié via le builder unique (PromptInput)
    prompt_input = PromptInput(
        user_instructions=scene_instruction,
        npc_speaker_id=npc_speaker_id,
        player_character_id=player_character_id,
        skills_list=skills_list,
        attributes_list=attributes_list,
        traits_list=traits_list,
        context_summary=context_text,
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

    return prompt_engine.build_prompt(prompt_input), structured_context


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
    def _run() -> PreviewPromptResponse:
        """Corps synchrone déporté sur un thread (construction du prompt via ContextBuilder, bloquant)."""
        # Convertir PreviewPromptRequest en EstimateTokensRequest pour réutiliser la logique
        estimate_request = EstimateTokensRequest(
            context_selections=request_data.context_selections,
            user_instructions=request_data.user_instructions,
            npc_speaker_id=request_data.npc_speaker_id,
            player_character_id=request_data.player_character_id,
            max_context_tokens=request_data.max_context_tokens,
            system_prompt_override=request_data.system_prompt_override,
            author_profile=request_data.author_profile,
            game_rules=request_data.game_rules,
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
            built, _structured_context = _build_prompt_from_request(estimate_request, dialogue_service, prompt_engine, skill_service, trait_service)
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

    try:
        return await asyncio.to_thread(_run)
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
    pricing_service: Annotated[LLMPricingService, Depends(get_llm_pricing_service)],
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
    def _run() -> EstimateTokensResponse:
        """Corps synchrone déporté sur un thread (build prompt + métriques via ContextBuilder, bloquant)."""
        # Construire le prompt en réutilisant la fonction helper
        try:
            built, structured_context = _build_prompt_from_request(request_data, dialogue_service, prompt_engine, skill_service, trait_service)
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

        context_builder = dialogue_service.context_builder
        # Écriture verrouillée (set_previous_dialogue_context_locked) : cette
        # fonction ne relit pas la valeur elle-même (metrics réutilise
        # structured_context déjà construit via _build_prompt_from_request), mais
        # l'écriture doit rester exclusive vis-à-vis des autres threads déportés
        # qui posent/lisent le dialogue précédent sur ce ContextBuilder partagé.
        if request_data.previous_dialogue_preview:
            context_builder.set_previous_dialogue_context_locked(request_data.previous_dialogue_preview)

        metrics = compute_context_selection_token_metrics(
            context_builder,
            full_selection=request_data.context_selections,
            user_instructions=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
            measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
            user_budget_max_tokens=request_data.max_context_tokens,
            prebuilt_structure=structured_context,
        )
        ctx_in_prompt = count_tokens_in_prompt_context_element(built.raw_prompt)
        context_tokens = (
            ctx_in_prompt
            if ctx_in_prompt > 0
            else metrics.context_tokens
        )

        # Convertir structured_prompt en dict pour la réponse
        structured_prompt_dict = None
        if built.structured_prompt:
            try:
                structured_prompt_dict = built.structured_prompt.model_dump()
            except Exception as e:
                logger.warning(f"Erreur lors de la conversion du structured_prompt en dict: {e}")

        completion_tokens = request_data.max_completion_tokens or DEFAULT_COMPLETION_TOKENS_PER_NODE
        cost_usd = pricing_service.calculate_cost(
            request_data.llm_model_identifier,
            built.token_count,
            completion_tokens,
        )
        estimated_cost_eur = round(cost_usd * _USD_TO_EUR_RATE, 6)

        return EstimateTokensResponse(
            context_tokens=context_tokens,
            selection_tokens=metrics.selection_tokens,
            context_token_breakdown=metrics.breakdown,
            context_breakdown_note=metrics.breakdown_note,
            token_count=built.token_count,
            raw_prompt=built.raw_prompt,
            prompt_hash=built.prompt_hash,
            structured_prompt=structured_prompt_dict,
            completion_tokens=completion_tokens,
            estimated_cost_eur=estimated_cost_eur,
        )

    try:
        return await asyncio.to_thread(_run)
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
    orchestrator: Annotated[UnityDialogueOrchestrator, Depends(get_unity_dialogue_orchestrator)],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> GenerateUnityDialogueResponse:
    """Génère un nœud de dialogue au format Unity JSON.
    
    Utilise UnityDialogueOrchestrator pour factoriser la logique
    avec le streaming SSE.
    """
    require_non_guest(current_user)
    try:
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
    export_log_service: Annotated[ExportLogService, Depends(get_export_log_service)],
    llm_usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
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
    target_filename = request_data.filename or "dialogue.json"
    parsed_document: Dict[str, Any] | None = None
    try:
        base_name = request_data.filename or re.sub(
            r"[-\s]+",
            "_",
            re.sub(r"[^\w\s-]", "", request_data.title),
        )
        try:
            document_id = validate_document_id(base_name)
        except ValueError as exc:
            raise ValidationException(
                message=str(exc),
                details={"field": "filename"},
                request_id=request_id,
            ) from exc
        target_filename = f"{document_id}.json"
        configured_path = config_service.get_unity_dialogues_path()
        if configured_path and (
            Path(configured_path) / target_filename
        ).exists():
            _require_dialogue_access(
                document_id,
                persistence_service,
                current_user,
                config_service,
            )
        parsed = json.loads(request_data.json_content)
        if isinstance(parsed, dict):
            parsed_document = parsed
        elif isinstance(parsed, list):
            parsed_document = {"schemaVersion": "1.2.0", "nodes": parsed}
        if parsed_document is None:
            raise ValidationException(
                message="Le JSON Unity doit être un document ou une liste de nœuds.",
                request_id=request_id,
            )
        validation = validate_unity_export_document(parsed_document)
        if not validation.is_valid:
            raise ValidationException(
                message="La validation du schéma Unity a échoué.",
                details={"validation_errors": validation.errors_structured},
                request_id=request_id,
            )
        unity_path = config_service.get_unity_dialogues_path()
        if not unity_path:
            raise ValidationException(
                message="Le chemin Unity dialogues n'est pas configuré.",
                request_id=request_id,
            )
        unity_dir = Path(unity_path)
        if (unity_dir / f"{document_id}.json").exists():
            try:
                persistence_service.require_edit(
                    document_id,
                    current_user,
                    unity_dir / f"{document_id}.json",
                )
            except DialogueAccessDeniedError as exc:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"code": "dialogue_access_denied"},
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "canonical_revision_required",
                    "message": (
                        "Un dialogue avec ce nom existe déjà. "
                        "Choisissez un autre nom (ex. suffixe _2) ou "
                        "utilisez PUT /documents/{id} pour le mettre à jour."
                    ),
                },
            )
        persistence_service.write_document(
            unity_dir,
            document_id,
            parsed_document,
            1,
            current_user,
            create_only=True,
        )
        filename = f"{document_id}.json"
        record_unity_export_success(
            export_log_service,
            llm_usage_service,
            document=parsed_document or {"schemaVersion": "1.2.0", "nodes": []},
            filename=filename,
        )
        return ExportUnityDialogueResponse(
            filename=filename,
            success=True,
        )
    except ValidationException as exc:
        record_unity_export_failure(
            export_log_service,
            llm_usage_service,
            document=parsed_document,
            filename=target_filename,
            errors=extract_validation_errors(exc),
        )
        raise
    except HTTPException:
        raise
    except OSError as exc:
        record_unity_export_failure(
            export_log_service,
            llm_usage_service,
            document=parsed_document,
            filename=target_filename,
            errors=[f"Erreur d'écriture disque: {exc}"],
        )
        logger.exception("Erreur disque export Unity JSON (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de l'export du dialogue Unity JSON",
            request_id=request_id,
        )
    except Exception as e:
        record_unity_export_failure(
            export_log_service,
            llm_usage_service,
            document=parsed_document,
            filename=target_filename,
            errors=[str(e)],
        )
        logger.exception("Erreur lors de l'export Unity JSON (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de l'export du dialogue Unity JSON",
            request_id=request_id,
        )


@router.post(
    "/batch-export",
    response_model=BatchExportResponse,
    status_code=status.HTTP_200_OK,
)
async def batch_export_unity_dialogues(
    request_data: BatchExportRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    export_log_service: Annotated[ExportLogService, Depends(get_export_log_service)],
    llm_usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> BatchExportResponse:
    """Exporte plusieurs dialogues persistés vers Unity JSON (Story 5.2 / FR50)."""
    try:
        for document_id in request_data.document_ids:
            _require_dialogue_access(
                document_id,
                persistence_service,
                current_user,
                config_service,
            )
        result = batch_export_documents(
            config_service,
            request_data.document_ids,
            skip_validation=request_data.skip_validation,
            filename_strategy=request_data.filename_strategy,
            request_id=request_id,
            export_log_service=export_log_service,
            llm_usage_service=llm_usage_service,
        )
        return BatchExportResponse(
            exported=result.exported,
            failed=[
                BatchExportFailedItemResponse(id=item.id, errors=item.errors)
                for item in result.failed
            ],
            cancelled=result.cancelled,
            success=len(result.exported) > 0 or len(result.failed) == 0,
        )
    except HTTPException:
        raise
    except ValidationException:
        raise
    except Exception as e:
        logger.exception("Erreur batch export Unity (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de l'export batch Unity JSON",
            request_id=request_id,
        )


def _batch_report_to_response(report: BatchValidationReport) -> BatchValidateResponse:
    """Convertit le rapport métier en schéma HTTP."""
    return BatchValidateResponse(
        items=[
            BatchValidationItemResponse(
                document_id=item.document_id,
                status=item.status,
                issues=[
                    BatchValidationIssueResponse(
                        type=issue.type,
                        message=issue.message,
                        severity=issue.severity,
                        source=issue.source,
                        node_id=issue.node_id,
                    )
                    for issue in item.issues
                ],
                validated_at=item.validated_at,
            )
            for item in report.items
        ],
        cancelled=report.cancelled,
        started_at=report.started_at,
        finished_at=report.finished_at,
        valid_count=report.valid_count,
        invalid_count=report.invalid_count,
        skipped_count=report.skipped_count,
    )


def _can_access_document(
    document_id: str,
    persistence_service: DocumentPersistenceService,
    current_user: dict[str, object],
    config_service: ConfigurationService,
) -> bool:
    """Indique si l'utilisateur peut lire le dialogue (sans lever 403).

    Les IDs invalides ne sont pas traités comme un refus RBAC : le service
    les classera en ``skipped``.
    """
    try:
        resolved_id = validate_document_id(document_id)
    except ValueError:
        return True
    try:
        configured_path = config_service.get_unity_dialogues_path()
        persistence_service.require_access(
            resolved_id,
            current_user,
            (
                Path(configured_path) / f"{resolved_id}.json"
                if configured_path
                else None
            ),
        )
        return True
    except DialogueAccessDeniedError:
        return False


@router.post(
    "/batch-validate",
    response_model=BatchValidateResponse,
    status_code=status.HTTP_200_OK,
)
async def batch_validate_dialogues(
    request_data: BatchValidateRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    batch_service: Annotated[
        BatchValidationService,
        Depends(get_batch_validation_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> BatchValidateResponse:
    """Valide synchrone un petit lot (N < 20) — Story 8.8 / FR87."""
    if len(request_data.document_ids) >= BATCH_VALIDATE_JOB_MIN:
        raise ValidationException(
            message=(
                f"Utilisez POST /batch-validate/jobs pour N ≥ {BATCH_VALIDATE_JOB_MIN}"
            ),
            details={"count": len(request_data.document_ids)},
            request_id=request_id,
        )
    report = batch_service.validate_batch(
        request_data.document_ids,
        can_access=lambda doc_id: _can_access_document(
            doc_id,
            persistence_service,
            current_user,
            config_service,
        ),
    )
    return _batch_report_to_response(report)


@router.post(
    "/batch-validate/jobs",
    response_model=BatchValidateJobCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_batch_validate_job(
    request_data: BatchValidateJobRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    batch_service: Annotated[
        BatchValidationService,
        Depends(get_batch_validation_service),
    ],
    job_manager: Annotated[
        BatchValidationJobManager,
        Depends(get_batch_validation_job_manager),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> BatchValidateJobCreateResponse:
    """Lance un job async de validation batch (N ≥ 20)."""
    import asyncio

    owner = job_owner_key(current_user)
    job_id = job_manager.create_job(request_data.document_ids, owner)

    def _run() -> None:
        try:
            report = batch_service.validate_batch(
                request_data.document_ids,
                can_access=lambda doc_id: _can_access_document(
                    doc_id,
                    persistence_service,
                    current_user,
                    config_service,
                ),
                should_cancel=lambda: job_manager.is_cancelled(job_id),
                on_progress=lambda current, _total, _item: job_manager.set_progress(
                    job_id, current
                ),
            )
            payload = _batch_report_to_response(report).model_dump()
            final_status = "cancelled" if report.cancelled else "completed"
            job_manager.complete(job_id, status=final_status, report=payload)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Job batch-validate %s échoué (request_id: %s)", job_id, request_id
            )
            job_manager.complete(job_id, status="error", error=str(exc))

    async def _runner() -> None:
        await asyncio.to_thread(_run)

    task = asyncio.create_task(_runner())
    job_manager.register_task(job_id, task)
    return BatchValidateJobCreateResponse(
        job_id=job_id,
        status="queued",
        total=len(request_data.document_ids),
    )


@router.get(
    "/batch-validate/jobs/{job_id}",
    response_model=BatchValidateJobStatusResponse,
)
async def get_batch_validate_job(
    job_id: str,
    job_manager: Annotated[
        BatchValidationJobManager,
        Depends(get_batch_validation_job_manager),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> BatchValidateJobStatusResponse:
    """Retourne l'état / le rapport d'un job de validation batch."""
    job = job_manager.get_job(job_id)
    if job is None:
        raise NotFoundException(
            resource_type="BatchValidateJob",
            resource_id=job_id,
            request_id=request_id,
        )
    owner = job_owner_key(current_user)
    if job.get("owner_username") != owner and current_user.get("role") != "admin":
        raise NotFoundException(
            resource_type="BatchValidateJob",
            resource_id=job_id,
            request_id=request_id,
        )
    report_payload = job.get("report")
    report = (
        BatchValidateResponse(**report_payload)
        if isinstance(report_payload, dict)
        else None
    )
    return BatchValidateJobStatusResponse(
        job_id=job_id,
        status=job["status"],
        current=int(job.get("current") or 0),
        total=int(job.get("total") or 0),
        cancelled=bool(job.get("cancelled")),
        error=job.get("error"),
        report=report,
    )


@router.post(
    "/batch-validate/jobs/{job_id}/cancel",
    response_model=BatchValidateJobStatusResponse,
)
async def cancel_batch_validate_job(
    job_id: str,
    job_manager: Annotated[
        BatchValidationJobManager,
        Depends(get_batch_validation_job_manager),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> BatchValidateJobStatusResponse:
    """Annule un job de validation batch en cours."""
    job = job_manager.get_job(job_id)
    if job is None:
        raise NotFoundException(
            resource_type="BatchValidateJob",
            resource_id=job_id,
            request_id=request_id,
        )
    owner = job_owner_key(current_user)
    if job.get("owner_username") != owner and current_user.get("role") != "admin":
        raise NotFoundException(
            resource_type="BatchValidateJob",
            resource_id=job_id,
            request_id=request_id,
        )
    job_manager.cancel_job(job_id)
    return await get_batch_validate_job(
        job_id, job_manager, current_user, request_id
    )


@router.get("/{document_id}/preview-export", response_model=ExportPreviewResponse)
async def preview_unity_dialogue_export(
    document_id: str,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> ExportPreviewResponse:
    """Preview export bibliothèque sans téléchargement (Story 5.5 / FR53)."""
    try:
        _require_dialogue_access(
            document_id,
            persistence_service,
            current_user,
            config_service,
        )
        result = preview_persisted_document(config_service, document_id, request_id)
        return ExportPreviewResponse(
            json_content=result.json_content,
            size_bytes=result.size_bytes,
            node_count=result.node_count,
            filename=result.filename,
            schema_valid=result.schema_valid,
            errors=result.errors,
        )
    except HTTPException:
        raise
    except FileNotFoundError:
        raise NotFoundException(
            resource_type="Document dialogue",
            resource_id=document_id,
            request_id=request_id,
        )
    except ValidationException:
        raise
    except ValueError as exc:
        raise ValidationException(
            message=str(exc),
            details={"document_id": document_id},
            request_id=request_id,
        )
    except Exception as exc:
        logger.exception(
            "Erreur preview-export document %s (request_id: %s)", document_id, request_id
        )
        raise InternalServerException(
            message="Erreur lors de la prévisualisation export",
            request_id=request_id,
        )


@router.get("/{document_id}/download")
async def download_unity_dialogue(
    document_id: str,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> Response:
    """Télécharge un dialogue Unity exporté sur disque (Story 5.4 / FR52)."""
    try:
        _require_dialogue_access(
            document_id,
            persistence_service,
            current_user,
            config_service,
        )
        content, filename = read_document_download_payload(
            config_service, document_id, request_id
        )
    except HTTPException:
        raise
    except FileNotFoundError:
        raise NotFoundException(
            resource_type="Document dialogue",
            resource_id=document_id,
            request_id=request_id,
        )
    except ValidationException:
        raise
    except ValueError as exc:
        raise ValidationException(
            message=str(exc),
            details={"document_id": document_id},
            request_id=request_id,
        )
    return Response(
        content=content.encode("utf-8"),
        media_type="application/json;charset=utf-8",
        headers={"Content-Disposition": content_disposition_attachment(filename)},
    )


@router.post("/batch-preview-export", response_model=BatchExportPreviewResponse)
async def batch_preview_unity_dialogue_export(
    request_data: BatchExportPreviewRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> BatchExportPreviewResponse:
    """Preview export batch bibliothèque (Story 5.5 / FR53)."""
    try:
        for document_id in request_data.document_ids:
            _require_dialogue_access(
                document_id,
                persistence_service,
                current_user,
                config_service,
            )
        result = preview_batch_documents(
            config_service, request_data.document_ids, request_id
        )
        return BatchExportPreviewResponse(
            items=[
                BatchExportPreviewItemResponse(
                    document_id=item.document_id,
                    filename=item.filename,
                    size_bytes=item.size_bytes,
                    node_count=item.node_count,
                    json_preview=item.json_preview,
                    json_preview_truncated=item.json_preview_truncated,
                )
                for item in result.items
            ],
            total_size_bytes=result.total_size_bytes,
            dialogue_count=result.dialogue_count,
        )
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise NotFoundException(
            resource_type="Document dialogue",
            resource_id=str(exc),
            request_id=request_id,
        )
    except ValidationException:
        raise
    except ValueError as exc:
        raise ValidationException(message=str(exc), request_id=request_id)
    except Exception as exc:
        logger.exception("Erreur batch preview-export (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la prévisualisation export batch",
            details={"error": str(exc)},
            request_id=request_id,
        )


@router.post("/batch-download")
async def batch_download_unity_dialogues(
    request_data: BatchDownloadRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> Response:
    """Télécharge une archive ZIP des fichiers exportés (Story 5.4 / FR52)."""
    try:
        zip_bytes, zip_name = build_batch_download_zip(
            config_service,
            request_data.filenames,
            compression=request_data.compression,
            request_id=request_id,
        )
    except FileNotFoundError as exc:
        raise NotFoundException(
            resource_type="Fichier export Unity",
            resource_id=str(exc),
            request_id=request_id,
        )
    except ValidationException:
        raise
    except ValueError as exc:
        raise ValidationException(message=str(exc), request_id=request_id)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


@router.post(
    "/{document_id}/validate-schema",
    response_model=ValidateSchemaResponse,
    status_code=status.HTTP_200_OK,
)
async def validate_document_schema(
    document_id: str,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> ValidateSchemaResponse:
    """Valide un document persisté contre le schéma Unity (Story 5.3 / FR51)."""
    try:
        result = validate_persisted_document(config_service, document_id, request_id)
        return validate_schema_response_from_result(result)
    except FileNotFoundError:
        raise NotFoundException(
            resource_type="Document dialogue",
            resource_id=document_id,
            request_id=request_id,
        )
    except ValidationException:
        raise
    except ValueError as exc:
        raise ValidationException(
            message=str(exc),
            details={"document_id": document_id},
            request_id=request_id,
        )
    except Exception as e:
        logger.exception(
            "Erreur validate-schema document %s (request_id: %s)", document_id, request_id
        )
        raise InternalServerException(
            message="Erreur lors de la validation du schéma Unity",
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


def _block_debug_raw_json_in_production() -> None:
    """Refuse l'endpoint en production avant parsing du corps (évite fuite de schéma 422)."""
    if os.getenv("ENVIRONMENT", "development") == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


@router.post(
    "/debug/raw-json",
    response_model=RawJsonContextResponse,
    status_code=status.HTTP_200_OK,
    tags=["Debug"]
)
async def get_raw_json_context(
    _prod_guard: Annotated[None, Depends(_block_debug_raw_json_in_production)],
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
    def _run() -> RawJsonContextResponse:
        """Corps synchrone déporté sur un thread (build contexte + prompt via ContextBuilder, bloquant)."""
        # Convertir ContextSelection en dict
        context_selections_dict = request_data.context_selections.to_service_dict()

        # Construire le contexte JSON (même logique que estimate-tokens). Set +
        # build atomiques (voir ContextBuilder.build_context_json_with_previous_dialogue).
        context_builder = dialogue_service.context_builder
        structured_context = context_builder.build_context_json_with_previous_dialogue(
            previous_dialogue_preview=request_data.previous_dialogue_preview,
            selected_elements=context_selections_dict,
            scene_instruction=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "narrative",
            max_tokens=request_data.max_context_tokens,
            include_dialogue_type=True,
            element_modes=context_selections_dict.get("_element_modes")
        )

        # Construire le prompt pour obtenir le hash (services injectés)
        skills_list, attributes_list, traits_list = load_prompt_catalogs(
            skill_service, trait_service
        )

        dramatis = resolve_scene_dramatis(
            player_character_id=request_data.player_character_id,
            npc_speaker_id=request_data.npc_speaker_id,
            context_selections=request_data.context_selections.model_dump(),
        )
        npc_speaker_id = dramatis.npc_speaker_id

        context_text_for_prompt = cap_context_text_to_budget(
            context_builder.serialize_context_to_text(structured_context),
            request_data.max_context_tokens,
        )
        prompt_input = PromptInput(
            user_instructions=request_data.user_instructions,
            npc_speaker_id=npc_speaker_id,
            player_character_id=dramatis.player_character_id,
            skills_list=skills_list,
            attributes_list=attributes_list,
            traits_list=traits_list,
            context_summary=context_text_for_prompt,
            structured_context=structured_context,
            scene_location=request_data.context_selections.scene_location,
            max_choices=request_data.max_choices,
            choices_mode=request_data.choices_mode,
            narrative_tags=request_data.narrative_tags,
            author_profile=request_data.author_profile,
            game_rules=request_data.game_rules,
            vocabulary_config=request_data.vocabulary_config,
            include_narrative_guides=request_data.include_narrative_guides,
            max_context_tokens=request_data.max_context_tokens,
            llm_model_identifier=request_data.llm_model_identifier,
        )

        built = prompt_engine.build_prompt(prompt_input)
        prompt_hash = built.prompt_hash

        # Convertir structured_context en dict
        structured_context_dict = structured_context.model_dump() if hasattr(structured_context, 'model_dump') else structured_context

        return RawJsonContextResponse(
            structured_context=structured_context_dict,
            prompt_hash=prompt_hash
        )

    try:
        return await asyncio.to_thread(_run)
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération du JSON brut (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération du JSON brut",
            details={"error": str(e)},
            request_id=request_id
        )


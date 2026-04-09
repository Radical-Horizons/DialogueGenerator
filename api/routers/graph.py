"""Router API pour la gestion de graphes de dialogues."""
import hashlib
import json
import logging
import time
import re
from pathlib import Path
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Request, status

from api.routers.auth import get_current_user
from cachetools import TTLCache
from api.schemas.graph import (
    LoadGraphRequest,
    LoadGraphResponse,
    GraphMetadata,
    SaveGraphRequest,
    SaveGraphResponse,
    EstimateCostRequest,
    EstimateCostResponse,
    EstimateCostPerNodeBreakdown,
    GenerateNodeRequest,
    GenerateNodeResponse,
    NodePromptResponse,
    SuggestedConnection,
    ValidateGraphRequest,
    ValidateGraphResponse,
    DetectAiSlopRequest,
    DetectAiSlopResponse,
    AiSlopOccurrenceItem,
    AiSlopRepetitionGroup,
    AiSlopDetectionOptions,
    DetectContextDroppingRequest,
    DetectContextDroppingResponse,
    DetectContextDroppingOptions,
    ValidateLoreExplicitRequest,
    ValidateLoreExplicitResponse,
    ValidationErrorDetail,
    CalculateLayoutRequest,
    CalculateLayoutResponse,
    AcceptNodeRequest,
    RejectNodeRequest,
    RegenerateNodeRequest,
    RegenerateNodeResponse,
)
from api.exceptions import (
    AllLLMProvidersUnavailableError,
    InternalServerException,
    NotFoundException,
    ValidationException,
)
from api.dependencies import (
    get_cd_rules_service,
    get_config_service,
    get_context_builder,
    get_request_id,
    get_graph_node_orchestrator,
    get_token_estimation_service,
    get_llm_pricing_service,
    get_llm_usage_service,
    get_llm_quality_judge_service,
)
from services.configuration_service import ConfigurationService
from services.graph_conversion_service import GraphConversionService
from services.unity_dialogue_export_service import (
    write_unity_dialogue_to_file,
    read_last_seq,
)
from services.graph_validation_service import GraphValidationService
from services.ai_slop_detector import AISlopDetector, AiSlopDetectionOptionsData, AiSlopDetectionResult
from services.context_dropping_detector import (
    ContextDroppingDetector,
    ContextDroppingOptionsData,
)
from api.utils.context_dropping_response import build_detect_context_dropping_response
from services.lore_contradiction_validator import (
    LoreGddFact,
    merge_lore_facts_with_context_builder,
    validate_explicit_lore_contradictions,
)
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.context_dropping_rules_service import ContextDroppingRulesService
from services.token_estimation_service import TokenEstimationService
from services.llm_pricing_service import LLMPricingService
from services.llm_usage_service import LLMUsageService
from services.llm_quality_judge_service import LLMQualityJudgeService
from core.context.context_builder import ContextBuilder
from api.schemas.dialogue_quality import (
    EvaluateDialogueQualityRequest,
    EvaluateDialogueQualityResponse,
)

logger = logging.getLogger(__name__)


def _ai_slop_options_to_data(
    options: Optional[AiSlopDetectionOptions],
) -> AiSlopDetectionOptionsData:
    """Mappe le schéma API vers les options du service."""
    if options is None:
        return AiSlopDetectionOptionsData()
    return AiSlopDetectionOptionsData(
        include_gpt_isms=options.include_gpt_isms,
        include_repetitions=options.include_repetitions,
        include_generic_phrases=options.include_generic_phrases,
        custom_keywords=list(options.custom_keywords),
        custom_regex_patterns=list(options.custom_regex_patterns),
    )


def _load_persisted_cd_rules(cd_rules_service: ContextDroppingRulesService):
    """Retourne les règles persistées, ou None en cas d'absence/erreur (avec log)."""
    try:
        return cd_rules_service.get_rules()
    except Exception as exc:
        logger.warning(
            "Règles anti-context-dropping illisibles — fallback sur défauts : %s", exc
        )
        return None


def _context_dropping_options_to_data(
    options: Optional[DetectContextDroppingOptions],
    cd_rules_service: ContextDroppingRulesService,
) -> ContextDroppingOptionsData:
    """Fusionne options requête + règles persistées (Story 4.10).

    Priorité : champs requête explicites > règles persistées > constantes par défaut.
    """
    persisted = _load_persisted_cd_rules(cd_rules_service)

    # Profil : requête > persisté > défaut "strict"
    if options is not None and options.rules_profile is not None:
        profile = options.rules_profile
    elif persisted is not None:
        profile = persisted.rules_profile
    else:
        profile = "strict"

    if profile not in ("strict", "light"):
        profile = "strict"

    # Tolérance : requête > persisté > None
    if options is not None and options.tolerance is not None:
        tolerance = options.tolerance
    elif persisted is not None:
        tolerance = persisted.tolerance
    else:
        tolerance = None

    # Informations obligatoires : requête > persisté > liste vide
    if options is not None and options.mandatory_info is not None:
        mandatory_info = list(options.mandatory_info)
    elif persisted is not None:
        mandatory_info = list(persisted.mandatory_info)
    else:
        mandatory_info = []

    # Surcharges par type : requête > persisté > vide
    if options is not None and options.dialogue_type_overrides is not None:
        dialogue_type_overrides = dict(options.dialogue_type_overrides)
    elif persisted is not None:
        dialogue_type_overrides = {
            k: v if isinstance(v, dict) else v.model_dump()
            for k, v in persisted.dialogue_type_overrides.items()
        }
    else:
        dialogue_type_overrides = {}

    return ContextDroppingOptionsData(
        rules_profile=profile,
        tolerance=tolerance,
        mandatory_info=mandatory_info,
        dialogue_type=options.dialogue_type if options is not None else None,
        dialogue_type_overrides=dialogue_type_overrides,
    )


def _detect_ai_slop_response_from_result(raw: AiSlopDetectionResult) -> DetectAiSlopResponse:
    """Construit la réponse HTTP à partir du résultat interne."""
    gpt_occs = [x for x in raw.occurrences if x.kind == "gpt_ism"]
    gen_occs = [x for x in raw.occurrences if x.kind == "generic_phrase"]
    gpt_nodes = len({x.node_id for x in gpt_occs})
    gen_nodes = len({x.node_id for x in gen_occs})
    summary_gpt = (
        f"GPT-isms : {len(gpt_occs)} occurrence(s) dans {gpt_nodes} nœud(s)"
        if gpt_occs
        else "GPT-isms : 0 occurrence"
    )
    summary_gen = (
        f"Phrases génériques : {len(gen_occs)} occurrence(s) dans {gen_nodes} nœud(s)"
        if gen_occs
        else "Phrases génériques : 0 occurrence"
    )
    n_rep_groups = len(raw.repetition_groups)
    total_rep_segs = sum(g.occurrence_count for g in raw.repetition_groups)
    summary_rep = (
        f"Répétitions : {n_rep_groups} phrase(s) répétée(s), {total_rep_segs} occurrence(s) au total"
        if n_rep_groups
        else "Répétitions : aucune phrase détectée"
    )
    items = [
        AiSlopOccurrenceItem(
            kind=x.kind,
            node_id=x.node_id,
            node_display_id=x.node_display_id,
            field=x.field,
            excerpt=x.excerpt,
            matched_span=x.matched_span,
            suggestion=x.suggestion,
            severity="warning",
        )
        for x in raw.occurrences
    ]
    groups = [
        AiSlopRepetitionGroup(
            normalized_phrase=g.normalized_phrase,
            occurrence_count=g.occurrence_count,
            node_ids=g.node_ids,
            sample_excerpt=g.sample_excerpt,
        )
        for g in raw.repetition_groups
    ]
    return DetectAiSlopResponse(
        summary_gpt_isms=summary_gpt,
        summary_repetitions=summary_rep,
        summary_generic_phrases=summary_gen,
        gpt_ism_occurrence_count=len(gpt_occs),
        gpt_ism_distinct_node_count=gpt_nodes,
        generic_phrase_occurrence_count=len(gen_occs),
        repetition_group_count=n_rep_groups,
        occurrences=items,
        repetition_groups=groups,
        message=raw.message,
    )


def _fingerprint_for_selections_safe(
    context_builder: ContextBuilder,
    selections: dict,
) -> Optional[str]:
    """Empreinte du contexte GDD pour les sélections ; None si vide ou erreur."""
    if not selections:
        return None
    try:
        from services.gdd_context_fingerprint import compute_gdd_content_fingerprint

        return compute_gdd_content_fingerprint(context_builder, selections)
    except Exception as exc:
        logger.warning("Empreinte contexte GDD omise: %s", exc)
        return None

# Taux de conversion USD → EUR (à mettre à jour périodiquement, voir llm_pricing.json note).
_USD_TO_EUR_RATE: float = 0.92

# Provider alternatif de comparaison pour l'AC #3 (Mistral: -X% vs OpenAI).
_ALTERNATIVE_MODEL: dict[str, str] = {
    "openai": "mistral-small-latest",
    "mistral": "gpt-4o",
}


def _build_representative_prompt_for_estimate(
    parent_node_content: dict,
    user_instructions: str,
    context_selections: dict,
) -> str:
    """Construit un prompt représentatif pour l'estimation (sans appel LLM)."""
    import json
    parent_speaker = parent_node_content.get("speaker", "PNJ")
    parent_line = parent_node_content.get("line", "")
    context_blob = json.dumps(context_selections, ensure_ascii=False) if context_selections else ""
    return (
        f"{context_blob}\n\n"
        f"Contexte précédent:\n{parent_speaker}: {parent_line}\n\n"
        f"Instructions pour la suite:\n{user_instructions or ''}"
    )


def _resolve_model_and_provider(
    llm_model_identifier: Optional[str],
    config_service: ConfigurationService,
) -> tuple[str, str]:
    """Retourne (model_id, provider) pour l'estimation (défaut si besoin)."""
    if llm_model_identifier and llm_model_identifier.strip():
        model_id = llm_model_identifier.strip()
    else:
        models = config_service.get_available_llm_models()
        if models:
            model_id = (
                models[0].get("api_identifier")
                or models[0].get("model_identifier")
                or "gpt-4o"
            )
        else:
            model_id = "gpt-4o"
    provider = "mistral" if "mistral" in model_id.lower() else "openai"
    return (model_id, provider)


def _batch_count_from_request(request_data: EstimateCostRequest) -> int:
    """Nombre de nœuds à estimer (1 si single, N si generate_all_choices).

    Chaque choix avec test non vide génère 4 nœuds (issues de test) ; les autres 1.
    """
    if not request_data.generate_all_choices:
        return 1
    choices = request_data.parent_node_content.get("choices", [])
    count = 0
    for c in choices:
        target = c.get("targetNode")
        if not target or target == "END":
            tv = c.get("test")
            has_test = tv is not None and (not isinstance(tv, str) or str(tv).strip())
            count += 4 if has_test else 1
    return max(1, count)


# Cache estimation coût par hash (contexte + instructions + model_id), TTL 60s (AC #1 <1s).
_estimate_cost_cache: TTLCache[str, dict] = TTLCache(maxsize=200, ttl=60)


def _estimate_cost_cache_key(representative_prompt: str, model_id: str, batch_count: int) -> str:
    """Clé de cache pour estimate-cost."""
    blob = f"{representative_prompt}|{model_id}|{batch_count}"
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _try_compute_context_relevance(
    usage_service: LLMUsageService,
    request_id: str,
) -> None:
    """Calcule la pertinence contexte sans impacter la réponse HTTP (Story 3.6)."""
    try:
        usage_service.compute_and_persist_context_relevance(request_id)
    except Exception as exc:
        logger.warning(
            "Pertinence contexte non enregistrée (request_id=%s): %s",
            request_id,
            exc,
        )


router = APIRouter(
    prefix="/api/v1/unity-dialogues/graph",
    tags=["Graph Editor"],
    dependencies=[Depends(get_current_user)],
)


@router.post(
    "/load",
    response_model=LoadGraphResponse,
    status_code=status.HTTP_200_OK
)
async def load_graph(
    request_data: LoadGraphRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> LoadGraphResponse:
    """Charge un dialogue Unity JSON et le convertit en format graphe (nodes/edges).
    
    Args:
        request_data: Contenu JSON Unity.
        request_id: ID de la requête.
        
    Returns:
        Nœuds et edges ReactFlow avec métadonnées.
        
    Raises:
        ValidationException: Si le JSON est invalide.
        InternalServerException: Si la conversion échoue.
    """
    try:
        # Convertir Unity JSON → ReactFlow
        nodes, edges = GraphConversionService.unity_json_to_graph(request_data.json_content)
        
        # Calculer les métadonnées
        metadata = GraphMetadata(
            title="Dialogue Unity",
            node_count=len(nodes),
            edge_count=len(edges)
        )
        
        logger.info(
            f"Graphe chargé: {metadata.node_count} nœuds, "
            f"{metadata.edge_count} edges (request_id: {request_id})"
        )
        
        return LoadGraphResponse(
            nodes=nodes,
            edges=edges,
            metadata=metadata
        )
        
    except ValueError as e:
        logger.warning(f"Validation error lors du chargement (request_id: {request_id}): {e}")
        raise ValidationException(
            message=str(e),
            request_id=request_id
        )
    except Exception as e:
        logger.exception(f"Erreur lors du chargement du graphe (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors du chargement du graphe",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/save",
    response_model=SaveGraphResponse,
    status_code=status.HTTP_200_OK
)
async def save_graph(
    request_data: SaveGraphRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> SaveGraphResponse:
    """Sauvegarde un graphe modifié (reconvertit en Unity JSON).
    
    Args:
        request_data: Nœuds et edges ReactFlow avec métadonnées.
        request_id: ID de la requête.
        
    Returns:
        Nom de fichier et contenu JSON Unity généré.
        Si seq/document_id fournis (ADR-006), ack_seq et last_seq dans la réponse.
        
    Raises:
        ValidationException: Si la conversion échoue.
        InternalServerException: Si la sauvegarde échoue.
    """
    try:
        # Convertir ReactFlow → Unity JSON
        json_content = GraphConversionService.graph_to_unity_json(
            request_data.nodes,
            request_data.edges
        )
        
        # Générer un nom de fichier (titre sanitizé)
        sanitized_title = re.sub(r'[^\w\s-]', '', request_data.metadata.title)
        sanitized_title = re.sub(r'[-\s]+', '_', sanitized_title)
        filename = f"{sanitized_title}.json"
        
        # ADR-006: réponse ack_seq / last_seq si seq fourni (pas de persistance pour /save)
        extra: dict = {}
        if request_data.seq is not None:
            extra["ack_seq"] = request_data.seq
            extra["last_seq"] = request_data.seq
        
        logger.info(
            "Graphe sauvegardé: %s, %s nœuds (request_id: %s)",
            filename,
            request_data.metadata.node_count,
            request_id,
        )
        
        return SaveGraphResponse(
            success=True,
            filename=filename,
            json_content=json_content,
            **extra,
        )
        
    except ValueError as e:
        logger.warning("Validation error lors de la sauvegarde (request_id: %s): %s", request_id, e)
        raise ValidationException(
            message=str(e),
            request_id=request_id
        )
    except Exception as e:
        logger.exception("Erreur lors de la sauvegarde du graphe (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la sauvegarde du graphe",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/save-and-write",
    response_model=SaveGraphResponse,
    status_code=status.HTTP_200_OK
)
async def save_graph_and_write(
    request_data: SaveGraphRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> SaveGraphResponse:
    """Convertit le graphe en Unity JSON, valide et écrit le fichier sur disque (un seul appel).
    
    ADR-006: Si seq/document_id fournis, seq <= last_seq → ne pas écraser (200 + ack(last_seq));
    seq > last_seq → écriture atomique + persistance last_seq + ack(seq).
    
    Args:
        request_data: Nœuds et edges ReactFlow avec métadonnées.
        config_service: Service de configuration (chemin Unity).
        request_id: ID de la requête.
        
    Returns:
        Nom de fichier et contenu JSON Unity généré.
        
    Raises:
        ValidationException: Si la conversion ou la validation échoue.
        InternalServerException: Si l'écriture échoue.
    """
    try:
        json_content = GraphConversionService.graph_to_unity_json(
            request_data.nodes,
            request_data.edges
        )
        sanitized_title = re.sub(r"[^\w\s-]", "", request_data.metadata.title)
        sanitized_title = re.sub(r"[-\s]+", "_", sanitized_title)
        filename_without_ext = sanitized_title[:100] if sanitized_title else "dialogue"
        filename = filename_without_ext + ".json" if not filename_without_ext.endswith(".json") else filename_without_ext
        if not filename.endswith(".json"):
            filename += ".json"
        document_key = filename[:-5] if filename.endswith(".json") else filename

        # ADR-006: seq / last_seq — si seq fourni, comparer à last_seq
        seq = request_data.seq
        last_seq: Optional[int] = None
        if seq is not None:
            unity_path = config_service.get_unity_dialogues_path()
            if unity_path:
                unity_dir = Path(unity_path)
                last_seq = read_last_seq(unity_dir, document_key)
            if last_seq is not None and seq <= last_seq:
                    logger.info(
                        "save-and-write: seq %s <= last_seq %s, pas d'écriture (request_id: %s)",
                        seq,
                        last_seq,
                        request_id,
                    )
                    return SaveGraphResponse(
                        success=True,
                        filename=filename,
                        json_content=json_content,
                        ack_seq=last_seq,
                        last_seq=last_seq,
                    )

        file_path, filename_out = write_unity_dialogue_to_file(
            config_service=config_service,
            json_content=json_content,
            filename=filename_without_ext,
            request_id=request_id,
            last_seq_after_write=seq,
        )

        extra: dict = {}
        if seq is not None:
            extra["ack_seq"] = seq
            extra["last_seq"] = seq

        logger.info(
            "Graphe sauvegardé et écrit: %s, %s nœuds (request_id: %s)",
            filename_out,
            request_data.metadata.node_count,
            request_id,
        )
        return SaveGraphResponse(
            success=True,
            filename=filename_out,
            json_content=json_content,
            **extra,
        )
    except ValidationException:
        raise
    except ValueError as e:
        logger.warning("Validation error lors de save-and-write (request_id: %s): %s", request_id, e)
        raise ValidationException(message=str(e), request_id=request_id)
    except Exception as e:
        logger.exception("Erreur lors de la sauvegarde du graphe (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la sauvegarde du graphe",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/generate-node",
    response_model=GenerateNodeResponse,
    status_code=status.HTTP_200_OK
)
async def generate_node(
    request_data: GenerateNodeRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    orchestrator: Annotated[GraphNodeOrchestrator, Depends(get_graph_node_orchestrator)],
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> GenerateNodeResponse:
    """Génère un nœud en contexte (extension de /generate/unity-dialogue).
    
    Délègue la logique métier à ``GraphNodeOrchestrator`` et se limite à :
    1. Instancier le client LLM
    2. Appeler l'orchestrateur
    3. Mapper le résultat vers le schéma HTTP
    
    Args:
        request_data: Contexte parent et instructions de génération.
        config_service: Service de configuration (injecté par DI).
        orchestrator: Orchestrateur de nœuds de graphe (injecté par DI).
        request_id: ID de la requête.
        
    Returns:
        Nœud généré avec connexions suggérées.
        
    Raises:
        ValidationException: Si les paramètres sont invalides.
        InternalServerException: Si la génération échoue.
    """
    try:
        from factories.llm_factory import LLMClientFactory

        fallback_chain = config_service.get_llm_fallback_chain()
        if not isinstance(fallback_chain, list):
            fallback_chain = []
        if len(fallback_chain) >= 2 and fallback_chain[0] == request_data.llm_model_identifier:
            llm_client = LLMClientFactory.create_client_with_fallback(
                primary_model_id=request_data.llm_model_identifier,
                fallback_model_ids=fallback_chain[1:],
                config=config_service.get_llm_config(),
                available_models=config_service.get_available_llm_models(),
                usage_service=usage_service,
                request_id=request_id,
            )
        else:
            llm_client = LLMClientFactory.create_client(
                model_id=request_data.llm_model_identifier,
                config=config_service.get_llm_config(),
                available_models=config_service.get_available_llm_models(),
                usage_service=usage_service,
                request_id=request_id,
            )

        result = await orchestrator.generate(
            llm_client=llm_client,
            parent_node_id=request_data.parent_node_id,
            parent_node_content=request_data.parent_node_content,
            user_instructions=request_data.user_instructions,
            context_selections=request_data.context_selections,
            system_prompt_override=request_data.system_prompt_override,
            max_choices=request_data.max_choices,
            target_choice_index=request_data.target_choice_index,
            generate_all_choices=request_data.generate_all_choices,
        )

        suggested_connections = [
            SuggestedConnection(**conn) for conn in result.suggested_connections
        ]

        logger.info(
            "generate-node terminé: %d nœud(s), parent: %s (request_id: %s)",
            len(result.nodes),
            result.parent_node_id,
            request_id,
        )

        # Annotation post-hoc des coûts avec le contexte dialogue/nœud.
        # Pour les générations batch (generate_all_choices), chaque nœud a son propre
        # request_id dans le LLM client — on annote uniquement le premier ici.
        # Les appels LLM batch partagent le même request_id de la requête HTTP.
        if request_data.dialogue_id and result.nodes:
            first_node_id = (
                result.nodes[0].get("id")
                if isinstance(result.nodes[0], dict)
                else getattr(result.nodes[0], "id", None)
            )
            if first_node_id:
                usage_service.annotate_usage(
                    request_id, request_data.dialogue_id, str(first_node_id)
                )
                _try_compute_context_relevance(usage_service, request_id)

        gdd_fp = _fingerprint_for_selections_safe(
            context_builder,
            request_data.context_selections
            if isinstance(request_data.context_selections, dict)
            else {},
        )

        return GenerateNodeResponse(
            node=result.nodes[0] if result.nodes else None,
            nodes=result.nodes if len(result.nodes) > 1 else None,
            suggested_connections=suggested_connections,
            parent_node_id=result.parent_node_id,
            batch_count=result.batch_count,
            generated_choices_count=result.generated_choices_count,
            connected_choices_count=result.connected_choices_count,
            failed_choices_count=result.failed_choices_count,
            total_choices_count=result.total_choices_count,
            context_gdd_content_fingerprint=gdd_fp,
        )

    except ValueError as e:
        logger.warning("Validation error lors de generate-node (request_id: %s): %s", request_id, e)
        raise ValidationException(
            message=str(e),
            request_id=request_id,
        )
    except ValidationException:
        raise
    except AllLLMProvidersUnavailableError:
        raise
    except Exception as e:
        logger.exception("Erreur lors de la génération de nœud (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la génération de nœud",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/estimate-cost",
    response_model=EstimateCostResponse,
    status_code=status.HTTP_200_OK,
)
async def estimate_cost(
    request_data: EstimateCostRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    token_service: Annotated[TokenEstimationService, Depends(get_token_estimation_service)],
    pricing_service: Annotated[LLMPricingService, Depends(get_llm_pricing_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> EstimateCostResponse:
    """Estime le coût LLM avant génération (pas d'appel LLM).
    
    Construit un prompt représentatif, estime les tokens et calcule le coût
    via TokenEstimationService + LLMPricingService.
    """
    try:
        model_id, provider = _resolve_model_and_provider(
            request_data.llm_model_identifier,
            config_service,
        )
        representative_prompt = _build_representative_prompt_for_estimate(
            request_data.parent_node_content,
            request_data.user_instructions,
            request_data.context_selections,
        )
        batch_count = _batch_count_from_request(request_data)
        cache_key = _estimate_cost_cache_key(representative_prompt, model_id, batch_count)
        cached = _estimate_cost_cache.get(cache_key)
        if cached is not None:
            return EstimateCostResponse(**cached)
        prompt_tokens, completion_tokens_per_node = token_service.estimate_tokens(
            representative_prompt, model_id
        )
        total_completion_tokens = completion_tokens_per_node * batch_count
        cost_usd = pricing_service.calculate_cost(
            model_id, prompt_tokens, total_completion_tokens
        )
        estimated_cost_eur = round(cost_usd * _USD_TO_EUR_RATE, 6)
        per_node_breakdown = None
        if batch_count > 1:
            first_node_cost_eur = round(
                pricing_service.calculate_cost(model_id, prompt_tokens, completion_tokens_per_node)
                * _USD_TO_EUR_RATE,
                6,
            )
            next_node_cost_eur = round(
                pricing_service.calculate_cost(model_id, 0, completion_tokens_per_node)
                * _USD_TO_EUR_RATE,
                6,
            )
            per_node_breakdown = [
                EstimateCostPerNodeBreakdown(
                    choice_index=0,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens_per_node,
                    estimated_cost_eur=first_node_cost_eur,
                )
            ]
            for i in range(1, batch_count):
                per_node_breakdown.append(
                    EstimateCostPerNodeBreakdown(
                        choice_index=i,
                        prompt_tokens=0,
                        completion_tokens=completion_tokens_per_node,
                        estimated_cost_eur=next_node_cost_eur,
                    )
                )

        # AC #3 : comparaison avec le provider alternatif.
        alt_model = _ALTERNATIVE_MODEL.get(provider)
        alternative_provider: Optional[str] = None
        alternative_model_id: Optional[str] = None
        alternative_cost_eur: Optional[float] = None
        cost_difference_pct: Optional[float] = None
        if alt_model:
            alt_cost_usd = pricing_service.calculate_cost(
                alt_model, prompt_tokens, total_completion_tokens
            )
            if alt_cost_usd > 0 or estimated_cost_eur == 0:
                alt_cost_eur = round(alt_cost_usd * _USD_TO_EUR_RATE, 6)
                alternative_provider = "mistral" if "mistral" in alt_model.lower() else "openai"
                alternative_model_id = alt_model
                alternative_cost_eur = alt_cost_eur
                if estimated_cost_eur > 0:
                    cost_difference_pct = round(
                        (alt_cost_eur - estimated_cost_eur) / estimated_cost_eur * 100, 1
                    )
                else:
                    cost_difference_pct = 0.0

        response = EstimateCostResponse(
            estimated_cost_eur=estimated_cost_eur,
            prompt_tokens=prompt_tokens,
            completion_tokens=total_completion_tokens,
            model_id=model_id,
            provider=provider,
            batch_count=batch_count if batch_count > 1 else None,
            per_node_breakdown=per_node_breakdown,
            alternative_provider=alternative_provider,
            alternative_model_id=alternative_model_id,
            alternative_cost_eur=alternative_cost_eur,
            cost_difference_pct=cost_difference_pct,
        )
        _estimate_cost_cache[cache_key] = response.model_dump()
        return response
    except Exception as e:
        logger.exception(
            "Erreur lors de l'estimation de coût (request_id: %s): %s",
            request_id,
            e,
        )
        raise InternalServerException(
            message="Erreur lors de l'estimation de coût",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/validate",
    response_model=ValidateGraphResponse,
    status_code=status.HTTP_200_OK
)
async def validate_graph(
    request_data: ValidateGraphRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> ValidateGraphResponse:
    """Valide un graphe (nœuds orphelins, références cassées, cycles).
    
    Args:
        request_data: Nœuds et edges à valider.
        request_id: ID de la requête.
        
    Returns:
        Résultat de validation avec erreurs et warnings.
    """
    try:
        # Valider le graphe
        validation_result = GraphValidationService.validate_graph(
            request_data.nodes,
            request_data.edges
        )
        
        # Convertir en schéma Pydantic
        errors = [
            ValidationErrorDetail(**e.to_dict())
            for e in validation_result.errors
        ]
        
        warnings = [
            ValidationErrorDetail(**w.to_dict())
            for w in validation_result.warnings
        ]
        
        logger.info(
            f"Validation effectuée: {len(errors)} erreurs, "
            f"{len(warnings)} warnings (request_id: {request_id})"
        )
        
        return ValidateGraphResponse(
            valid=validation_result.valid,
            errors=errors,
            warnings=warnings
        )
        
    except Exception as e:
        logger.exception(f"Erreur lors de la validation (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la validation du graphe",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/detect-ai-slop",
    response_model=DetectAiSlopResponse,
    status_code=status.HTTP_200_OK,
)
async def detect_ai_slop(
    request_data: DetectAiSlopRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> DetectAiSlopResponse:
    """Détecte les motifs « AI slop » (GPT-isms, répétitions, phrases génériques) — FR43.

    Même charge utile que ``POST .../validate`` : ``nodes`` + ``edges`` et options optionnelles.
    """
    try:
        raw = AISlopDetector.detect(
            request_data.nodes,
            request_data.edges,
            _ai_slop_options_to_data(request_data.options),
        )
        return _detect_ai_slop_response_from_result(raw)
    except Exception as e:
        logger.exception(
            "Erreur lors de la détection AI slop (request_id: %s)",
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la détection AI slop",
            details={"error": str(e)},
            request_id=request_id,
        ) from e


@router.post(
    "/detect-context-dropping",
    response_model=DetectContextDroppingResponse,
    status_code=status.HTTP_200_OK,
)
async def detect_context_dropping(
    request_data: DetectContextDroppingRequest,
    cd_rules_service: Annotated[ContextDroppingRulesService, Depends(get_cd_rules_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> DetectContextDroppingResponse:
    """Détecte l'absence ou l'usage trop indirect du contexte GDD dans le dialogue (FR44).

    Même famille de charge utile que ``validate-lore-explicit`` : ``nodes``, ``edges``,
    ``context_selections`` et champs optionnels pour extension 4.10.
    """
    try:
        raw = ContextDroppingDetector.detect(
            request_data.nodes,
            request_data.edges,
            request_data.context_selections,
            scene_instruction=request_data.scene_instruction,
            context_text=request_data.context_text,
            options=_context_dropping_options_to_data(request_data.options, cd_rules_service),
        )
        return build_detect_context_dropping_response(raw)
    except Exception as e:
        logger.exception(
            "Erreur lors de la détection context dropping (request_id: %s)",
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la détection context dropping",
            details={"error": str(e)},
            request_id=request_id,
        ) from e


@router.post(
    "/evaluate-dialogue-quality",
    response_model=EvaluateDialogueQualityResponse,
    status_code=status.HTTP_200_OK,
)
async def evaluate_dialogue_quality(
    request_data: EvaluateDialogueQualityRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    judge_service: Annotated[LLMQualityJudgeService, Depends(get_llm_quality_judge_service)],
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> EvaluateDialogueQualityResponse:
    """Évalue la qualité narrative du graphe via un juge LLM (FR42).

    Même charge utile que ``POST .../validate`` (nodes + edges). Utilise le provider
    configuré (OpenAI / Mistral / DummyLLM sans clé).

    Args:
        request_data: Graphe ReactFlow et modèle optionnel.
        config_service: Configuration (modèles disponibles).
        judge_service: Service juge qualité.
        usage_service: Suivi d'utilisation LLM (best-effort).
        request_id: Corrélation.

    Returns:
        Scores, critères, commentaires et rappel variance ±1.

    Raises:
        ValidationException: Graphe non convertible.
        InternalServerException: Échec juge ou parsing.
    """
    from factories.llm_factory import LLMClientFactory

    raw_model = request_data.llm_model_identifier
    if raw_model and str(raw_model).strip():
        primary_model = str(raw_model).strip()
    else:
        primary_model = LLMQualityJudgeService.resolve_default_model_id(config_service)

    fallback_chain = config_service.get_llm_fallback_chain()
    if not isinstance(fallback_chain, list):
        fallback_chain = []
    t0 = time.perf_counter()
    try:
        if len(fallback_chain) >= 2 and fallback_chain[0] == primary_model:
            llm_client = LLMClientFactory.create_client_with_fallback(
                primary_model_id=primary_model,
                fallback_model_ids=fallback_chain[1:],
                config=config_service.get_llm_config(),
                available_models=config_service.get_available_llm_models(),
                usage_service=usage_service,
                request_id=request_id,
            )
        else:
            llm_client = LLMClientFactory.create_client(
                model_id=primary_model,
                config=config_service.get_llm_config(),
                available_models=config_service.get_available_llm_models(),
                usage_service=usage_service,
                request_id=request_id,
            )

        result = await judge_service.evaluate_graph(
            nodes=request_data.nodes,
            edges=request_data.edges,
            llm_client=llm_client,
            config_service=config_service,
            model_id=primary_model,
        )
        duration_ms = int((time.perf_counter() - t0) * 1000)
        pt = int(getattr(llm_client, "last_usage_prompt_tokens", 0) or 0)
        ct = int(getattr(llm_client, "last_usage_completion_tokens", 0) or 0)
        try:
            usage_service.track_usage(
                request_id=request_id,
                model_name=primary_model,
                prompt_tokens=pt,
                completion_tokens=ct,
                total_tokens=pt + ct,
                duration_ms=max(1, duration_ms),
                success=True,
                endpoint="/api/v1/unity-dialogues/graph/evaluate-dialogue-quality",
                k_variants=1,
            )
        except Exception as track_exc:
            logger.warning(
                "track_usage juge qualité ignoré (request_id=%s): %s",
                request_id,
                track_exc,
            )
        return result
    except ValueError as exc:
        logger.warning(
            "Évaluation qualité: validation graphe (request_id=%s): %s",
            request_id,
            exc,
        )
        raise ValidationException(
            message=str(exc),
            request_id=request_id,
        ) from exc
    except AllLLMProvidersUnavailableError:
        raise
    except Exception as exc:
        logger.exception(
            "Évaluation qualité LLM échouée (request_id=%s)",
            request_id,
        )
        duration_ms = int((time.perf_counter() - t0) * 1000)
        try:
            usage_service.track_usage(
                request_id=request_id,
                model_name=primary_model,
                prompt_tokens=0,
                completion_tokens=0,
                total_tokens=0,
                duration_ms=max(1, duration_ms),
                success=False,
                endpoint="/api/v1/unity-dialogues/graph/evaluate-dialogue-quality",
                k_variants=1,
                error_message=str(exc),
            )
        except Exception as track_exc:
            logger.debug(
                "track_usage échec juge ignoré (request_id=%s): %s",
                request_id,
                track_exc,
            )
        raise InternalServerException(
            message=f"Échec de l'évaluation qualité LLM : {exc}",
            details={"error": str(exc)},
            request_id=request_id,
        ) from exc


@router.post(
    "/validate-lore-explicit",
    response_model=ValidateLoreExplicitResponse,
    status_code=status.HTTP_200_OK,
)
async def validate_lore_explicit(
    request_data: ValidateLoreExplicitRequest,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> ValidateLoreExplicitResponse:
    """Détecte les contradictions lore explicites (texte graphe vs faits GDD).

    Args:
        request_data: Nœuds, arêtes, sélections contexte et faits optionnels.
        context_builder: ContextBuilder pour dériver des faits depuis le GDD.
        request_id: Identifiant de corrélation.

    Returns:
        Liste d'erreurs ``lore_contradiction_explicit`` et résumé agrégé.
    """
    try:
        base_facts = [
            LoreGddFact(
                entity_name=p.entity_name,
                category=p.category,
                gdd_path=p.gdd_path,
                vitality=p.vitality,
            )
            for p in request_data.gdd_lore_facts
        ]
        facts, vitality_contexts, ambiguity_entities = merge_lore_facts_with_context_builder(
            base_facts,
            request_data.context_selections,
            request_data.scene_instruction,
            context_builder,
        )
        (
            valid,
            err_dicts,
            warn_dicts,
            summary,
            summary_explicit_only,
            c_count,
            n_count,
            pw_count,
            pn_count,
            amb_count,
            amb_nodes,
        ) = validate_explicit_lore_contradictions(
            request_data.nodes,
            request_data.edges,
            facts,
            vitality_contexts,
            ambiguity_entities,
        )
        errors = [ValidationErrorDetail(**e) for e in err_dicts]
        warnings = [ValidationErrorDetail(**w) for w in warn_dicts]
        logger.info(
            "Validation lore explicite: %s contradictions, %s nœuds, %s avertissements vitalité, "
            "%s ambiguïtés (request_id=%s)",
            c_count,
            n_count,
            pw_count,
            amb_count,
            request_id,
        )
        return ValidateLoreExplicitResponse(
            valid=valid,
            errors=errors,
            warnings=warnings,
            contradiction_count=c_count,
            nodes_with_contradictions_count=n_count,
            potential_warnings_count=pw_count,
            nodes_with_potential_warnings_count=pn_count,
            ambiguity_warnings_count=amb_count,
            nodes_with_ambiguity_warnings_count=amb_nodes,
            summary=summary,
            summary_explicit_only=summary_explicit_only,
        )
    except Exception as e:
        logger.exception(
            "Erreur lors de la validation lore explicite (request_id: %s)",
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la validation lore explicite",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/calculate-layout",
    response_model=CalculateLayoutResponse,
    status_code=status.HTTP_200_OK
)
async def calculate_layout(
    request_data: CalculateLayoutRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> CalculateLayoutResponse:
    """Calcule un layout automatique pour le graphe.
    
    Note: Pour Dagre, le calcul réel sera fait côté frontend avec dagre.js.
    Cette endpoint retourne un layout basique en cascade.
    
    Args:
        request_data: Nœuds, edges et paramètres de layout.
        request_id: ID de la requête.
        
    Returns:
        Nœuds avec positions calculées.
    """
    try:
        # Calculer le layout
        laid_out_nodes = GraphConversionService.calculate_layout(
            request_data.nodes,
            request_data.edges,
            request_data.algorithm,
            request_data.direction
        )
        
        logger.info(
            f"Layout calculé: {len(laid_out_nodes)} nœuds, "
            f"algorithme: {request_data.algorithm} (request_id: {request_id})"
        )
        
        return CalculateLayoutResponse(nodes=laid_out_nodes)
        
    except Exception as e:
        logger.exception(f"Erreur lors du calcul de layout (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors du calcul de layout",
            details={"error": str(e)},
            request_id=request_id
        )


def _validate_dialogue_exists(
    dialogue_id: str,
    config_service: ConfigurationService,
    request_id: Optional[str],
) -> None:
    """Vérifie que le dialogue existe (fichier Unity). Skip si dialogue_id == 'current'."""
    if dialogue_id == "current":
        return
    fname = dialogue_id
    if ".." in fname or "/" in fname or "\\" in fname:
        raise ValidationException(
            message="Nom de fichier invalide (caractères interdits)",
            details={"dialogue_id": dialogue_id},
            request_id=request_id,
        )
    unity_path = config_service.get_unity_dialogues_path()
    if not unity_path:
        raise ValidationException(
            message="Le chemin Unity dialogues n'est pas configuré.",
            details={"field": "unity_dialogues_path"},
            request_id=request_id,
        )
    if not fname.endswith(".json"):
        fname = fname + ".json"
    path = Path(unity_path) / fname
    if not path.exists():
        raise NotFoundException(
            resource_type="Dialogue Unity",
            resource_id=fname,
            request_id=request_id,
        )


# Instructions par défaut pour prompt reconstruit (aligné GraphNodeOrchestrator, Story 1.14).
_DEFAULT_INSTRUCTIONS = "Ecris la réponse du PNJ à ce que dit le PJ"


def _load_unity_nodes_from_dialogue(
    config_service: ConfigurationService,
    dialogue_id: str,
) -> list:
    """Charge la liste des nœuds Unity d'un dialogue (fichier JSON).
    
    Args:
        config_service: Service de configuration (chemin Unity).
        dialogue_id: ID du dialogue (nom de fichier sans ou avec .json).
        
    Returns:
        Liste des nœuds (dict).
        
    Raises:
        FileNotFoundError: Si le fichier n'existe pas.
        ValueError: Si le JSON est invalide.
    """
    unity_path = config_service.get_unity_dialogues_path()
    if not unity_path:
        raise ValueError("Chemin Unity non configuré")
    fname = dialogue_id if dialogue_id.endswith(".json") else dialogue_id + ".json"
    path = Path(unity_path) / fname
    if not path.exists():
        raise FileNotFoundError(f"Dialogue {dialogue_id} introuvable")
    raw = path.read_text(encoding="utf-8")
    doc = json.loads(raw)
    if isinstance(doc, list):
        return doc
    return doc.get("nodes", [])


def _reconstruct_prompt_for_node(
    config_service: ConfigurationService,
    dialogue_id: str,
    node_id: str,
    request_id: Optional[str] = None,
) -> str:
    """Reconstruit le prompt utilisateur pour un nœud à partir du document (Story 1.14).
    
    Même format que GraphGenerationService (contexte parent + choix + instructions).
    Utilisé quand le prompt n'est pas stocké (avant Story 1.15).
    
    Args:
        config_service: Service de configuration.
        dialogue_id: ID du dialogue.
        node_id: ID du nœud cible.
        request_id: ID de requête pour les exceptions (optionnel).
        
    Returns:
        Chaîne du prompt reconstruit.
        
    Raises:
        NotFoundException: Nœud introuvable dans le document.
    """
    nodes = _load_unity_nodes_from_dialogue(config_service, dialogue_id)
    node = next((n for n in nodes if n.get("id") == node_id), None)
    if not node:
        raise NotFoundException(
            resource_type="Node",
            resource_id=node_id,
            request_id=request_id,
        )
    parent_node: Optional[dict] = None
    choice_text: Optional[str] = None
    for n in nodes:
        choices = n.get("choices") or []
        for c in choices:
            if c.get("targetNode") == node_id:
                parent_node = n
                choice_text = c.get("text", "")
                break
        if parent_node is not None:
            break
    if not parent_node:
        parent_speaker = "PNJ"
        parent_line = ""
        choice_text = None
        instructions = _DEFAULT_INSTRUCTIONS
    else:
        parent_speaker = parent_node.get("speaker", "PNJ")
        parent_line = parent_node.get("line", "")
        instructions = _DEFAULT_INSTRUCTIONS
    if choice_text is not None:
        raw = (
            f"Contexte précédent:\n{parent_speaker}: {parent_line}\n\n"
            f"Réponse du joueur:\n{choice_text}\n\n"
            f"Instructions pour la suite:\n{instructions}\n"
        )
    else:
        raw = (
            f"Contexte précédent:\n{parent_speaker}: {parent_line}\n\n"
            f"Instructions pour la suite:\n{instructions}\n"
        )
    return raw


@router.get(
    "/prompt",
    response_model=NodePromptResponse,
    status_code=status.HTTP_200_OK,
)
async def get_node_prompt(
    dialogue_id: str,
    node_id: str,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> NodePromptResponse:
    """Retourne le prompt exact ou reconstruit pour un nœud (Story 1.14).
    
    Sans Story 1.15 (stockage prompt), le prompt est reconstruit à partir du document.
    Retourne aussi tokens/timestamp si un enregistrement LLM existe pour ce dialogue/nœud.
    """
    try:
        _validate_dialogue_exists(dialogue_id, config_service, request_id)
    except (NotFoundException, ValidationException):
        raise
    try:
        record = usage_service.repository.get_by_dialogue_and_node(dialogue_id, node_id)
    except Exception as e:
        logger.debug(
            "get_node_prompt: impossible de charger le record (dialogue_id=%s, node_id=%s): %s",
            dialogue_id,
            node_id,
            e,
        )
        record = None

    # Story 1.15+: si le record contient un prompt stocké, l'utiliser (is_historical=True)
    stored_prompt = getattr(record, "prompt", None) if record else None
    if stored_prompt and isinstance(stored_prompt, str) and stored_prompt.strip():
        return NodePromptResponse(
            raw_prompt=stored_prompt.strip(),
            prompt_tokens=record.prompt_tokens if record else None,
            completion_tokens=record.completion_tokens if record else None,
            timestamp=record.timestamp if record else None,
            is_historical=True,
            message="Prompt historique - contexte GDD depuis modifié",
        )

    try:
        raw_prompt = _reconstruct_prompt_for_node(
            config_service, dialogue_id, node_id, request_id=request_id
        )
    except NotFoundException:
        raise
    except FileNotFoundError as e:
        raise NotFoundException(
            resource_type="Dialogue Unity",
            resource_id=dialogue_id,
            request_id=request_id,
        ) from e
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning("Erreur chargement document pour prompt (request_id: %s): %s", request_id, e)
        raise ValidationException(
            message="Document invalide ou introuvable pour la reconstruction du prompt",
            details={"error": str(e)},
            request_id=request_id,
        ) from e
    except Exception as e:
        logger.exception("Erreur GET prompt (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la récupération du prompt",
            details={"error": str(e)},
            request_id=request_id,
        ) from e
    return NodePromptResponse(
        raw_prompt=raw_prompt,
        prompt_tokens=record.prompt_tokens if record else None,
        completion_tokens=record.completion_tokens if record else None,
        timestamp=record.timestamp if record else None,
        is_historical=False,
        message="Prompt reconstruit (contexte actuel)",
    )


@router.post(
    "/nodes/{node_id}/accept",
    status_code=status.HTTP_200_OK
)
async def accept_node(
    node_id: str,
    request_data: AcceptNodeRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)] = None,
):
    """Accepte un nœud généré (passe de "pending" à "accepted").
    
    Validation-only: vérifie que le dialogue existe. La persistance (mise à jour
    du JSON avec status "accepted") est faite par le frontend via saveDialogue()
    après mise à jour optimiste du store.
    
    Args:
        node_id: ID du nœud à accepter.
        request_data: ID du dialogue.
        request_id: ID de la requête.
        config_service: Service de configuration (injecté).
        
    Returns:
        Succès de l'opération.
        
    Raises:
        NotFoundException: Si le dialogue est introuvable.
        ValidationException: Si dialogue_id invalide.
    """
    try:
        _validate_dialogue_exists(
            request_data.dialogue_id, config_service, request_id
        )
        logger.info(
            f"Nœud accepté: {node_id}, dialogue: {request_data.dialogue_id} "
            f"(request_id: {request_id})"
        )
        return {"success": True, "node_id": node_id, "status": "accepted"}
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de l'acceptation du nœud (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de l'acceptation du nœud",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/nodes/{node_id}/regenerate",
    response_model=RegenerateNodeResponse,
    status_code=status.HTTP_200_OK,
)
async def regenerate_node(
    node_id: str,
    request_data: RegenerateNodeRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    orchestrator: Annotated[GraphNodeOrchestrator, Depends(get_graph_node_orchestrator)],
    usage_service: Annotated[LLMUsageService, Depends(get_llm_usage_service)],
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> RegenerateNodeResponse:
    """Régénère un nœud avec de nouvelles instructions (Story 1.10).

    Préserve le même node_id (remplacement in-place). Utilise le contexte parent
    envoyé par le client pour appeler la même logique que generate-node.
    """
    try:
        _validate_dialogue_exists(
            request_data.dialogue_id, config_service, request_id
        )
        from factories.llm_factory import LLMClientFactory

        fallback_chain = config_service.get_llm_fallback_chain()
        if not isinstance(fallback_chain, list):
            fallback_chain = []
        if len(fallback_chain) >= 2 and fallback_chain[0] == request_data.llm_model_identifier:
            llm_client = LLMClientFactory.create_client_with_fallback(
                primary_model_id=request_data.llm_model_identifier,
                fallback_model_ids=fallback_chain[1:],
                config=config_service.get_llm_config(),
                available_models=config_service.get_available_llm_models(),
                usage_service=usage_service,
                request_id=request_id,
            )
        else:
            llm_client = LLMClientFactory.create_client(
                model_id=request_data.llm_model_identifier,
                config=config_service.get_llm_config(),
                available_models=config_service.get_available_llm_models(),
                usage_service=usage_service,
                request_id=request_id,
            )

        result = await orchestrator.generate(
            llm_client=llm_client,
            parent_node_id=request_data.parent_node_id,
            parent_node_content=request_data.parent_node_content,
            user_instructions=request_data.new_instructions,
            context_selections=request_data.context_selections,
            system_prompt_override=request_data.system_prompt_override,
            max_choices=None,
            target_choice_index=request_data.via_choice_index,
            generate_all_choices=False,
        )

        if not result.nodes:
            raise InternalServerException(
                message="Aucun nœud généré lors de la régénération",
                request_id=request_id,
            )

        new_node = dict(result.nodes[0])
        new_node["id"] = node_id

        suggested_connections = [
            SuggestedConnection(
                **{
                    "from": c.get("from", c.get("from_node", "")),
                    "to": node_id,
                    "via_choice_index": c.get("via_choice_index"),
                    "connection_type": c.get("connection_type", "choice"),
                }
            )
            for c in result.suggested_connections
        ]

        logger.info(
            "Nœud régénéré: %s, parent: %s (request_id: %s)",
            node_id,
            request_data.parent_node_id,
            request_id,
        )
        usage_service.annotate_usage(request_id, request_data.dialogue_id, str(node_id))
        _try_compute_context_relevance(usage_service, request_id)
        gdd_fp = _fingerprint_for_selections_safe(
            context_builder,
            request_data.context_selections
            if isinstance(request_data.context_selections, dict)
            else {},
        )
        return RegenerateNodeResponse(
            node=new_node,
            suggested_connections=suggested_connections,
            context_gdd_content_fingerprint=gdd_fp,
        )
    except (NotFoundException, ValidationException):
        raise
    except AllLLMProvidersUnavailableError:
        raise
    except InternalServerException:
        raise
    except Exception as e:
        logger.exception("Erreur lors de la régénération du nœud (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la régénération du nœud",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/nodes/{node_id}/reject",
    status_code=status.HTTP_200_OK
)
async def reject_node(
    node_id: str,
    request_data: RejectNodeRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)] = None,
):
    """Rejette un nœud généré (supprime le nœud).
    
    Validation-only: vérifie que le dialogue existe. La persistance (suppression
    du nœud du JSON) est faite par le frontend après succès: mise à jour locale
    puis saveDialogue() pour persister immédiatement (AC#3).
    
    Args:
        node_id: ID du nœud à rejeter.
        request_data: ID du dialogue.
        request_id: ID de la requête.
        config_service: Service de configuration (injecté).
        
    Returns:
        Succès de l'opération.
        
    Raises:
        NotFoundException: Si le dialogue est introuvable.
        ValidationException: Si dialogue_id invalide.
    """
    try:
        _validate_dialogue_exists(
            request_data.dialogue_id, config_service, request_id
        )
        logger.info(
            f"Nœud rejeté: {node_id}, dialogue: {request_data.dialogue_id} "
            f"(request_id: {request_id})"
        )
        return {"success": True, "node_id": node_id, "status": "rejected"}
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.exception(f"Erreur lors du rejet du nœud (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors du rejet du nœud",
            details={"error": str(e)},
            request_id=request_id
        )

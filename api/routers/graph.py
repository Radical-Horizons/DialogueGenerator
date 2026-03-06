"""Router API pour la gestion de graphes de dialogues."""
import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Request, status
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
    SuggestedConnection,
    ValidateGraphRequest,
    ValidateGraphResponse,
    ValidationErrorDetail,
    CalculateLayoutRequest,
    CalculateLayoutResponse,
    AcceptNodeRequest,
    RejectNodeRequest,
    RegenerateNodeRequest,
    RegenerateNodeResponse,
)
from api.exceptions import InternalServerException, NotFoundException, ValidationException
from api.dependencies import (
    get_config_service,
    get_request_id,
    get_graph_node_orchestrator,
    get_token_estimation_service,
    get_llm_pricing_service,
)
from services.configuration_service import ConfigurationService
from services.graph_conversion_service import GraphConversionService
from services.unity_dialogue_export_service import (
    write_unity_dialogue_to_file,
    read_last_seq,
)
from services.graph_validation_service import GraphValidationService
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.token_estimation_service import TokenEstimationService
from services.llm_pricing_service import LLMPricingService

logger = logging.getLogger(__name__)

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
    """Nombre de nœuds à estimer (1 si single, N si generate_all_choices)."""
    if not request_data.generate_all_choices:
        return 1
    choices = request_data.parent_node_content.get("choices", [])
    count = 0
    for c in choices:
        target = c.get("targetNode")
        if not target or target == "END":
            count += 1
    return max(1, count)


# Cache estimation coût par hash (contexte + instructions + model_id), TTL 60s (AC #1 <1s).
_estimate_cost_cache: TTLCache[str, dict] = TTLCache(maxsize=200, ttl=60)


def _estimate_cost_cache_key(representative_prompt: str, model_id: str, batch_count: int) -> str:
    """Clé de cache pour estimate-cost."""
    blob = f"{representative_prompt}|{model_id}|{batch_count}"
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


router = APIRouter(prefix="/api/v1/unity-dialogues/graph", tags=["Graph Editor"])


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

        llm_client = LLMClientFactory.create_client(
            model_id=request_data.llm_model_identifier,
            config=config_service.get_llm_config(),
            available_models=config_service.get_available_llm_models(),
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
        )

    except ValueError as e:
        logger.warning("Validation error lors de generate-node (request_id: %s): %s", request_id, e)
        raise ValidationException(
            message=str(e),
            request_id=request_id,
        )
    except ValidationException:
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

        llm_client = LLMClientFactory.create_client(
            model_id=request_data.llm_model_identifier,
            config=config_service.get_llm_config(),
            available_models=config_service.get_available_llm_models(),
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
        return RegenerateNodeResponse(node=new_node, suggested_connections=suggested_connections)
    except (NotFoundException, ValidationException):
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

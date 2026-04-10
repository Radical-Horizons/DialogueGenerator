"""Router API — qualité dialogue, détection AI slop et context dropping."""

from __future__ import annotations

import logging
import time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, status

from api.dependencies import (
    get_cd_rules_service,
    get_config_service,
    get_llm_quality_judge_service,
    get_llm_usage_service,
    get_request_id,
)
from api.exceptions import AllLLMProvidersUnavailableError, InternalServerException, ValidationException
from api.schemas.dialogue_quality import (
    EvaluateDialogueQualityRequest,
    EvaluateDialogueQualityResponse,
)
from api.schemas.graph import (
    AiSlopDetectionOptions,
    AiSlopOccurrenceItem,
    AiSlopRepetitionGroup,
    DetectAiSlopRequest,
    DetectAiSlopResponse,
    DetectContextDroppingOptions,
    DetectContextDroppingRequest,
    DetectContextDroppingResponse,
)
from api.utils.context_dropping_response import build_detect_context_dropping_response
from services.ai_slop_detector import (
    AISlopDetector,
    AiSlopDetectionOptionsData,
    AiSlopDetectionResult,
)
from services.configuration_service import ConfigurationService
from services.context_dropping_detector import ContextDroppingDetector, ContextDroppingOptionsData
from services.context_dropping_rules_service import ContextDroppingRulesService
from services.llm_quality_judge_service import LLMQualityJudgeService
from services.llm_usage_service import LLMUsageService
from api.routers.graph_router_helpers import create_llm_client_for_router

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
    """Fusionne options requête + règles persistées (Story 4.10)."""
    persisted = _load_persisted_cd_rules(cd_rules_service)

    if options is not None and options.rules_profile is not None:
        profile = options.rules_profile
    elif persisted is not None:
        profile = persisted.rules_profile
    else:
        profile = "strict"

    if profile not in ("strict", "light"):
        profile = "strict"

    if options is not None and options.tolerance is not None:
        tolerance = options.tolerance
    elif persisted is not None:
        tolerance = persisted.tolerance
    else:
        tolerance = None

    if options is not None and options.mandatory_info is not None:
        mandatory_info = list(options.mandatory_info)
    elif persisted is not None:
        mandatory_info = list(persisted.mandatory_info)
    else:
        mandatory_info = []

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


router = APIRouter()


@router.post(
    "/detect-ai-slop",
    response_model=DetectAiSlopResponse,
    status_code=status.HTTP_200_OK,
)
async def detect_ai_slop(
    request_data: DetectAiSlopRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> DetectAiSlopResponse:
    """Détecte les motifs « AI slop » (GPT-isms, répétitions, phrases génériques) — FR43."""
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
    """Détecte l'absence ou l'usage trop indirect du contexte GDD dans le dialogue (FR44)."""
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
    """Évalue la qualité narrative du graphe via un juge LLM (FR42)."""
    raw_model = request_data.llm_model_identifier
    if raw_model and str(raw_model).strip():
        primary_model = str(raw_model).strip()
    else:
        primary_model = LLMQualityJudgeService.resolve_default_model_id(config_service)

    t0 = time.perf_counter()
    try:
        llm_client = create_llm_client_for_router(
            primary_model,
            config_service,
            usage_service,
            request_id,
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

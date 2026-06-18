"""Router API — validation structurelle et lore explicite du graphe."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, status

from api.dependencies import (
    get_dialogue_flag_reference_validation_service,
    get_context_builder,
    get_request_id,
)
from api.exceptions import InternalServerException
from api.schemas.graph import (
    ValidateGraphRequest,
    ValidateGraphResponse,
    ValidateLoreExplicitRequest,
    ValidateLoreExplicitResponse,
    ValidateSchemaRequest,
    ValidateSchemaResponse,
    ValidationErrorDetail,
)
from api.utils.validate_schema_api import validate_schema_response_from_result
from services.unity_export_validation_service import validate_unity_export_document
from core.context.context_builder import ContextBuilder
from services.dialogue_flag_reference_validation_service import (
    DialogueFlagReferenceValidationService,
    analysis_to_validation_api_payload,
)
from services.graph_conversion_service import GraphConversionService
from services.graph_validation_service import GraphValidationService
from services.lore_contradiction_validator import (
    LoreGddFact,
    merge_lore_facts_with_context_builder,
    validate_explicit_lore_contradictions,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/validate",
    response_model=ValidateGraphResponse,
    status_code=status.HTTP_200_OK,
)
async def validate_graph(
    request_data: ValidateGraphRequest,
    flag_ref_service: Annotated[
        DialogueFlagReferenceValidationService,
        Depends(get_dialogue_flag_reference_validation_service),
    ],
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> ValidateGraphResponse:
    """Valide un graphe (nœuds orphelins, références cassées, cycles)."""
    try:
        validation_result = GraphValidationService.validate_graph(
            request_data.nodes,
            request_data.edges,
        )

        errors = [
            ValidationErrorDetail(**e.to_dict())
            for e in validation_result.errors
        ]

        warnings = [
            ValidationErrorDetail(**w.to_dict())
            for w in validation_result.warnings
        ]

        flag_errors_n = 0
        if request_data.document:
            analysis = flag_ref_service.analyze_document(request_data.document)
            fe, fw = analysis_to_validation_api_payload(analysis)
            errors.extend(fe)
            warnings.extend(fw)
            flag_errors_n = len(fe)

        merged_valid = validation_result.valid and flag_errors_n == 0

        logger.info(
            "Validation effectuée: %s erreurs, %s warnings (request_id: %s)",
            len(errors),
            len(warnings),
            request_id,
        )

        return ValidateGraphResponse(
            valid=merged_valid,
            errors=errors,
            warnings=warnings,
        )

    except Exception as e:
        logger.exception("Erreur lors de la validation (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la validation du graphe",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/validate-schema",
    response_model=ValidateSchemaResponse,
    status_code=status.HTTP_200_OK,
)
async def validate_schema(
    request_data: ValidateSchemaRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
) -> ValidateSchemaResponse:
    """Valide la conformité du graphe courant contre le schéma JSON Unity (FR48)."""
    try:
        if not request_data.nodes:
            logger.info(
                "validate-schema: graphe vide, accepté sans validation (request_id: %s)",
                request_id,
            )
            return ValidateSchemaResponse(
                is_valid=True,
                errors=[],
                error_count=0,
                warnings=[],
                structured_errors=[],
            )

        unity_doc = GraphConversionService.graph_to_unity_document(
            request_data.nodes,
            request_data.edges,
            dialogue_flags=request_data.dialogue_flags,
        )
        result = validate_unity_export_document(unity_doc)
        logger.info(
            "validate-schema: is_valid=%s, %d error(s), %d warning(s) (request_id: %s)",
            result.is_valid,
            result.error_count,
            len(result.warnings),
            request_id,
        )
        return validate_schema_response_from_result(result)
    except Exception as e:
        logger.exception("Erreur lors de validate-schema (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la validation du schéma Unity",
            details={"error": str(e)},
            request_id=request_id,
        ) from e


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
    """Détecte les contradictions lore explicites (texte graphe vs faits GDD)."""
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

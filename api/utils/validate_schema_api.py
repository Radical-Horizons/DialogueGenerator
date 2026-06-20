"""Helpers réponse API validate-schema (Story 5.3 / FR51)."""
from __future__ import annotations

from api.schemas.graph import SchemaValidationIssueDetail, ValidateSchemaResponse
from services.unity_export_validation_service import (
    UnityExportValidationResult,
    validation_result_to_api_payload,
)


def validate_schema_response_from_result(
    result: UnityExportValidationResult,
) -> ValidateSchemaResponse:
    """Construit ``ValidateSchemaResponse`` depuis un résultat service unifié."""
    payload = validation_result_to_api_payload(result)
    return ValidateSchemaResponse(
        is_valid=payload["is_valid"],
        errors=payload["errors"],
        error_count=payload["error_count"],
        warnings=[SchemaValidationIssueDetail(**w) for w in payload["warnings"]],
        structured_errors=[
            SchemaValidationIssueDetail(**e) for e in payload["structured_errors"]
        ],
    )

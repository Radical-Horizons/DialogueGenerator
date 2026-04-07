"""Construction de la réponse HTTP pour POST .../detect-context-dropping (FR44)."""
from __future__ import annotations

from api.schemas.graph import ContextDroppingCaseItem, DetectContextDroppingResponse
from services.context_dropping_detector import ContextDroppingDetectionResult


def build_detect_context_dropping_response(
    raw: ContextDroppingDetectionResult,
) -> DetectContextDroppingResponse:
    """Mappe le résultat service vers le schéma Pydantic."""
    items = [
        ContextDroppingCaseItem(
            kind=c.kind,
            node_id=c.node_id,
            node_display_id=c.node_display_id,
            context_label=c.context_label,
            message=c.message,
            suggestion=c.suggestion,
            severity=c.severity,
        )
        for c in raw.cases
    ]
    return DetectContextDroppingResponse(
        summary=raw.summary,
        case_count=raw.case_count,
        cases=items,
        message=raw.message,
        rules_profile_effective=raw.rules_profile_effective,
    )

"""Service injectable : références flags vs ``dialogueFlags`` (Story 9.5)."""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, MutableMapping, Tuple

from api.schemas.graph import ValidationErrorDetail

from services.dialogue_flag_reference_validation import (
    FlagReferenceAnalysisResult,
    analyze_dialogue_flag_references,
)
from services.flag_catalog_service import FlagCatalogService


class DialogueFlagReferenceValidationService:
    """Analyse déclarations dialogue vs usages dans conditions et effets."""

    def __init__(self, catalog: FlagCatalogService) -> None:
        """Initialise avec le catalogue CSV Unity.

        Args:
            catalog: Lecture des définitions pour suggestions typo.
        """
        self._catalog = catalog

    def _catalog_flag_ids(self) -> frozenset[str]:
        defs = self._catalog.load_definitions()
        return frozenset(str(d.get("id", "")).strip() for d in defs if str(d.get("id", "")).strip())

    def analyze_document(self, document: Mapping[str, Any]) -> FlagReferenceAnalysisResult:
        """Lance l'analyse FR93 sur un document canonique."""
        return analyze_dialogue_flag_references(
            document,
            catalog_flag_ids=self._catalog_flag_ids(),
        )


def analysis_to_validation_api_payload(
    result: FlagReferenceAnalysisResult,
) -> Tuple[List[ValidationErrorDetail], List[ValidationErrorDetail]]:
    """Convertit le résultat pur en modèles API (erreurs graphe / panneau)."""
    errs: List[ValidationErrorDetail] = []
    for e in result.errors:
        hint = (
            f" Suggestion : utiliser « {e.suggested_flag_id} »."
            if e.suggested_flag_id
            else ""
        )
        errs.append(
            ValidationErrorDetail(
                type="dialogue_flag_undeclared",
                node_id=e.node_id,
                message=e.message + hint,
                severity="error",
                target=e.json_path,
                referenced_flag_id=e.flag_id,
                suggested_flag_id=e.suggested_flag_id,
            )
        )

    warns: List[ValidationErrorDetail] = []
    for w in result.warnings:
        warns.append(
            ValidationErrorDetail(
                type="dialogue_flag_unused",
                node_id=None,
                message=w.message,
                severity="warning",
                referenced_flag_id=w.flag_id,
            )
        )
    return errs, warns

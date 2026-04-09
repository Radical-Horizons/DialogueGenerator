"""Router API : règles de validation anti-context-dropping (Story 4.10).

Routes :
  GET  /api/v1/validation/rules/context-dropping  → règles persistées (ou défauts)
  PUT  /api/v1/validation/rules/context-dropping  → sauvegarder nouvelles règles
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from api.schemas.validation_rules import ContextDroppingRulesSchema
from services.context_dropping_rules_service import ContextDroppingRulesService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/validation/rules",
    tags=["validation-rules"],
)

# Chemin de stockage relatif à la racine du projet (résolu à l'import).
_RULES_FILE = Path("data") / "validation-rules" / "context-dropping.json"
_rules_service = ContextDroppingRulesService(storage_file=_RULES_FILE)


@router.get(
    "/context-dropping",
    response_model=ContextDroppingRulesSchema,
    status_code=status.HTTP_200_OK,
    summary="Obtenir les règles de détection anti-context-dropping",
)
def get_context_dropping_rules() -> ContextDroppingRulesSchema:
    """Retourne les règles persistées, ou les défauts documentés si le fichier est absent.

    Ne retourne jamais 500 opaque : JSON invalide → 422 avec message explicite.
    """
    try:
        return _rules_service.get_rules()
    except ValueError as exc:
        logger.warning("Fichier de règles corrompu : %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Fichier de règles illisible : {exc}",
        ) from exc


@router.put(
    "/context-dropping",
    response_model=ContextDroppingRulesSchema,
    status_code=status.HTTP_200_OK,
    summary="Sauvegarder les règles de détection anti-context-dropping",
)
def put_context_dropping_rules(
    body: ContextDroppingRulesSchema,
) -> ContextDroppingRulesSchema:
    """Remplace les règles persistées par les nouvelles valeurs.

    Erreur de schéma → 422 automatique (Pydantic).
    Erreur d'écriture → 422 avec message explicite.
    """
    try:
        return _rules_service.save_rules(body)
    except (ValueError, OSError) as exc:
        logger.error("Impossible de sauvegarder les règles : %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Erreur lors de la sauvegarde des règles : {exc}",
        ) from exc

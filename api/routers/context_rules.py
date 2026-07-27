"""Router contexte GDD — règles de sélection de contexte (CRUD + par type de dialogue).
"""
import logging
from typing import Annotated
from fastapi import APIRouter, Depends, Request, status
from api.routers.auth import get_current_user
from api.schemas.context_rules import (
    ContextRule,
    CreateRuleRequest,
    UpdateRuleRequest,
    RulesListResponse,
    DialogueTypeRulesResponse,
)
from api.dependencies import get_request_id, get_context_rule_service
from api.exceptions import NotFoundException, InternalServerException
from services.context_rule_service import ContextRuleService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get(
    "/rules",
    response_model=RulesListResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
)
async def list_context_rules(
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> RulesListResponse:
    """Liste toutes les règles de sélection de contexte.

    Args:
        request: La requête HTTP.
        rule_service: ContextRuleService injecté.
        request_id: ID de la requête.

    Returns:
        Liste des règles triées par priorité.
    """
    rules = rule_service.list_rules()
    return RulesListResponse(rules=rules, total=len(rules))


@router.post(
    "/rules",
    response_model=ContextRule,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_context_rule(
    request_data: CreateRuleRequest,
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> ContextRule:
    """Crée une nouvelle règle de sélection de contexte.

    Args:
        request_data: Corps de la requête (nom, conditions, types suggérés).
        request: La requête HTTP.
        rule_service: ContextRuleService injecté.
        request_id: ID de la requête.

    Returns:
        La règle créée avec son identifiant généré.
    """
    try:
        return rule_service.create_rule(request_data)
    except Exception as e:
        logger.exception(f"Erreur lors de la création d'une règle (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la création de la règle",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.put(
    "/rules/{rule_id}",
    response_model=ContextRule,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
)
async def update_context_rule(
    rule_id: str,
    request_data: UpdateRuleRequest,
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> ContextRule:
    """Met à jour une règle de sélection de contexte.

    Args:
        rule_id: Identifiant de la règle à modifier.
        request_data: Champs à modifier (tous optionnels).
        request: La requête HTTP.
        rule_service: ContextRuleService injecté.
        request_id: ID de la requête.

    Returns:
        La règle mise à jour.

    Raises:
        NotFoundException: Si la règle n'existe pas.
    """
    updated = rule_service.update_rule(rule_id, request_data)
    if updated is None:
        raise NotFoundException(
            resource_type="Règle de contexte",
            resource_id=rule_id,
            request_id=request_id,
        )
    return updated


@router.delete(
    "/rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_context_rule(
    rule_id: str,
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> None:
    """Supprime une règle de sélection de contexte.

    Args:
        rule_id: Identifiant de la règle à supprimer.
        request: La requête HTTP.
        rule_service: ContextRuleService injecté.
        request_id: ID de la requête.

    Raises:
        NotFoundException: Si la règle n'existe pas.
    """
    deleted = rule_service.delete_rule(rule_id)
    if not deleted:
        raise NotFoundException(
            resource_type="Règle de contexte",
            resource_id=rule_id,
            request_id=request_id,
        )


@router.get(
    "/rules/by-dialogue-type/{dialogue_type}",
    response_model=DialogueTypeRulesResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
)
async def get_context_rules_by_dialogue_type(
    dialogue_type: str,
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> DialogueTypeRulesResponse:
    """Retourne les règles spécifiques d'un type de dialogue avec fallback global."""
    source, rules = rule_service.get_rules_for_dialogue_type(dialogue_type)
    return DialogueTypeRulesResponse(
        dialogue_type=dialogue_type,
        source=source,
        rules=rules,
    )


@router.put(
    "/rules/by-dialogue-type/{dialogue_type}",
    response_model=DialogueTypeRulesResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
)
async def put_context_rules_by_dialogue_type(
    dialogue_type: str,
    request_data: list[CreateRuleRequest],
    request: Request,
    rule_service: Annotated[ContextRuleService, Depends(get_context_rule_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> DialogueTypeRulesResponse:
    """Remplace l'ensemble des règles d'un type de dialogue donné."""
    normalized_type = dialogue_type.strip().lower()

    # Supprimer les anciennes règles spécifiques au type.
    current_rules = rule_service.list_rules()
    for rule in [r for r in current_rules if r.dialogue_type == normalized_type]:
        rule_service.delete_rule(rule.id)

    # Créer le nouvel ensemble de règles spécifiques.
    for rule in request_data:
        rule_service.create_rule(
            CreateRuleRequest(
                name=rule.name,
                enabled=rule.enabled,
                priority=rule.priority,
                condition_operator=rule.condition_operator,
                conditions=rule.conditions,
                suggested_types=rule.suggested_types,
                dialogue_type=normalized_type,
            )
        )

    source, rules = rule_service.get_rules_for_dialogue_type(normalized_type)
    return DialogueTypeRulesResponse(
        dialogue_type=normalized_type,
        source=source,
        rules=rules,
    )

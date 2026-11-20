"""Routes API des conversations IA (``/api/v1/ai-conversations``).

Routeur mince : la logique (graine, accès au sujet, plafond, budget, appel LLM) vit dans
``services/ai_conversation_service.py``. Ici, uniquement le mapping HTTP des erreurs. Les
méthodes synchrones du service (fichiers d'usage, SQLite) tournent dans un thread pour ne
pas bloquer la boucle d'événements.
"""

from __future__ import annotations

import asyncio
from typing import Annotated, NoReturn, Optional

from fastapi import APIRouter, Depends, Query, Response, status

from api.dependencies import get_ai_conversation_service, get_request_id, require_non_guest
from api.exceptions import APIException, NotFoundException, ValidationException
from api.middleware.billable_user_context import get_billable_user_id
from api.routers.auth import get_current_user
from api.schemas.ai_conversations import (
    AIConversationCreateRequest,
    AIConversationExchangeResponse,
    AIConversationMessageCreateRequest,
    AIConversationMessageResponse,
    AIConversationResponse,
    AIConversationSummaryResponse,
)
from services.ai_conversation_service import (
    DIALOGUE_NODE_SUBJECT_KIND,
    AIConversationMessageView,
    AIConversationNotFoundError,
    AIConversationService,
    AIConversationSummary,
    AIConversationView,
    ConversationBudgetExceededError,
    ConversationFullError,
    ConversationLLMError,
    InvalidSubjectError,
    SubjectAccessDeniedError,
    UnknownSubjectKindError,
    dialogue_node_subject_key,
)
from services.document_id_validation import validate_document_id
from services.generation_trace import GenerationTraceUnavailableError

router = APIRouter(dependencies=[Depends(get_current_user)])


def _message_response(view: AIConversationMessageView) -> AIConversationMessageResponse:
    """Mappe un message service vers le schéma API."""
    return AIConversationMessageResponse(
        id=view.id,
        position=view.position,
        role=view.role,  # type: ignore[arg-type]
        content=view.content,
        reasoning_summary=view.reasoning_summary,
        llm_call_id=view.llm_call_id,
        model_name=view.model_name,
        cost_usd=view.cost_usd,
        created_at=view.created_at,
    )


def _conversation_response(view: AIConversationView) -> AIConversationResponse:
    """Mappe une conversation service vers le schéma API."""
    return AIConversationResponse.model_validate(
        {
            "id": view.id,
            "subject": view.subject,
            "title": view.title,
            "model_name": view.model_name,
            "generation": view.generation,
            "messages": [_message_response(m).model_dump() for m in view.messages],
            "created_at": view.created_at,
            "updated_at": view.updated_at,
        }
    )


def _summary_response(summary: AIConversationSummary) -> AIConversationSummaryResponse:
    """Mappe un résumé service vers le schéma API."""
    return AIConversationSummaryResponse.model_validate(
        {
            "id": summary.id,
            "subject": summary.subject,
            "title": summary.title,
            "model_name": summary.model_name,
            "message_count": summary.message_count,
            "created_at": summary.created_at,
            "updated_at": summary.updated_at,
        }
    )


def _raise_http(exc: Exception, request_id: Optional[str], conversation_id: str = "") -> NoReturn:
    """Traduit une erreur de domaine en réponse HTTP (matrice de la spec)."""
    if isinstance(exc, AIConversationNotFoundError):
        raise NotFoundException(
            resource_type="AIConversation",
            resource_id=conversation_id,
            request_id=request_id,
        ) from exc
    if isinstance(exc, SubjectAccessDeniedError):
        raise APIException(
            status_code=status.HTTP_403_FORBIDDEN,
            code=exc.code,
            message=str(exc),
            request_id=request_id,
        ) from exc
    if isinstance(exc, GenerationTraceUnavailableError):
        raise APIException(
            status_code=status.HTTP_404_NOT_FOUND,
            code="generation_trace_not_found",
            message=str(exc),
            request_id=request_id,
        ) from exc
    if isinstance(exc, InvalidSubjectError) and exc.code:
        raise APIException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code=exc.code,
            message=str(exc),
            request_id=request_id,
        ) from exc
    if isinstance(exc, (InvalidSubjectError, UnknownSubjectKindError)):
        raise ValidationException(message=str(exc), request_id=request_id) from exc
    if isinstance(exc, ConversationFullError):
        raise APIException(
            status_code=status.HTTP_409_CONFLICT,
            code="conversation_full",
            message=str(exc),
            request_id=request_id,
        ) from exc
    if isinstance(exc, ConversationBudgetExceededError):
        raise APIException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            code="QUOTA_EXCEEDED",
            message=str(exc),
            details={
                "percentage": exc.percentage,
                "estimated_cost": exc.estimated_cost,
            },
            request_id=request_id,
        ) from exc
    if isinstance(exc, ConversationLLMError):
        raise APIException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            code="llm_error",
            message=str(exc),
            request_id=request_id,
        ) from exc
    raise exc


_DOMAIN_ERRORS = (
    AIConversationNotFoundError,
    SubjectAccessDeniedError,
    GenerationTraceUnavailableError,
    InvalidSubjectError,
    UnknownSubjectKindError,
    ConversationFullError,
    ConversationBudgetExceededError,
    ConversationLLMError,
)


@router.post(
    "",
    response_model=AIConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_ai_conversation(
    body: AIConversationCreateRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    service: Annotated[AIConversationService, Depends(get_ai_conversation_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> AIConversationResponse:
    """Ouvre une conversation sur un sujet ; la génération est copiée (instantané)."""
    require_non_guest(current_user)
    try:
        view = await asyncio.to_thread(
            service.create,
            current_user,
            body.subject.model_dump(),
            model_name=body.llm_model_identifier,
        )
    except _DOMAIN_ERRORS as exc:
        _raise_http(exc, request_id)
    return _conversation_response(view)


@router.get("", response_model=list[AIConversationSummaryResponse])
async def list_ai_conversations(
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    service: Annotated[AIConversationService, Depends(get_ai_conversation_service)],
    request_id: Annotated[str, Depends(get_request_id)],
    subject_kind: Annotated[Optional[str], Query(max_length=64)] = None,
    dialogue_id: Annotated[Optional[str], Query(max_length=205)] = None,
    node_id: Annotated[Optional[str], Query(max_length=200)] = None,
) -> list[AIConversationSummaryResponse]:
    """Conversations de l'utilisateur, filtrables par sujet (dialogue, nœud)."""
    subject_key: Optional[str] = None
    subject_key_prefix: Optional[str] = None
    if node_id is not None and dialogue_id is None:
        raise ValidationException(
            message="Le filtre node_id exige dialogue_id.",
            request_id=request_id,
        )
    if dialogue_id is not None:
        try:
            normalized_dialogue_id = validate_document_id(dialogue_id)
        except ValueError as exc:
            raise ValidationException(message=str(exc), request_id=request_id) from exc
        subject_kind = subject_kind or DIALOGUE_NODE_SUBJECT_KIND
        if node_id is not None:
            subject_key = dialogue_node_subject_key(normalized_dialogue_id, node_id.strip())
        else:
            subject_key_prefix = dialogue_node_subject_key(normalized_dialogue_id)
    summaries = await asyncio.to_thread(
        service.list_for_user,
        current_user,
        subject_kind=subject_kind,
        subject_key=subject_key,
        subject_key_prefix=subject_key_prefix,
    )
    return [_summary_response(summary) for summary in summaries]


@router.get("/{conversation_id}", response_model=AIConversationResponse)
async def get_ai_conversation(
    conversation_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    service: Annotated[AIConversationService, Depends(get_ai_conversation_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> AIConversationResponse:
    """Conversation complète (instantané de génération + messages)."""
    try:
        view = await asyncio.to_thread(service.get, conversation_id, current_user)
    except _DOMAIN_ERRORS as exc:
        _raise_http(exc, request_id, conversation_id)
    return _conversation_response(view)


@router.post(
    "/{conversation_id}/messages",
    response_model=AIConversationExchangeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_ai_conversation_message(
    conversation_id: str,
    body: AIConversationMessageCreateRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    service: Annotated[AIConversationService, Depends(get_ai_conversation_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> AIConversationExchangeResponse:
    """Pose une question à l'IA ; la paire n'est persistée que si elle répond."""
    require_non_guest(current_user)
    try:
        exchange = await service.post_message(
            conversation_id,
            current_user,
            body.content,
            billable_user_id=get_billable_user_id(),
            request_id=request_id,
        )
    except _DOMAIN_ERRORS as exc:
        _raise_http(exc, request_id, conversation_id)
    return AIConversationExchangeResponse(
        user_message=_message_response(exchange.user_message),
        assistant_message=_message_response(exchange.assistant_message),
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_conversation(
    conversation_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    service: Annotated[AIConversationService, Depends(get_ai_conversation_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> Response:
    """Supprime une conversation de l'utilisateur."""
    require_non_guest(current_user)
    try:
        await asyncio.to_thread(service.delete, conversation_id, current_user)
    except _DOMAIN_ERRORS as exc:
        _raise_http(exc, request_id, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

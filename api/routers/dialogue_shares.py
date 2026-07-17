"""Routes de partage co-édition entre writers (Story 7.6 / FR69)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import (
    get_dialogue_sharing_service,
    require_non_guest,
)
from api.routers.auth import get_current_user
from api.schemas.dialogue_shares import (
    DialogueShareCreateRequest,
    DialogueShareResponse,
)
from services.dialogue_sharing_service import (
    DialogueShareConflictError,
    DialogueShareNotFoundError,
    DialogueShareSelfShareError,
    DialogueSharingService,
    DialogueShareView,
)
from services.document_id_validation import validate_document_id
from services.document_persistence_service import DialogueAccessDeniedError

router = APIRouter(dependencies=[Depends(get_current_user)])


def _to_response(share: DialogueShareView) -> DialogueShareResponse:
    """Mappe une vue service vers le schéma API."""
    return DialogueShareResponse(
        document_id=share.document_id,
        user_id=share.user_id,
        username=share.username,
        permission=share.permission,
        created_at=share.created_at,
    )


@router.get(
    "/{document_id}/shares",
    response_model=list[DialogueShareResponse],
)
async def list_dialogue_shares(
    document_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    sharing_service: Annotated[
        DialogueSharingService, Depends(get_dialogue_sharing_service)
    ],
) -> list[DialogueShareResponse]:
    """Liste les co-éditeurs d'un dialogue (owner/admin)."""
    require_non_guest(current_user)
    try:
        document_id = validate_document_id(document_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    try:
        shares = sharing_service.list_shares(document_id, current_user)
    except DialogueAccessDeniedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except DialogueShareNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return [_to_response(share) for share in shares]


@router.post(
    "/{document_id}/shares",
    response_model=DialogueShareResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_dialogue_share(
    document_id: str,
    body: DialogueShareCreateRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    sharing_service: Annotated[
        DialogueSharingService, Depends(get_dialogue_sharing_service)
    ],
) -> DialogueShareResponse:
    """Invite un writer actif à co-éditer le dialogue."""
    require_non_guest(current_user)
    try:
        document_id = validate_document_id(document_id)
        username = body.normalized_username()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    try:
        share = sharing_service.grant_share(
            document_id,
            username,
            current_user,
        )
    except DialogueAccessDeniedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except DialogueShareNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DialogueShareSelfShareError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except DialogueShareConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    return _to_response(share)


@router.delete(
    "/{document_id}/shares/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_dialogue_share(
    document_id: str,
    user_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    sharing_service: Annotated[
        DialogueSharingService, Depends(get_dialogue_sharing_service)
    ],
) -> None:
    """Révoque le partage d'un co-éditeur."""
    require_non_guest(current_user)
    try:
        document_id = validate_document_id(document_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    try:
        sharing_service.revoke_share(document_id, user_id, current_user)
    except DialogueAccessDeniedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except DialogueShareNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

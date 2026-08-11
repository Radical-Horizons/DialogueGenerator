"""Routes API des collections de dialogues (Story 8.5 / FR84)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import get_collection_service, require_non_guest
from api.routers.auth import get_current_user
from api.schemas.collections import (
    CollectionCreateRequest,
    CollectionDeleteResponse,
    CollectionDialoguesRequest,
    CollectionResponse,
    CollectionUpdateRequest,
)
from services.collection_service import (
    CollectionDeleteResult,
    CollectionDocumentNotFoundError,
    CollectionNotFoundError,
    CollectionService,
    CollectionView,
)
from services.document_id_validation import validate_document_id

router = APIRouter(dependencies=[Depends(get_current_user)])


def _to_response(view: CollectionView) -> CollectionResponse:
    """Mappe une vue service vers le schéma API."""
    return CollectionResponse(
        id=view.id,
        name=view.name,
        description=view.description,
        icon=view.icon,
        owner_id=view.owner_id,
        created_at=view.created_at,
        updated_at=view.updated_at,
        dialogue_ids=list(view.dialogue_ids),
    )


def _validate_document_ids(document_ids: list[str]) -> list[str]:
    """Valide chaque document_id ; lève HTTP 422 si invalide."""
    validated: list[str] = []
    for document_id in document_ids:
        try:
            validated.append(validate_document_id(document_id))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
    return validated


@router.get("", response_model=list[CollectionResponse])
async def list_collections(
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    collection_service: Annotated[
        CollectionService, Depends(get_collection_service)
    ],
) -> list[CollectionResponse]:
    """Liste les collections du propriétaire courant."""
    return [_to_response(view) for view in collection_service.list_for_user(current_user)]


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    body: CollectionCreateRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    collection_service: Annotated[
        CollectionService, Depends(get_collection_service)
    ],
) -> CollectionResponse:
    """Crée une collection vide."""
    require_non_guest(current_user)
    view = collection_service.create(
        current_user,
        name=body.name,
        description=body.description,
        icon=body.icon,
    )
    return _to_response(view)


@router.get("/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    collection_service: Annotated[
        CollectionService, Depends(get_collection_service)
    ],
) -> CollectionResponse:
    """Retourne une collection possédée."""
    try:
        return _to_response(collection_service.get(collection_id, current_user))
    except CollectionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.put("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: str,
    body: CollectionUpdateRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    collection_service: Annotated[
        CollectionService, Depends(get_collection_service)
    ],
) -> CollectionResponse:
    """Met à jour une collection possédée."""
    require_non_guest(current_user)
    try:
        view = collection_service.update(
            collection_id,
            current_user,
            name=body.name,
            description=body.description,
            icon=body.icon,
            clear_description=body.description is None and "description" in body.model_fields_set,
            clear_icon=body.icon is None and "icon" in body.model_fields_set,
        )
    except CollectionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return _to_response(view)


@router.delete("/{collection_id}", response_model=CollectionDeleteResponse)
async def delete_collection(
    collection_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    collection_service: Annotated[
        CollectionService, Depends(get_collection_service)
    ],
) -> CollectionDeleteResponse:
    """Supprime une collection sans toucher aux dialogues."""
    require_non_guest(current_user)
    try:
        result: CollectionDeleteResult = collection_service.delete(
            collection_id, current_user
        )
    except CollectionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return CollectionDeleteResponse(
        id=result.id,
        removed_dialogue_count=result.removed_dialogue_count,
    )


@router.post("/{collection_id}/dialogues", response_model=CollectionResponse)
async def add_dialogues_to_collection(
    collection_id: str,
    body: CollectionDialoguesRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    collection_service: Annotated[
        CollectionService, Depends(get_collection_service)
    ],
) -> CollectionResponse:
    """Ajoute des dialogues à une collection (idempotent)."""
    require_non_guest(current_user)
    document_ids = _validate_document_ids(body.document_ids)
    try:
        view = collection_service.add_dialogues(
            collection_id, current_user, document_ids
        )
    except CollectionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except CollectionDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return _to_response(view)


@router.delete("/{collection_id}/dialogues", response_model=CollectionResponse)
async def remove_dialogues_from_collection(
    collection_id: str,
    body: CollectionDialoguesRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    collection_service: Annotated[
        CollectionService, Depends(get_collection_service)
    ],
) -> CollectionResponse:
    """Retire des dialogues d'une collection."""
    require_non_guest(current_user)
    document_ids = _validate_document_ids(body.document_ids)
    try:
        view = collection_service.remove_dialogues(
            collection_id, current_user, document_ids
        )
    except CollectionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return _to_response(view)

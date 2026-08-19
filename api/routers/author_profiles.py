"""Router FastAPI des profils d'auteur (`/api/v1/author-profiles`)."""

import logging
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import get_author_profile_service, get_item_access_service
from api.routers.auth import get_current_user
from api.schemas.author_profile import (
    AuthorProfile,
    AuthorProfileCreate,
    AuthorProfileUpdate,
    PrebuiltAuthorProfile,
)
from api.utils.job_ownership import template_owner_key
from services.author_profile_service import AuthorProfileService
from services.owned_item_access import (
    ItemAccessForbiddenError,
    ItemAccessNotFoundError,
    OwnedItemAccessService,
)

router = APIRouter(dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)


def _is_guest(current_user: dict[str, object]) -> bool:
    """Session invitée (pas de compte, donc pas d'équipe)."""
    return (
        current_user.get("role") == "guest"
        or current_user.get("username") == "guest"
        or current_user.get("id") == "guest"
    )


@router.get("/prebuilt", response_model=List[PrebuiltAuthorProfile])
def list_prebuilt_author_profiles(
    service: AuthorProfileService = Depends(get_author_profile_service),
) -> List[PrebuiltAuthorProfile]:
    """Voix fournies avec le projet, en lecture seule."""
    return service.list_prebuilt()


@router.get("", response_model=List[AuthorProfile])
def list_author_profiles(
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    service: AuthorProfileService = Depends(get_author_profile_service),
    access: OwnedItemAccessService = Depends(get_item_access_service),
) -> List[AuthorProfile]:
    """Profils visibles de l'acteur : les siens, plus ceux partagés par l'équipe."""
    return access.list_visible(service.list_profiles(), current_user)


@router.post("", response_model=AuthorProfile, status_code=status.HTTP_201_CREATED)
def create_author_profile(
    body: AuthorProfileCreate,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    service: AuthorProfileService = Depends(get_author_profile_service),
    access: OwnedItemAccessService = Depends(get_item_access_service),
) -> AuthorProfile:
    """Crée un profil, partagé par défaut (privé pour une session invitée)."""
    payload = body.model_dump()
    payload["owner_id"] = template_owner_key(current_user) or None
    # Un invité n'a pas d'équipe : ses profils naissent privés, sauf demande explicite.
    if _is_guest(current_user) and "visibility" not in body.model_fields_set:
        payload["visibility"] = "private"
    try:
        created = service.create_profile(payload)
    except OSError as exc:
        logger.exception("Erreur disque à la création d'un profil d'auteur")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Disk error",
        ) from exc
    return access.annotate(created, current_user)


@router.get("/{profile_id}", response_model=AuthorProfile)
def get_author_profile(
    profile_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    service: AuthorProfileService = Depends(get_author_profile_service),
    access: OwnedItemAccessService = Depends(get_item_access_service),
) -> AuthorProfile:
    """Charge un profil visible.

    Raises:
        404: Profil absent ou hors visibilité.
    """
    try:
        return access.require_readable(service.get_profile(profile_id), current_user)
    except (FileNotFoundError, ItemAccessNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Author profile not found"
        ) from exc


@router.put("/{profile_id}", response_model=AuthorProfile)
def update_author_profile(
    profile_id: str,
    body: AuthorProfileUpdate,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    service: AuthorProfileService = Depends(get_author_profile_service),
    access: OwnedItemAccessService = Depends(get_item_access_service),
) -> AuthorProfile:
    """Met à jour un profil dont on est propriétaire.

    Raises:
        403: Profil d'autrui.
        404: Profil absent ou hors visibilité.
    """
    try:
        existing = service.get_profile(profile_id)
        access.require_writable(existing, current_user)
        if body.visibility is not None and not access.can_change_visibility(
            existing, current_user
        ):
            raise ItemAccessForbiddenError("Changement de visibilité refusé")
        updated = service.update_profile(profile_id, body.model_dump(exclude_none=True))
        return access.annotate(updated, current_user)
    except ItemAccessForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except (FileNotFoundError, ItemAccessNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Author profile not found"
        ) from exc


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_author_profile(
    profile_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    service: AuthorProfileService = Depends(get_author_profile_service),
    access: OwnedItemAccessService = Depends(get_item_access_service),
) -> None:
    """Supprime un profil dont on est propriétaire.

    Raises:
        403: Profil d'autrui.
        404: Profil absent ou hors visibilité.
    """
    try:
        access.require_deletable(service.get_profile(profile_id), current_user)
        service.delete_profile(profile_id)
    except ItemAccessForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except (FileNotFoundError, ItemAccessNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Author profile not found"
        ) from exc

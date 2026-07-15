"""Routes d'administration des comptes utilisateurs."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import get_auth_service, require_admin
from api.routers.auth import get_current_user_or_none
from api.schemas.users import UserCreate, UserResponse, UserUpdate
from api.services.auth_service import AuthService
from services.repositories.sqlite.user_repository import (
    DuplicateUsernameError,
    LastActiveAdminError,
)

router = APIRouter()


async def _require_admin_user(
    current_user: Annotated[
        Optional[dict[str, object]],
        Depends(get_current_user_or_none),
    ],
) -> dict[str, object]:
    """Résout et vérifie l'administrateur de la requête."""
    return require_admin(current_user)


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    user_data: UserCreate,
    admin_user: Annotated[dict[str, object], Depends(_require_admin_user)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserResponse:
    """Crée un compte writer réservé à un administrateur."""
    try:
        user = auth_service.create_user(
            username=user_data.username,
            email=str(user_data.email),
            password=user_data.password,
            actor=admin_user,
        )
    except DuplicateUsernameError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username déjà utilisé",
        ) from exc
    return UserResponse.model_validate(user)


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    _admin_user: Annotated[dict[str, object], Depends(_require_admin_user)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> list[UserResponse]:
    """Liste tous les comptes sans exposer les mots de passe hashés."""
    return [
        UserResponse.model_validate(user)
        for user in auth_service.list_users()
    ]


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    patch: UserUpdate,
    admin_user: Annotated[dict[str, object], Depends(_require_admin_user)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserResponse:
    """Modifie le rôle ou l'état d'un compte administré."""
    try:
        user = auth_service.update_user(
            user_id,
            role=patch.role,
            is_active=patch.is_active,
            actor=admin_user,
        )
    except LastActiveAdminError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable",
        )
    return UserResponse.model_validate(user)

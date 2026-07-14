"""Routes d'administration des comptes utilisateurs."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import get_auth_service, require_admin
from api.routers.auth import get_current_user_or_none
from api.schemas.users import UserCreate, UserResponse
from api.services.auth_service import AuthService
from services.repositories.sqlite.user_repository import DuplicateUsernameError

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
    _admin_user: Annotated[dict[str, object], Depends(_require_admin_user)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserResponse:
    """Crée un compte writer réservé à un administrateur."""
    try:
        user = auth_service.create_user(
            username=user_data.username,
            email=str(user_data.email),
            password=user_data.password,
        )
    except DuplicateUsernameError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username déjà utilisé",
        ) from exc
    return UserResponse.model_validate(user)

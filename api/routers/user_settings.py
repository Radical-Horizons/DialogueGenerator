"""Routes des préférences synchronisées de l'utilisateur courant."""

import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status

from api.config.security_config import get_security_config
from api.dependencies import (
    get_user_repository,
    get_user_settings_repository,
    require_non_guest,
)
from api.routers.auth import get_current_user
from api.schemas.user_settings import AllUserSettingsMap, UserSettingsMap
from services.repositories.sqlite.user_repository import UserRepository
from services.repositories.sqlite.user_settings_repository import (
    UnsupportedUserSettingKeyError,
    UserSettingsRepository,
)

router = APIRouter()
SettingsNamespace = Literal["context", "generation"]


async def _resolve_persisted_user(
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    user_repository: Annotated[UserRepository, Depends(get_user_repository)],
) -> dict[str, object]:
    """Refuse les guests et résout le vrai compte admin du bypass local."""
    principal = require_non_guest(current_user)
    security_config = get_security_config()
    if security_config.is_development and security_config.disable_auth:
        persisted_admin = user_repository.find_by_username("admin")
        if persisted_admin is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Le compte SQLite admin requis par DISABLE_AUTH est introuvable.",
            )
        return dict(persisted_admin)
    return principal


def _user_id(user: dict[str, object]) -> str:
    """Extrait un identifiant utilisateur persistant ou refuse la requête."""
    user_id = user.get("id")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Compte utilisateur invalide.",
        )
    return user_id


@router.get("/users/me/settings", response_model=AllUserSettingsMap)
async def get_all_user_settings(
    current_user: Annotated[dict[str, object], Depends(_resolve_persisted_user)],
    repository: Annotated[
        UserSettingsRepository,
        Depends(get_user_settings_repository),
    ],
) -> AllUserSettingsMap:
    """Retourne toutes les préférences du compte courant."""
    return AllUserSettingsMap(repository.get_all(_user_id(current_user)))


@router.get(
    "/users/me/settings/{namespace}",
    response_model=UserSettingsMap,
)
async def get_user_settings_namespace(
    namespace: SettingsNamespace,
    current_user: Annotated[dict[str, object], Depends(_resolve_persisted_user)],
    repository: Annotated[
        UserSettingsRepository,
        Depends(get_user_settings_repository),
    ],
) -> UserSettingsMap:
    """Retourne un namespace de préférences du compte courant."""
    return UserSettingsMap(repository.get_namespace(_user_id(current_user), namespace))


@router.put(
    "/users/me/settings/{namespace}",
    response_model=UserSettingsMap,
)
async def upsert_user_settings_namespace(
    namespace: SettingsNamespace,
    settings: UserSettingsMap,
    current_user: Annotated[dict[str, object], Depends(_resolve_persisted_user)],
    repository: Annotated[
        UserSettingsRepository,
        Depends(get_user_settings_repository),
    ],
) -> UserSettingsMap:
    """Fusionne les clés fournies dans un namespace sans supprimer les autres."""
    try:
        persisted = repository.upsert_namespace(
            _user_id(current_user),
            namespace,
            settings.root,
        )
    except UnsupportedUserSettingKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Compte utilisateur invalide.",
        ) from exc
    return UserSettingsMap(persisted)

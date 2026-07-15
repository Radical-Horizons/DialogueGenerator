"""Routes administratives des réglages applicatifs non secrets."""

import logging
from typing import Annotated, NoReturn, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status

from api.dependencies import (
    get_app_settings_repository,
    get_user_repository,
    require_admin,
)
from api.routers.auth import get_current_user_or_none
from api.schemas.users import AppSettingResponse, AppSettingUpdate
from services.repositories.sqlite.app_settings_repository import (
    AppSettingsRepository,
    UnsupportedAppSettingError,
)
from services.repositories.sqlite.user_repository import UserRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin")


async def _require_admin_user(
    current_user: Annotated[
        Optional[dict[str, object]],
        Depends(get_current_user_or_none),
    ],
) -> dict[str, object]:
    """Résout et vérifie l'administrateur de la requête."""
    return require_admin(current_user)


def _raise_unsupported_key(exc: UnsupportedAppSettingError) -> NoReturn:
    """Convertit une clé hors liste blanche en erreur HTTP 422."""
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=str(exc),
    ) from exc


@router.get("/app-settings", response_model=list[AppSettingResponse])
async def list_app_settings(
    _admin: Annotated[dict[str, object], Depends(_require_admin_user)],
    repository: Annotated[
        AppSettingsRepository,
        Depends(get_app_settings_repository),
    ],
) -> list[AppSettingResponse]:
    """Liste les réglages applicatifs autorisés et persistés."""
    return [
        AppSettingResponse.model_validate(setting)
        for setting in repository.list_all()
    ]


@router.get("/app-settings/{key}", response_model=AppSettingResponse)
async def get_app_setting(
    key: str,
    _admin: Annotated[dict[str, object], Depends(_require_admin_user)],
    repository: Annotated[
        AppSettingsRepository,
        Depends(get_app_settings_repository),
    ],
) -> AppSettingResponse:
    """Retourne un réglage autorisé."""
    try:
        setting = repository.get(key)
    except UnsupportedAppSettingError as exc:
        _raise_unsupported_key(exc)
    if setting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Réglage applicatif introuvable",
        )
    return AppSettingResponse.model_validate(setting)


@router.put("/app-settings/{key}", response_model=AppSettingResponse)
async def set_app_setting(
    key: str,
    payload: AppSettingUpdate,
    admin: Annotated[dict[str, object], Depends(_require_admin_user)],
    repository: Annotated[
        AppSettingsRepository,
        Depends(get_app_settings_repository),
    ],
    user_repository: Annotated[UserRepository, Depends(get_user_repository)],
) -> AppSettingResponse:
    """Crée ou remplace un réglage booléen autorisé."""
    actor_id_value = admin.get("id")
    actor_id = (
        str(actor_id_value)
        if actor_id_value is not None
        and user_repository.find_by_id(str(actor_id_value)) is not None
        else None
    )
    try:
        setting = repository.set(key, payload.value, actor_id)
    except UnsupportedAppSettingError as exc:
        _raise_unsupported_key(exc)
    logger.info(
        "Mutation administrative app setting",
        extra={
            "actor_id": actor_id,
            "actor_username": admin.get("username"),
            "target_setting_key": key,
            "action": "app_setting.updated",
        },
    )
    return AppSettingResponse.model_validate(setting)


@router.delete("/app-settings/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_app_setting(
    key: str,
    admin: Annotated[dict[str, object], Depends(_require_admin_user)],
    repository: Annotated[
        AppSettingsRepository,
        Depends(get_app_settings_repository),
    ],
) -> Response:
    """Supprime un réglage autorisé."""
    try:
        deleted = repository.delete(key)
    except UnsupportedAppSettingError as exc:
        _raise_unsupported_key(exc)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Réglage applicatif introuvable",
        )
    logger.info(
        "Suppression administrative app setting",
        extra={
            "actor_id": admin.get("id"),
            "actor_username": admin.get("username"),
            "target_setting_key": key,
            "action": "app_setting.deleted",
        },
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)

"""Router pour la configuration."""
import logging
import os
from typing import Annotated, Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status, Query

from api.routers.auth import get_current_user, get_current_user_or_none
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from api.dependencies import (
    get_config_service,
    get_context_builder,
    get_request_id,
    get_llm_pricing_service,
    require_admin,
)
from api.exceptions import InternalServerException, ValidationException, NotFoundException
from api.schemas.config import (
    FieldInfo,
    ContextFieldsResponse,
    ContextFieldSuggestionsRequest,
    ContextFieldSuggestionsResponse,
    ContextPreviewRequest,
    ContextPreviewResponse,
    DefaultFieldConfigResponse,
    SceneInstructionTemplate,
    SceneInstructionTemplatesResponse,
    AuthorProfileTemplate,
    AuthorProfileTemplatesResponse,
    TemplateFilePathsResponse,
)
from services.configuration_service import ConfigurationService, CONFIG_DIR
from services.context_field_detector import ContextFieldDetector, FieldInfo as DetectorFieldInfo
from services.field_suggestion_service import FieldSuggestionService
from services.context_organizer import ContextOrganizer
from api.utils.context_field_cache import get_context_field_cache
from core.context.context_builder import ContextBuilder
from services.llm_pricing_service import LLMPricingService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


async def _require_admin_user(
    current_user: Annotated[
        Optional[dict[str, object]],
        Depends(get_current_user_or_none),
    ],
) -> dict[str, object]:
    """Résout et vérifie l'administrateur de la requête."""
    return require_admin(current_user)


class LLMConfigResponse(BaseModel):
    """Réponse contenant la configuration LLM.
    
    Attributes:
        config: Configuration LLM complète.
    """
    config: dict


class LLMModelResponse(BaseModel):
    """Réponse contenant un modèle LLM.
    
    Attributes:
        model_identifier: Identifiant du modèle.
        display_name: Nom d'affichage.
        client_type: Type de client (openai, dummy, etc.).
        max_tokens: Nombre maximum de tokens.
    """
    model_identifier: str
    display_name: str
    client_type: str
    max_tokens: int


class LLMModelsListResponse(BaseModel):
    """Réponse contenant la liste des modèles LLM disponibles.
    
    Attributes:
        models: Liste des modèles.
        total: Nombre total de modèles.
    """
    models: list[LLMModelResponse]
    total: int


class LLMModelUpsertRequest(BaseModel):
    """Création / mise à jour d'un modèle LLM (admin)."""

    api_identifier: str = Field(..., min_length=1, description="Slug API (ex. aion-labs/aion-2.0)")
    display_name: str = Field(..., min_length=1)
    client_type: str = Field(default="openrouter")
    max_tokens: int = Field(default=32000, ge=256, le=1000000)
    default_temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    input_price_per_1M: Optional[float] = Field(default=None, ge=0.0)
    output_price_per_1M: Optional[float] = Field(default=None, ge=0.0)
    pricing_description: Optional[str] = None


class LLMModelPatchRequest(BaseModel):
    """Patch partiel d'un modèle LLM (admin)."""

    display_name: Optional[str] = Field(default=None, min_length=1)
    max_tokens: Optional[int] = Field(default=None, ge=256, le=1000000)
    default_temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    input_price_per_1M: Optional[float] = Field(default=None, ge=0.0)
    output_price_per_1M: Optional[float] = Field(default=None, ge=0.0)
    pricing_description: Optional[str] = None


class ContextConfigResponse(BaseModel):
    """Réponse contenant la configuration de contexte.
    
    Attributes:
        config: Configuration de contexte complète.
    """
    config: dict


class UnityDialoguesPathRequest(BaseModel):
    """Requête pour configurer le chemin des dialogues Unity.
    
    Attributes:
        path: Chemin vers le dossier Unity des dialogues.
    """
    path: str = Field(..., description="Chemin vers le dossier Unity des dialogues")


class UnityDialoguesPathResponse(BaseModel):
    """Réponse contenant le chemin configuré des dialogues Unity.
    
    Attributes:
        path: Chemin vers le dossier Unity des dialogues.
    """
    path: str = Field(..., description="Chemin vers le dossier Unity des dialogues")


@router.get(
    "/llm",
    response_model=LLMConfigResponse,
    status_code=status.HTTP_200_OK
)
async def get_llm_config(
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> LLMConfigResponse:
    """Récupère la configuration LLM.
    
    Args:
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Configuration LLM.
    """
    try:
        llm_config = config_service.get_llm_config()
        return LLMConfigResponse(config=llm_config)
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération de la config LLM (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération de la configuration LLM",
            details={"error": str(e)},
            request_id=request_id
        )


@router.put(
    "/llm",
    response_model=LLMConfigResponse,
    status_code=status.HTTP_200_OK
)
async def update_llm_config(
    config_data: dict,
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> LLMConfigResponse:
    """Met à jour la configuration LLM.
    
    Args:
        config_data: Nouvelles données de configuration.
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Configuration LLM mise à jour.
    """
    try:
        current_config = config_service.get_llm_config()
        current_config.update(config_data)
        if not config_service.save_llm_config(current_config):
            raise InternalServerException(
                message="Échec de la sauvegarde de la configuration LLM",
                details={"error": "save_llm_config returned False"},
                request_id=request_id
            )
        llm_config = config_service.get_llm_config()
        return LLMConfigResponse(config=llm_config)
    except InternalServerException:
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de la mise à jour de la config LLM (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la mise à jour de la configuration LLM",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/llm/models",
    response_model=LLMModelsListResponse,
    status_code=status.HTTP_200_OK
)
async def list_llm_models(
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> LLMModelsListResponse:
    """Liste tous les modèles LLM disponibles.
    
    Args:
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Liste des modèles LLM.
    """
    try:
        available_models = config_service.get_available_llm_models()
        
        model_responses = []
        for model in available_models:
            # S'assurer qu'on utilise api_identifier en priorité, puis model_identifier, mais jamais "unknown"
            api_id = model.get("api_identifier")
            model_id = model.get("model_identifier")
            # Si ni api_identifier ni model_identifier, utiliser le display_name comme fallback
            identifier = api_id or model_id
            if not identifier:
                logger.warning(f"Modèle sans identifiant trouvé: {model.get('display_name', 'Unknown')}. Utilisation du display_name comme identifiant.")
                identifier = model.get("display_name", "unknown").lower().replace(" ", "-").replace("(", "").replace(")", "")
            
            params = model.get("parameters") if isinstance(model.get("parameters"), dict) else {}
            max_tokens = model.get("max_tokens")
            if max_tokens is None:
                max_tokens = params.get("max_tokens")
            
            model_responses.append(
                LLMModelResponse(
                    model_identifier=identifier,
                    display_name=model.get("display_name", identifier),
                    client_type=model.get("client_type", "openai"),  # Par défaut openai pour les modèles de la config
                    max_tokens=_safe_max_tokens(max_tokens),
                )
            )
        
        return LLMModelsListResponse(
            models=model_responses,
            total=len(model_responses)
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération des modèles LLM (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération des modèles LLM",
            details={"error": str(e)},
            request_id=request_id
        )


def _safe_max_tokens(raw: Any, default: int = 4096) -> int:
    """Convertit une valeur max_tokens en int, avec repli sûr."""
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _model_to_response(model: Dict[str, Any]) -> LLMModelResponse:
    """Convertit une entrée llm_config en LLMModelResponse."""
    identifier = model.get("api_identifier") or model.get("model_identifier") or "unknown"
    params = model.get("parameters") if isinstance(model.get("parameters"), dict) else {}
    max_tokens = model.get("max_tokens")
    if max_tokens is None:
        max_tokens = params.get("max_tokens")
    return LLMModelResponse(
        model_identifier=str(identifier),
        display_name=str(model.get("display_name", identifier)),
        client_type=str(model.get("client_type", "openai")),
        max_tokens=_safe_max_tokens(max_tokens),
    )


@router.post(
    "/llm/models",
    response_model=LLMModelResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_llm_model(
    body: LLMModelUpsertRequest,
    _admin: Annotated[dict[str, object], Depends(_require_admin_user)],
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    pricing_service: Annotated[LLMPricingService, Depends(get_llm_pricing_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> LLMModelResponse:
    """Ajoute (ou remplace) un modèle LLM dans le catalogue (admin)."""
    if body.client_type != "openrouter":
        raise ValidationException(
            message="L'admin ne peut créer que des modèles client_type=openrouter.",
            details={"client_type": body.client_type},
            request_id=request_id,
        )
    entry = {
        "api_identifier": body.api_identifier.strip(),
        "display_name": body.display_name.strip(),
        "client_type": body.client_type,
        "parameters": {
            "default_temperature": body.default_temperature,
            "max_tokens": body.max_tokens,
        },
    }
    try:
        # Refuser d'écraser un modèle openai/mistral existant
        existing_models = config_service.get_available_llm_models()
        conflict = next(
            (
                m
                for m in existing_models
                if (m.get("api_identifier") or m.get("model_identifier"))
                == body.api_identifier.strip()
                and m.get("client_type") != "openrouter"
            ),
            None,
        )
        if conflict is not None:
            raise ValidationException(
                message="Impossible d'écraser un modèle OpenAI/Mistral existant.",
                details={"api_identifier": body.api_identifier},
                request_id=request_id,
            )
        if (body.input_price_per_1M is None) != (body.output_price_per_1M is None):
            raise ValidationException(
                message="input_price_per_1M et output_price_per_1M doivent être fournis ensemble.",
                details={
                    "input_price_per_1M": body.input_price_per_1M,
                    "output_price_per_1M": body.output_price_per_1M,
                },
                request_id=request_id,
            )
        saved = config_service.upsert_llm_model(entry)
        if body.input_price_per_1M is not None and body.output_price_per_1M is not None:
            try:
                pricing_service.upsert_model_pricing(
                    model_name=body.api_identifier.strip(),
                    input_price_per_1M=body.input_price_per_1M,
                    output_price_per_1M=body.output_price_per_1M,
                    description=body.pricing_description or body.display_name,
                )
            except OSError as pricing_exc:
                config_service.remove_llm_model(body.api_identifier.strip())
                raise InternalServerException(
                    message="Échec de la sauvegarde du tarif LLM (modèle annulé).",
                    details={"error": str(pricing_exc)},
                    request_id=request_id,
                ) from pricing_exc
        return _model_to_response(saved)
    except ValidationException:
        raise
    except ValueError as exc:
        raise ValidationException(
            message=str(exc),
            details={"error": str(exc)},
            request_id=request_id,
        ) from exc
    except OSError as exc:
        raise InternalServerException(
            message="Échec de la sauvegarde du modèle LLM",
            details={"error": str(exc)},
            request_id=request_id,
        ) from exc


@router.patch(
    "/llm/models/{api_identifier:path}",
    response_model=LLMModelResponse,
    status_code=status.HTTP_200_OK,
)
async def patch_llm_model(
    api_identifier: str,
    body: LLMModelPatchRequest,
    _admin: Annotated[dict[str, object], Depends(_require_admin_user)],
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    pricing_service: Annotated[LLMPricingService, Depends(get_llm_pricing_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> LLMModelResponse:
    """Met à jour partiellement un modèle LLM (admin)."""
    models = config_service.get_available_llm_models()
    existing = next(
        (
            m
            for m in models
            if (m.get("api_identifier") or m.get("model_identifier")) == api_identifier
        ),
        None,
    )
    if existing is None:
        raise NotFoundException(
            resource_type="Modèle LLM",
            resource_id=api_identifier,
            request_id=request_id,
        )
    params = dict(existing.get("parameters") or {}) if isinstance(existing.get("parameters"), dict) else {}
    if body.display_name is not None:
        stripped_name = body.display_name.strip()
        if not stripped_name:
            raise ValidationException(
                message="display_name ne peut pas être vide.",
                details={"display_name": body.display_name},
                request_id=request_id,
            )
        existing["display_name"] = stripped_name
    if body.max_tokens is not None:
        params["max_tokens"] = body.max_tokens
    if body.default_temperature is not None:
        params["default_temperature"] = body.default_temperature
    # Ne pas écraser client_type openai/mistral via patch admin
    existing["parameters"] = params
    existing["api_identifier"] = api_identifier
    if (body.input_price_per_1M is None) != (body.output_price_per_1M is None):
        raise ValidationException(
            message="input_price_per_1M et output_price_per_1M doivent être fournis ensemble.",
            details={
                "input_price_per_1M": body.input_price_per_1M,
                "output_price_per_1M": body.output_price_per_1M,
            },
            request_id=request_id,
        )
    try:
        saved = config_service.upsert_llm_model(existing)
        if (
            existing.get("client_type") == "openrouter"
            and body.input_price_per_1M is not None
            and body.output_price_per_1M is not None
        ):
            pricing_service.upsert_model_pricing(
                model_name=api_identifier,
                input_price_per_1M=body.input_price_per_1M,
                output_price_per_1M=body.output_price_per_1M,
                description=body.pricing_description or saved.get("display_name"),
            )
        return _model_to_response(saved)
    except OSError as exc:
        raise InternalServerException(
            message="Échec de la mise à jour du modèle LLM",
            details={"error": str(exc)},
            request_id=request_id,
        ) from exc


@router.delete(
    "/llm/models/{api_identifier:path}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_llm_model(
    api_identifier: str,
    _admin: Annotated[dict[str, object], Depends(_require_admin_user)],
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    pricing_service: Annotated[LLMPricingService, Depends(get_llm_pricing_service)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> None:
    """Supprime un modèle LLM du catalogue (admin)."""
    models = config_service.get_available_llm_models()
    existing = next(
        (
            m
            for m in models
            if (m.get("api_identifier") or m.get("model_identifier")) == api_identifier
        ),
        None,
    )
    if existing is None:
        raise NotFoundException(
            resource_type="Modèle LLM",
            resource_id=api_identifier,
            request_id=request_id,
        )
    if existing.get("client_type") != "openrouter":
        raise ValidationException(
            message="Seuls les modèles OpenRouter peuvent être supprimés via l'admin.",
            details={"api_identifier": api_identifier, "client_type": existing.get("client_type")},
            request_id=request_id,
        )
    try:
        removed = config_service.remove_llm_model(api_identifier)
    except OSError as exc:
        raise InternalServerException(
            message="Échec de la suppression du modèle LLM",
            details={"error": str(exc)},
            request_id=request_id,
        ) from exc
    if not removed:
        raise NotFoundException(
            resource_type="Modèle LLM",
            resource_id=api_identifier,
            request_id=request_id,
        )
    pricing_service.remove_model_pricing(api_identifier)


@router.get(
    "/context",
    response_model=ContextConfigResponse,
    status_code=status.HTTP_200_OK
)
async def get_context_config(
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> ContextConfigResponse:
    """Récupère la configuration de contexte.
    
    Args:
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Configuration de contexte.
    """
    try:
        context_config = config_service.get_context_config()
        return ContextConfigResponse(config=context_config)
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération de la config contexte (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération de la configuration de contexte",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/context-fields/invalidate-cache",
    status_code=status.HTTP_200_OK
)
async def invalidate_context_fields_cache(
    request: Request,
    request_id: Annotated[str, Depends(get_request_id)],
    element_type: Optional[str] = None
) -> Dict[str, str]:
    """Invalide le cache des champs de contexte.
    
    Args:
        request: La requête HTTP.
        request_id: ID de la requête.
        element_type: Type d'élément spécifique (optionnel). Si None, invalide tout le cache.
        
    Returns:
        Message de confirmation.
    """
    try:
        cache = get_context_field_cache()
        cache.invalidate(element_type)
        
        message = f"Cache invalidé pour '{element_type}'" if element_type else "Cache complètement invalidé"
        return {"message": message}
    except Exception as e:
        logger.exception(f"Erreur lors de l'invalidation du cache (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de l'invalidation du cache",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/context-fields/default",
    response_model=DefaultFieldConfigResponse,
    status_code=status.HTTP_200_OK
)
async def get_default_field_config(
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> DefaultFieldConfigResponse:
    """Récupère la configuration par défaut des champs depuis context_config.json.
    
    Retourne un dictionnaire avec :
    - "essential_fields": champs essentiels (courts, toujours sélectionnés) par type d'élément
    - "default_fields": tous les champs par défaut (priorités 1, 2, 3) par type d'élément
    
    Args:
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Dictionnaire avec essential_fields et default_fields.
    """
    try:
        context_config = config_service.get_context_config()
        
        # Validation défensive : vérifier que context_config est un dictionnaire
        if not isinstance(context_config, dict):
            logger.error(f"context_config n'est pas un dictionnaire: {type(context_config)}")
            context_config = {}
        
        # Extraire les champs par défaut et identifier les essentiels
        default_fields: Dict[str, List[str]] = {}
        essential_fields: Dict[str, List[str]] = {}
        
        # Seuil pour considérer un champ comme "essentiel" (courts)
        # Champs avec truncate: -1 ou truncate <= 200 sont essentiels
        ESSENTIAL_TRUNCATE_THRESHOLD = 200
        
        for element_type, priorities in context_config.items():
            # Validation défensive : vérifier que priorities est un dictionnaire
            if not isinstance(priorities, dict):
                logger.warning(f"Priorités pour '{element_type}' ne sont pas un dictionnaire: {type(priorities)}. Ignoré.")
                continue
                
            default_fields[element_type] = []
            essential_fields[element_type] = []
            
            # Parcourir toutes les priorités (1, 2, 3)
            for priority_level, fields in priorities.items():
                # Validation défensive : vérifier que fields est une liste
                if not isinstance(fields, list):
                    logger.warning(f"Champs pour '{element_type}' priorité '{priority_level}' ne sont pas une liste: {type(fields)}. Ignoré.")
                    continue
                    
                for field_config in fields:
                    # Validation défensive : vérifier que field_config est un dictionnaire
                    if not isinstance(field_config, dict):
                        logger.warning(f"Configuration de champ pour '{element_type}' priorité '{priority_level}' n'est pas un dictionnaire: {type(field_config)}. Ignoré.")
                        continue
                        
                    path = field_config.get("path", "")
                    if path:
                        default_fields[element_type].append(path)
                        
                        # Vérifier si le champ est essentiel
                        truncate = field_config.get("truncate", -1)
                        if truncate == -1 or (isinstance(truncate, int) and truncate <= ESSENTIAL_TRUNCATE_THRESHOLD):
                            if path not in essential_fields[element_type]:
                                essential_fields[element_type].append(path)
        
        return DefaultFieldConfigResponse(
            essential_fields=essential_fields,
            default_fields=default_fields,
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération de la config par défaut (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération de la configuration par défaut",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/unity-dialogues-path",
    response_model=UnityDialoguesPathResponse,
    status_code=status.HTTP_200_OK
)
async def get_unity_dialogues_path(
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> UnityDialoguesPathResponse:
    """Récupère le chemin configuré des dialogues Unity.
    
    Args:
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Chemin configuré des dialogues Unity.
    """
    try:
        unity_path = config_service.get_unity_dialogues_path()
        if unity_path is None:
            return UnityDialoguesPathResponse(path="")
        return UnityDialoguesPathResponse(path=str(unity_path))
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération du chemin Unity (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération du chemin Unity",
            details={"error": str(e)},
            request_id=request_id
        )


@router.put(
    "/unity-dialogues-path",
    response_model=UnityDialoguesPathResponse,
    status_code=status.HTTP_200_OK
)
async def set_unity_dialogues_path(
    request_data: UnityDialoguesPathRequest,
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> UnityDialoguesPathResponse:
    """Configure le chemin des dialogues Unity.
    
    Args:
        request_data: Données de la requête (chemin).
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Chemin configuré des dialogues Unity.
        
    Raises:
        ValidationException: Si le chemin est invalide.
    """
    try:
        success = config_service.set_unity_dialogues_path(request_data.path)
        if not success:
            from api.exceptions import ValidationException
            raise ValidationException(
                message="Le chemin Unity fourni est invalide ou ne peut pas être créé",
                details={"path": request_data.path},
                request_id=request_id
            )
        
        unity_path = config_service.get_unity_dialogues_path()
        if unity_path is None:
            return UnityDialoguesPathResponse(path="")
        return UnityDialoguesPathResponse(path=str(unity_path))
    except ValidationException:
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de la configuration du chemin Unity (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la configuration du chemin Unity",
            details={"error": str(e)},
            request_id=request_id
        )


# IMPORTANT: Cette route doit être définie AVANT /context-fields/{element_type}
# pour éviter que "validate" soit interprété comme un type d'élément
@router.get(
    "/context-fields/validate",
    status_code=status.HTTP_200_OK
)
async def validate_context_fields(
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> Dict[str, Any]:
    """Valide que context_config.json ne référence que des champs existants.
    
    Args:
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        config_service: ConfigurationService injecté.
        request_id: ID de la requête.
        
    Returns:
        Rapport de validation avec les champs valides et invalides.
    """
    try:
        from services.context_field_validator import ContextFieldValidator
        
        context_config = config_service.get_context_config()
        validator = ContextFieldValidator(context_builder)
        validation_results = validator.validate_all_configs(context_config)
        
        # Construire la réponse
        report = {
            "summary": {
                "total_element_types": len(validation_results),
                "total_errors": sum(1 for r in validation_results.values() if r.has_errors()),
                "total_warnings": sum(1 for r in validation_results.values() if r.has_warnings()),
            },
            "results": {}
        }
        
        for element_type, result in validation_results.items():
            report["results"][element_type] = {
                "total_fields_in_config": result.total_fields_in_config,
                "total_fields_detected": result.total_fields_detected,
                "valid_fields_count": len(result.valid_fields),
                "invalid_fields_count": len(result.invalid_fields),
                "has_errors": result.has_errors(),
                "has_warnings": result.has_warnings(),
                "invalid_fields": [
                    {
                        "path": issue.field_path,
                        "issue_type": issue.issue_type,
                        "severity": issue.severity,
                        "message": issue.message,
                        "suggested_path": issue.suggested_path
                    }
                    for issue in result.invalid_fields
                ]
            }
        
        # Ajouter le rapport texte complet
        report["text_report"] = validator.get_validation_report(context_config)
        
        return report
    except Exception as e:
        logger.exception(f"Erreur lors de la validation des champs (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la validation des champs",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/context-fields/{element_type}",
    response_model=ContextFieldsResponse,
    status_code=status.HTTP_200_OK
)
async def get_context_fields(
    element_type: str,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> ContextFieldsResponse:
    """Récupère les champs disponibles pour un type d'élément.
    
    Args:
        element_type: Type d'élément ("character", "location", "item", "species", "community")
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        Champs disponibles avec leurs métadonnées.
    """
    try:
        # Vérifier le cache (mais on va toujours re-marquer les champs essentiels)
        cache = get_context_field_cache()
        cached_fields = cache.get(element_type)
        
        # Toujours re-détecter les champs essentiels pour garantir la cohérence
        # même si on utilise le cache pour les autres infos
        if cached_fields is not None:
            # Re-marquer les champs essentiels même depuis le cache (pour garantir la cohérence)
            try:
                detector = ContextFieldDetector(context_builder)
                default_config = config_service.get_context_config()
                essential_fields = detector.identify_essential_fields(element_type, default_config)
                logger.info(f"Re-marquage des champs essentiels pour '{element_type}': {len(essential_fields)} champs détectés")
                for path, field_info in cached_fields.items():
                    if isinstance(field_info, DetectorFieldInfo):
                        if path in essential_fields:
                            field_info.is_essential = True
                            logger.debug(f"Champ '{path}' marqué comme essentiel")
            except Exception as e:
                logger.warning(f"Impossible de re-marquer les champs essentiels depuis le cache: {e}", exc_info=True)
            
            # Extraire les chemins de champs depuis context_config.json pour marquer is_in_config
            config_paths = set()
            try:
                default_config = config_service.get_context_config()
                element_config = default_config.get(element_type, {})
                if isinstance(element_config, dict):
                    for priority_level, fields in element_config.items():
                        if isinstance(fields, list):
                            for field_config in fields:
                                path = field_config.get("path", "")
                                if path:
                                    config_paths.add(path)
            except Exception as e:
                logger.warning(f"Impossible d'extraire les chemins depuis context_config.json: {e}")
            
            # Convertir les FieldInfo du cache en schémas API
            fields_dict = {}
            for path, field_info in cached_fields.items():
                if isinstance(field_info, DetectorFieldInfo):
                    is_in_config = path in config_paths
                    is_valid = True  # Tous les champs détectés existent par définition
                    
                    fields_dict[path] = FieldInfo(
                        path=field_info.path,
                        label=field_info.label,
                        type=field_info.type,
                        depth=field_info.depth,
                        frequency=field_info.frequency,
                        suggested=field_info.suggested,
                        category=field_info.category,
                        importance=ContextFieldDetector(None).classify_field_importance(field_info.frequency),
                        is_metadata=getattr(field_info, 'is_metadata', False),
                        is_essential=getattr(field_info, 'is_essential', False),
                        is_unique=getattr(field_info, 'is_unique', False),
                        is_in_config=is_in_config,
                        is_valid=is_valid
                    )
            
            # Détecter les champs uniques regroupés par fiche
            unique_fields_by_item = {}
            try:
                sample_data = detector.get_sample_data(element_type)
                if sample_data:
                    unique_fields_by_item = detector.detect_unique_fields_by_item(element_type, sample_data)
            except Exception as e:
                logger.warning(f"Impossible de détecter les champs uniques: {e}", exc_info=True)
            
            return ContextFieldsResponse(
                element_type=element_type,
                fields=fields_dict,
                total=len(fields_dict),
                unique_fields_by_item=unique_fields_by_item if isinstance(unique_fields_by_item, dict) else {}
            )
        
        # Détecter les champs
        detector = ContextFieldDetector(context_builder)
        detected_fields = detector.detect_available_fields(element_type)
        
        # Marquer les champs essentiels depuis la config par défaut et par analyse
        try:
            default_config = config_service.get_context_config()
            essential_fields = detector.identify_essential_fields(element_type, default_config)
            logger.info(f"Champs essentiels détectés pour '{element_type}': {len(essential_fields)} champs")
            
            essential_count = 0
            for path, field_info in detected_fields.items():
                if path in essential_fields:
                    field_info.is_essential = True
                    essential_count += 1
                    logger.debug(f"Champ '{path}' marqué comme essentiel")
        except Exception as e:
            logger.warning(f"Impossible de marquer les champs essentiels: {e}", exc_info=True)
        
        # Mettre en cache
        cache.set(element_type, detected_fields)
        
        # Détecter les champs uniques regroupés par fiche
        unique_fields_by_item = {}
        try:
            sample_data = detector.get_sample_data(element_type)
            if sample_data:
                unique_fields_by_item = detector.detect_unique_fields_by_item(element_type, sample_data)
        except Exception as e:
            logger.warning(f"Impossible de détecter les champs uniques: {e}", exc_info=True)
        
        # Extraire les chemins de champs depuis context_config.json pour marquer is_in_config
        config_paths = set()
        try:
            default_config = config_service.get_context_config()
            element_config = default_config.get(element_type, {})
            if isinstance(element_config, dict):
                for priority_level, fields in element_config.items():
                    if isinstance(fields, list):
                        for field_config in fields:
                            path = field_config.get("path", "")
                            if path:
                                config_paths.add(path)
        except Exception as e:
            logger.warning(f"Impossible d'extraire les chemins depuis context_config.json: {e}")
        
        # Convertir en schémas API
        fields_dict = {}
        essential_in_response = 0
        metadata_in_response = 0
        for path, field_info in detected_fields.items():
            is_essential = field_info.is_essential
            is_metadata = field_info.is_metadata
            is_unique = getattr(field_info, 'is_unique', False)
            is_in_config = path in config_paths
            is_valid = True  # Tous les champs détectés existent par définition
            
            if is_essential:
                essential_in_response += 1
            if is_metadata:
                metadata_in_response += 1
            fields_dict[path] = FieldInfo(
                path=field_info.path,
                label=field_info.label,
                type=field_info.type,
                depth=field_info.depth,
                frequency=field_info.frequency,
                suggested=field_info.suggested,
                category=field_info.category,
                importance=detector.classify_field_importance(field_info.frequency),
                is_metadata=is_metadata,
                is_essential=is_essential,
                is_unique=is_unique,
                is_in_config=is_in_config,
                is_valid=is_valid
            )
        
        return ContextFieldsResponse(
            element_type=element_type,
            fields=fields_dict,
            total=len(fields_dict),
            unique_fields_by_item=unique_fields_by_item if isinstance(unique_fields_by_item, dict) else {}
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la détection des champs pour '{element_type}' (request_id: {request_id})")
        raise InternalServerException(
            message=f"Erreur lors de la détection des champs pour '{element_type}'",
            details={"error": str(e), "element_type": element_type},
            request_id=request_id
        )


@router.post(
    "/context-fields/suggestions",
    response_model=ContextFieldSuggestionsResponse,
    status_code=status.HTTP_200_OK
)
async def get_field_suggestions(
    request_data: ContextFieldSuggestionsRequest,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> ContextFieldSuggestionsResponse:
    """Retourne des suggestions de champs selon le contexte de génération.
    
    Args:
        request_data: Données de la requête (type d'élément et contexte).
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        Liste des champs suggérés.
    """
    try:
        # Détecter les champs disponibles
        detector = ContextFieldDetector(context_builder)
        available_fields_dict = detector.detect_available_fields(request_data.element_type)
        available_fields = list(available_fields_dict.keys())
        
        # Obtenir les suggestions
        suggestion_service = FieldSuggestionService()
        suggested_fields = suggestion_service.get_field_suggestions(
            element_type=request_data.element_type,
            context=request_data.context,
            available_fields=available_fields
        )
        
        return ContextFieldSuggestionsResponse(
            element_type=request_data.element_type,
            context=request_data.context,
            suggested_fields=suggested_fields
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération des suggestions (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération des suggestions de champs",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/context-fields/preview",
    response_model=ContextPreviewResponse,
    status_code=status.HTTP_200_OK
)
async def preview_context(
    request_data: ContextPreviewRequest,
    request: Request,
    context_builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> ContextPreviewResponse:
    """Prévisualise le contexte avec une configuration personnalisée.
    
    Args:
        request_data: Configuration personnalisée des champs.
        request: La requête HTTP.
        context_builder: ContextBuilder injecté.
        request_id: ID de la requête.
        
    Returns:
        Prévisualisation du contexte formaté.
    """
    try:
        # Extraire _element_modes si présent (si selected_elements est un dict avec _element_modes)
        element_modes = None
        if isinstance(request_data.selected_elements, dict):
            element_modes = request_data.selected_elements.pop("_element_modes", None)
        
        # Construire le contexte JSON (obligatoire, plus de fallback)
        structured_context = context_builder.build_context_json(
            selected_elements=request_data.selected_elements,
            scene_instruction=request_data.scene_instruction or "",
            field_configs=request_data.field_configs,
            organization_mode=request_data.organization_mode or "default",
            max_tokens=request_data.max_tokens,
            include_dialogue_type=True,
            element_modes=element_modes
        )
        # Sérialiser en texte pour compatibilité
        preview_text = context_builder.serialize_context_to_text(structured_context)
        
        # Compter les tokens
        tokens = context_builder.count_tokens(preview_text)
        
        # Convertir structured_context en dict pour la réponse
        structured_prompt_dict = None
        if structured_context:
            try:
                structured_prompt_dict = structured_context.model_dump()
            except Exception as e:
                logger.warning(f"Erreur lors de la conversion du structured_context en dict: {e}")
        
        return ContextPreviewResponse(
            preview=preview_text or "",
            tokens=tokens,
            structured_prompt=structured_prompt_dict
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la prévisualisation du contexte (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la prévisualisation du contexte",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/default-system-prompt",
    status_code=status.HTTP_200_OK
)
async def get_default_system_prompt(
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> JSONResponse:
    """Récupère le system prompt par défaut.
    
    Args:
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Réponse JSON contenant le prompt par défaut.
    """
    try:
        prompt = config_service.get_default_system_prompt()
        return JSONResponse(content={"prompt": prompt})
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération du system prompt par défaut (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération du system prompt par défaut",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/template-file-paths",
    response_model=TemplateFilePathsResponse,
    status_code=status.HTTP_200_OK
)
async def get_template_file_paths(
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> TemplateFilePathsResponse:
    """Récupère les chemins des fichiers de templates pour les ouvrir dans l'éditeur.
    
    Args:
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Chemins des fichiers de templates.
    """
    try:
        # Chemin du system prompt par défaut
        default_meta = config_service.prompts_metadata.get("system_prompts", {}).get("default", {})
        system_prompt_file = default_meta.get("file", "system_prompts/default.txt")
        system_prompt_path = str(CONFIG_DIR / system_prompt_file)
        
        # Chemins des répertoires
        scene_instructions_dir = str(CONFIG_DIR / "scene_instructions")
        author_profiles_dir = str(CONFIG_DIR / "author_profiles")
        config_dir = str(CONFIG_DIR)
        
        return TemplateFilePathsResponse(
            system_prompt_path=system_prompt_path,
            scene_instructions_dir=scene_instructions_dir,
            author_profiles_dir=author_profiles_dir,
            config_dir=config_dir
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération des chemins de templates (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération des chemins de templates",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/scene-instruction-templates",
    response_model=SceneInstructionTemplatesResponse,
    status_code=status.HTTP_200_OK
)
async def get_scene_instruction_templates(
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> SceneInstructionTemplatesResponse:
    """Récupère la liste des templates d'instructions de scène disponibles.
    
    Args:
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Liste des templates d'instructions de scène disponibles.
    """
    try:
        templates_data = config_service.get_scene_instruction_templates()
        templates = [
            SceneInstructionTemplate(
                id=template.get("id", ""),
                name=template.get("name", ""),
                description=template.get("description", ""),
                instructions=template.get("instructions", "")
            )
            for template in templates_data
        ]
        return SceneInstructionTemplatesResponse(
            templates=templates,
            total=len(templates)
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération des templates d'instructions de scène (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération des templates d'instructions de scène",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/author-profile-templates",
    response_model=AuthorProfileTemplatesResponse,
    status_code=status.HTTP_200_OK
)
async def get_author_profile_templates(
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> AuthorProfileTemplatesResponse:
    """Récupère la liste des templates de profils d'auteur disponibles.
    
    Args:
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Liste des templates de profils d'auteur disponibles.
    """
    try:
        templates_data = config_service.get_author_profile_templates()
        templates = [
            AuthorProfileTemplate(
                id=template.get("id", ""),
                name=template.get("name", ""),
                description=template.get("description", ""),
                profile=template.get("profile", "")
            )
            for template in templates_data
        ]
        return AuthorProfileTemplatesResponse(
            templates=templates,
            total=len(templates)
        )
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération des templates de profils d'auteur (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération des templates de profils d'auteur",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/debug/prompt-engine",
    status_code=status.HTTP_200_OK
)
async def debug_prompt_engine_loaded_code() -> JSONResponse:
    """Expose des infos de debug sur le PromptEngine chargé côté serveur (dev)."""
    if os.getenv("ENVIRONMENT", "development") == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    import inspect
    import core.prompt.prompt_engine as pe_module
    from core.prompt.prompt_engine import PromptEngine

    try:
        src = inspect.getsource(PromptEngine.build_prompt)
    except Exception:
        src = ""

    return JSONResponse(
        content={
            "prompt_engine_module_file": getattr(pe_module, "__file__", None),
            "has_prompt_input_parameter": "PromptInput" in src,
            "has_xml_format": "<prompt>" in src or 'create_xml_document' in src,
        }
    )


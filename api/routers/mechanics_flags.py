"""Router pour la gestion des flags in-game (mécaniques RPG)."""
import json
import logging
from datetime import datetime, timezone
from typing import Annotated, Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, status

from api.routers.auth import get_current_user
from api.schemas.flags import (
    FlagsCatalogResponse,
    FlagDefinition,
    UpsertFlagRequest,
    UpsertFlagResponse,
    ToggleFavoriteRequest,
    ToggleFavoriteResponse,
    FlagSnapshot,
    ImportSnapshotRequest,
    ImportSnapshotResponse,
    ExportSnapshotRequest,
    ExportSnapshotResponse,
    InGameFlag,
    FlagValue
)
from api.exceptions import InternalServerException, ValidationException, NotFoundException
from api.dependencies import get_request_id
from services.flag_catalog_service import FlagCatalogService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/mechanics/flags",
    tags=["Mechanics - Flags"],
    dependencies=[Depends(get_current_user)],
)


def get_flag_catalog_service() -> FlagCatalogService:
    """Retourne une instance du service de catalogue de flags.
    
    Returns:
        Instance de FlagCatalogService.
    """
    return FlagCatalogService()


@router.get(
    "",
    response_model=FlagsCatalogResponse,
    status_code=status.HTTP_200_OK
)
async def list_flags(
    q: Optional[str] = Query(None, description="Terme de recherche (id, label, description, tags)"),
    category: Optional[str] = Query(None, description="Filtrer par catégorie"),
    favorites_only: bool = Query(False, description="Ne retourner que les favoris"),
    flag_service: Annotated[FlagCatalogService, Depends(get_flag_catalog_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> FlagsCatalogResponse:
    """Liste les définitions de flags disponibles avec filtres optionnels.
    
    Args:
        q: Terme de recherche textuelle.
        category: Filtrer par catégorie (ex: "Event", "Choice", "Stat").
        favorites_only: Ne retourner que les flags favoris.
        flag_service: Service de catalogue injecté.
        request_id: ID de la requête.
        
    Returns:
        Liste des définitions de flags correspondant aux critères.
    """
    try:
        flags = flag_service.search(
            query=q,
            category=category,
            favorites_only=favorites_only
        )
        
        # Convertir en modèles Pydantic (inclure defaultValueParsed si présent)
        flag_definitions = []
        for flag in flags:
            flag_def = FlagDefinition(
                id=flag.get("id", ""),
                type=flag.get("type", "bool"),
                category=flag.get("category", ""),
                label=flag.get("label", ""),
                description=flag.get("description"),
                defaultValue=flag.get("defaultValue", ""),
                defaultValueParsed=flag.get("defaultValueParsed"),  # Inclure la valeur parsée
                tags=flag.get("tags", []),
                isFavorite=flag.get("isFavorite", False)
            )
            flag_definitions.append(flag_def)
        
        return FlagsCatalogResponse(
            flags=flag_definitions,
            total=len(flag_definitions)
        )
        
    except Exception as e:
        logger.exception(f"Erreur lors de la récupération des flags (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération des flags",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "",
    response_model=UpsertFlagResponse,
    status_code=status.HTTP_200_OK
)
async def upsert_flag(
    request_data: UpsertFlagRequest,
    flag_service: Annotated[FlagCatalogService, Depends(get_flag_catalog_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> UpsertFlagResponse:
    """Crée ou met à jour une définition de flag dans le catalogue.
    
    Args:
        request_data: Données de la définition du flag.
        flag_service: Service de catalogue injecté.
        request_id: ID de la requête.
        
    Returns:
        Réponse contenant la définition créée/mise à jour.
        
    Raises:
        ValidationException: Si la définition est invalide.
        InternalServerException: Si l'écriture échoue.
    """
    try:
        # Convertir en dict pour le service
        definition_dict = request_data.model_dump()
        
        # Upsert via le service
        flag_service.upsert_definition(definition_dict)
        
        # Recharger la définition depuis le CSV pour confirmation
        flag_service.reload()
        flags = flag_service.search(query=request_data.id)
        
        if not flags:
            raise InternalServerException(
                message="Le flag a été créé mais n'a pas pu être relu",
                request_id=request_id
            )
        
        updated_flag = FlagDefinition(**flags[0])
        
        return UpsertFlagResponse(
            success=True,
            flag=updated_flag
        )
        
    except ValueError as e:
        logger.warning(f"Validation error lors de l'upsert de flag (request_id: {request_id}): {e}")
        raise ValidationException(
            message=str(e),
            request_id=request_id
        )
    except Exception as e:
        logger.exception(f"Erreur lors de l'upsert de flag (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de l'upsert du flag",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/toggle-favorite",
    response_model=ToggleFavoriteResponse,
    status_code=status.HTTP_200_OK
)
async def toggle_favorite(
    request_data: ToggleFavoriteRequest,
    flag_service: Annotated[FlagCatalogService, Depends(get_flag_catalog_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> ToggleFavoriteResponse:
    """Active/désactive le statut favori d'un flag.
    
    Args:
        request_data: Données de la requête (flag_id, is_favorite).
        flag_service: Service de catalogue injecté.
        request_id: ID de la requête.
        
    Returns:
        Réponse de confirmation.
        
    Raises:
        NotFoundException: Si le flag n'existe pas.
        InternalServerException: Si l'écriture échoue.
    """
    try:
        flag_service.toggle_favorite(
            flag_id=request_data.flag_id,
            is_favorite=request_data.is_favorite
        )
        
        return ToggleFavoriteResponse(
            success=True,
            flag_id=request_data.flag_id,
            is_favorite=request_data.is_favorite
        )
        
    except ValueError as e:
        # Flag introuvable
        logger.warning(f"Flag introuvable (request_id: {request_id}): {e}")
        raise NotFoundException(
            resource_type="Flag",
            resource_id=request_data.flag_id,
            request_id=request_id
        )
    except Exception as e:
        logger.exception(f"Erreur lors du toggle favorite (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors du toggle favorite",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/import-snapshot",
    response_model=ImportSnapshotResponse,
    status_code=status.HTTP_200_OK
)
async def import_snapshot(
    request_data: ImportSnapshotRequest,
    flag_service: Annotated[FlagCatalogService, Depends(get_flag_catalog_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> ImportSnapshotResponse:
    """Importe un snapshot Unity (état réel des flags du jeu).
    
    Args:
        request_data: Données de la requête (snapshot_json).
        flag_service: Service de catalogue injecté.
        request_id: ID de la requête.
        
    Returns:
        Réponse contenant le snapshot importé et les warnings (flags inconnus).
        
    Raises:
        ValidationException: Si le JSON est invalide.
        InternalServerException: Si l'import échoue.
    """
    try:
        # Parser le JSON du snapshot
        try:
            snapshot_dict = json.loads(request_data.snapshot_json)
        except json.JSONDecodeError as e:
            raise ValidationException(
                message=f"JSON invalide dans snapshot_json: {e}",
                request_id=request_id
            )
        
        # Valider et convertir en FlagSnapshot
        try:
            snapshot = FlagSnapshot(**snapshot_dict)
        except Exception as e:
            raise ValidationException(
                message=f"Format snapshot invalide: {e}",
                request_id=request_id
            )
        
        # Charger le catalogue pour valider les flags
        catalog = flag_service.load_definitions()
        catalog_ids = {flag["id"] for flag in catalog}
        
        # Valider les flags du snapshot
        warnings = []
        imported_count = 0
        
        for flag_id, flag_value in snapshot.flags.items():
            if flag_id not in catalog_ids:
                warnings.append(f"Flag inconnu ignoré: {flag_id} (non présent dans le catalogue)")
            else:
                imported_count += 1
        
        logger.info(f"Snapshot importé: {imported_count} flags valides, {len(warnings)} warnings (request_id: {request_id})")
        
        return ImportSnapshotResponse(
            success=True,
            imported_count=imported_count,
            warnings=warnings,
            snapshot=snapshot
        )
        
    except ValidationException:
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de l'import du snapshot (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de l'import du snapshot",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/export-snapshot",
    response_model=ExportSnapshotResponse,
    status_code=status.HTTP_200_OK
)
async def export_snapshot(
    request_data: Optional[ExportSnapshotRequest] = None,
    flag_service: Annotated[FlagCatalogService, Depends(get_flag_catalog_service)] = None,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> ExportSnapshotResponse:
    """Exporte un snapshot (sélection actuelle des flags).
    
    Si request_data.flags est fourni, exporte ces flags spécifiques.
    Sinon, retourne un snapshot vide (le frontend fournira les flags sélectionnés).
    
    Args:
        request_data: Données de la requête (flags optionnels à exporter).
        flag_service: Service de catalogue injecté.
        request_id: ID de la requête.
        
    Returns:
        Réponse contenant le snapshot exporté.
    """
    try:
        # Construire le dictionnaire de flags
        flags_dict: Dict[str, FlagValue] = {}
        
        if request_data and request_data.flags:
            # Utiliser les flags fournis dans la requête
            for flag in request_data.flags:
                flags_dict[flag.id] = flag.value
        # Sinon, retourner un snapshot vide (le frontend gère la sélection)
        
        # Créer le snapshot
        snapshot = FlagSnapshot(
            version="1.0",
            timestamp=datetime.now(timezone.utc).isoformat(),
            flags=flags_dict
        )
        
        return ExportSnapshotResponse(
            success=True,
            snapshot=snapshot
        )
        
    except Exception as e:
        logger.exception(f"Erreur lors de l'export du snapshot (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de l'export du snapshot",
            details={"error": str(e)},
            request_id=request_id
        )

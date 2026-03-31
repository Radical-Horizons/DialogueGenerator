"""Router FastAPI pour les endpoints /api/v1/presets."""
from fastapi import APIRouter, Depends, HTTPException, status, Response

from api.routers.auth import get_current_user
from typing import List
import logging
import base64

from api.schemas.preset import Preset, PresetCreate, PresetUpdate, PresetValidationResult
from api.dependencies import get_preset_service
from services.preset_service import PresetService

router = APIRouter(dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)


@router.get("", response_model=List[Preset])
def list_presets(
    preset_service: PresetService = Depends(get_preset_service)
) -> List[Preset]:
    """Liste tous les presets disponibles.
    
    Returns:
        Liste de tous les presets (vide si aucun)
    """
    try:
        presets = preset_service.list_presets()
        logger.info(f"Liste presets retournée: {len(presets)} presets")
        return presets
    except Exception as e:
        logger.error(f"Erreur liste presets: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing presets: {str(e)}"
        )


@router.post("", response_model=Preset, status_code=status.HTTP_201_CREATED)
def create_preset(
    preset_data: PresetCreate,
    response: Response,
    preset_service: PresetService = Depends(get_preset_service)
) -> Preset:
    """Crée un nouveau preset.
    
    Args:
        preset_data: Données du preset (name, icon, configuration)
    
    Returns:
        Preset créé avec UUID généré
    
    Raises:
        500: Si erreur d'écriture disque ou permissions
    """
    try:
        preset, cleanup_message = preset_service.create_preset(preset_data.model_dump())
        logger.info(f"Preset créé: {preset.name} (ID: {preset.id})")
        
        # Ajouter message auto-cleanup dans header si présent
        # Encoder le message en base64 pour éviter les problèmes d'encodage dans les headers HTTP
        if cleanup_message:
            encoded_message = base64.b64encode(cleanup_message.encode('utf-8')).decode('ascii')
            response.headers["X-Preset-Cleanup-Message"] = encoded_message
            response.headers["X-Preset-Cleanup-Message-Encoding"] = "base64"
        
        return preset
    except PermissionError as e:
        logger.error(f"Permission denied creating preset: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Permission denied: {str(e)}"
        )
    except OSError as e:
        logger.error(f"Disk error creating preset: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Disk error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Erreur création preset: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating preset: {str(e)}"
        )


@router.get("/{preset_id}", response_model=Preset)
def get_preset(
    preset_id: str,
    preset_service: PresetService = Depends(get_preset_service)
) -> Preset:
    """Charge un preset spécifique.
    
    Args:
        preset_id: UUID du preset
    
    Returns:
        Preset chargé
    
    Raises:
        404: Si preset n'existe pas
    """
    try:
        preset = preset_service.load_preset(preset_id)
        logger.debug(f"Preset chargé: {preset.name} (ID: {preset_id})")
        return preset
    except FileNotFoundError:
        logger.warning(f"Preset not found: {preset_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset {preset_id} not found"
        )
    except ValueError as e:
        logger.error(f"Invalid preset data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Invalid preset data: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Erreur chargement preset {preset_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error loading preset: {str(e)}"
        )


@router.put("/{preset_id}", response_model=Preset)
def update_preset(
    preset_id: str,
    update_data: PresetUpdate,
    response: Response,
    preset_service: PresetService = Depends(get_preset_service)
) -> Preset:
    """Met à jour un preset existant.
    
    Args:
        preset_id: UUID du preset
        update_data: Données à mettre à jour (champs partiels)
    
    Returns:
        Preset mis à jour
    
    Raises:
        404: Si preset n'existe pas
    """
    try:
        # Filtrer champs non-None pour update partiel
        update_dict = update_data.model_dump(exclude_none=True)
        preset, cleanup_message = preset_service.update_preset(preset_id, update_dict)
        logger.info(f"Preset mis à jour: {preset.name} (ID: {preset_id})")
        
        # Ajouter message auto-cleanup dans header si présent
        # Encoder le message en base64 pour éviter les problèmes d'encodage dans les headers HTTP
        if cleanup_message:
            encoded_message = base64.b64encode(cleanup_message.encode('utf-8')).decode('ascii')
            response.headers["X-Preset-Cleanup-Message"] = encoded_message
            response.headers["X-Preset-Cleanup-Message-Encoding"] = "base64"
        
        return preset
    except FileNotFoundError:
        logger.warning(f"Preset not found for update: {preset_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset {preset_id} not found"
        )
    except Exception as e:
        logger.error(f"Erreur mise à jour preset {preset_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating preset: {str(e)}"
        )


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preset(
    preset_id: str,
    preset_service: PresetService = Depends(get_preset_service)
) -> None:
    """Supprime un preset.
    
    Args:
        preset_id: UUID du preset
    
    Raises:
        404: Si preset n'existe pas
    """
    try:
        preset_service.delete_preset(preset_id)
        logger.info(f"Preset supprimé: {preset_id}")
    except FileNotFoundError:
        logger.warning(f"Preset not found for deletion: {preset_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset {preset_id} not found"
        )
    except Exception as e:
        logger.error(f"Erreur suppression preset {preset_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting preset: {str(e)}"
        )


@router.get("/{preset_id}/validate", response_model=PresetValidationResult)
def validate_preset(
    preset_id: str,
    preset_service: PresetService = Depends(get_preset_service)
) -> PresetValidationResult:
    """Valide les références GDD d'un preset.
    
    Vérifie que les IDs personnages/lieux existent dans le GDD actuel.
    
    Args:
        preset_id: UUID du preset
    
    Returns:
        Résultat de validation avec warnings si références obsolètes
    
    Raises:
        404: Si preset n'existe pas
    """
    try:
        # Charger preset
        preset = preset_service.load_preset(preset_id)
        
        # Valider références
        result = preset_service.validate_preset_references(preset)
        
        if not result.valid:
            logger.warning(f"Preset {preset_id} has {len(result.obsoleteRefs)} obsolete references")
        
        return result
    except FileNotFoundError:
        logger.warning(f"Preset not found for validation: {preset_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset {preset_id} not found"
        )
    except Exception as e:
        logger.error(f"Erreur validation preset {preset_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error validating preset: {str(e)}"
        )

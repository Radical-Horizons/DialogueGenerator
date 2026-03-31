"""Router pour la bibliothèque de dialogues Unity JSON."""
import json
import logging
from pathlib import Path
from typing import Annotated, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Request, status

from api.routers.auth import get_current_user
from api.schemas.dialogue import (
    UnityDialogueListResponse,
    UnityDialogueMetadata,
    UnityDialogueReadResponse,
    UnityDialoguePreviewRequest,
    UnityDialoguePreviewResponse,
)
from api.dependencies import (
    get_config_service,
    get_request_id
)
from api.exceptions import NotFoundException, ValidationException, InternalServerException
from services.configuration_service import ConfigurationService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


def _extract_title_from_json(json_data: list) -> Optional[str]:
    """Extrait un titre potentiel depuis le JSON Unity (premier nœud avec line, ou id START).
    
    Args:
        json_data: Liste de nœuds Unity.
        
    Returns:
        Titre extrait ou None.
    """
    if not json_data or not isinstance(json_data, list):
        return None
    
    # Chercher un nœud START avec un line comme titre potentiel
    for node in json_data:
        if isinstance(node, dict):
            node_id = node.get("id", "")
            line = node.get("line", "")
            if node_id == "START" and line:
                # Prendre les 50 premiers caractères comme titre
                return line[:50].strip()
    
    # Sinon, prendre le line du premier nœud qui en a un
    for node in json_data:
        if isinstance(node, dict) and node.get("line"):
            return node.get("line", "")[:50].strip()
    
    return None


@router.get(
    "",
    response_model=UnityDialogueListResponse,
    status_code=status.HTTP_200_OK
)
async def list_unity_dialogues(
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> UnityDialogueListResponse:
    """Liste tous les fichiers de dialogues Unity JSON.
    
    Args:
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Liste des métadonnées des fichiers Unity JSON.
        
    Raises:
        ValidationException: Si le chemin Unity n'est pas configuré.
        InternalServerException: Si la lecture du dossier échoue.
    """
    try:
        unity_path = config_service.get_unity_dialogues_path()
        if not unity_path:
            raise ValidationException(
                message="Le chemin Unity dialogues n'est pas configuré. Configurez-le dans les paramètres.",
                details={"field": "unity_dialogues_path"},
                request_id=request_id
            )
        
        unity_dir = Path(unity_path)
        
        # Créer le dossier s'il n'existe pas
        unity_dir.mkdir(parents=True, exist_ok=True)
        
        # Lister uniquement les vrais dialogues Unity et ignorer les sidecars techniques.
        json_files = [
            path for path in unity_dir.glob("*.json")
            if not path.name.endswith(".layout.json")
            and not path.name.endswith(".json.json")
        ]
        metadata_list = []
        
        for json_file in json_files:
            try:
                stat = json_file.stat()
                
                # Optionnel: extraire un titre depuis le contenu JSON (peut être coûteux si beaucoup de fichiers)
                title = None
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        json_data = json.load(f)
                        if isinstance(json_data, list):
                            title = _extract_title_from_json(json_data)
                except (json.JSONDecodeError, IOError):
                    # Ignorer les erreurs de parsing pour le listing (juste ne pas avoir de titre)
                    pass
                
                metadata = UnityDialogueMetadata(
                    filename=json_file.name,
                    file_path=str(json_file.absolute()),
                    size_bytes=stat.st_size,
                    modified_time=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    title=title
                )
                metadata_list.append(metadata)
            except (OSError, IOError) as e:
                logger.warning(f"Erreur lors de la lecture des métadonnées de {json_file}: {e}")
                continue
        
        # Trier par date de modification (plus récent en premier)
        metadata_list.sort(key=lambda x: x.modified_time, reverse=True)
        
        logger.info(f"Liste Unity dialogues: {len(metadata_list)} fichier(s) trouvé(s) (request_id: {request_id})")
        
        return UnityDialogueListResponse(
            dialogues=metadata_list,
            total=len(metadata_list)
        )
        
    except ValidationException:
        raise
    except Exception as e:
        logger.exception(f"Erreur lors du listing des dialogues Unity (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la récupération de la liste des dialogues Unity",
            details={"error": str(e)},
            request_id=request_id
        )


@router.get(
    "/{filename}",
    response_model=UnityDialogueReadResponse,
    status_code=status.HTTP_200_OK
)
async def read_unity_dialogue(
    filename: str,
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> UnityDialogueReadResponse:
    """Lit un fichier de dialogue Unity JSON.
    
    Args:
        filename: Nom du fichier (avec ou sans extension .json).
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Returns:
        Contenu JSON du dialogue (string) + métadonnées.
        
    Raises:
        ValidationException: Si le chemin Unity n'est pas configuré ou si le nom de fichier est invalide.
        NotFoundException: Si le fichier n'existe pas.
        InternalServerException: Si la lecture échoue.
    """
    try:
        # Sécurité: s'assurer que le filename ne contient pas de chemin (path traversal)
        if ".." in filename or "/" in filename or "\\" in filename:
            raise ValidationException(
                message="Nom de fichier invalide (caractères interdits)",
                details={"filename": filename},
                request_id=request_id
            )
        
        unity_path = config_service.get_unity_dialogues_path()
        if not unity_path:
            raise ValidationException(
                message="Le chemin Unity dialogues n'est pas configuré. Configurez-le dans les paramètres.",
                details={"field": "unity_dialogues_path"},
                request_id=request_id
            )
        
        unity_dir = Path(unity_path)
        
        # Ajouter .json si pas présent
        if not filename.endswith('.json'):
            filename = filename + '.json'
        
        file_path = unity_dir / filename
        
        if not file_path.exists():
            raise NotFoundException(
                resource_type="Dialogue Unity",
                resource_id=filename,
                request_id=request_id
            )
        
        # Lire le fichier
        try:
            json_content = file_path.read_text(encoding='utf-8')
            
            # Valider que c'est du JSON valide ; accepter liste ou document canonique (schemaVersion + nodes)
            try:
                json_data = json.loads(json_content)
                if isinstance(json_data, dict) and "nodes" in json_data:
                    # Format document (Story 16.2) : renvoyer la liste des nœuds pour compatibilité loadGraph
                    json_data = json_data["nodes"]
                    json_content = json.dumps(json_data, ensure_ascii=False, indent=2)
                if not isinstance(json_data, list):
                    raise ValidationException(
                        message="Le fichier JSON Unity doit être un tableau de nœuds ou un document (schemaVersion, nodes)",
                        details={"filename": filename},
                        request_id=request_id
                    )
            except json.JSONDecodeError as e:
                raise ValidationException(
                    message=f"Le fichier JSON n'est pas valide: {str(e)}",
                    details={"filename": filename, "json_error": str(e)},
                    request_id=request_id
                )
            
            # Extraire un titre potentiel
            title = _extract_title_from_json(json_data)
            
            stat = file_path.stat()
            
            logger.info(f"Dialogue Unity lu: {filename} (request_id: {request_id})")
            
            return UnityDialogueReadResponse(
                filename=filename,
                json_content=json_content,
                title=title,
                size_bytes=stat.st_size,
                modified_time=datetime.fromtimestamp(stat.st_mtime).isoformat()
            )
            
        except (IOError, OSError) as e:
            raise InternalServerException(
                message=f"Erreur lors de la lecture du fichier '{filename}'",
                details={"filename": filename, "error": str(e)},
                request_id=request_id
            )
        
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de la lecture du dialogue Unity {filename} (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la lecture du dialogue Unity",
            details={"error": str(e)},
            request_id=request_id
        )


@router.delete(
    "/{filename}",
    status_code=status.HTTP_204_NO_CONTENT
)
async def delete_unity_dialogue(
    filename: str,
    request: Request,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)]
) -> None:
    """Supprime un fichier de dialogue Unity JSON.
    
    Args:
        filename: Nom du fichier (avec ou sans extension .json).
        request: La requête HTTP.
        config_service: Service de configuration injecté.
        request_id: ID de la requête.
        
    Raises:
        ValidationException: Si le chemin Unity n'est pas configuré ou si le nom de fichier est invalide.
        NotFoundException: Si le fichier n'existe pas.
        InternalServerException: Si la suppression échoue.
    """
    try:
        # Sécurité: s'assurer que le filename ne contient pas de chemin (path traversal)
        if ".." in filename or "/" in filename or "\\" in filename:
            raise ValidationException(
                message="Nom de fichier invalide (caractères interdits)",
                details={"filename": filename},
                request_id=request_id
            )
        
        unity_path = config_service.get_unity_dialogues_path()
        if not unity_path:
            raise ValidationException(
                message="Le chemin Unity dialogues n'est pas configuré. Configurez-le dans les paramètres.",
                details={"field": "unity_dialogues_path"},
                request_id=request_id
            )
        
        unity_dir = Path(unity_path)
        
        # Ajouter .json si pas présent
        if not filename.endswith('.json'):
            filename = filename + '.json'
        
        file_path = unity_dir / filename
        
        if not file_path.exists():
            raise NotFoundException(
                resource_type="Dialogue Unity",
                resource_id=filename,
                request_id=request_id
            )
        
        document_key = filename[:-5] if filename.endswith(".json") else filename
        
        # Supprimer le fichier dialogue
        try:
            file_path.unlink()
            logger.info(f"Dialogue Unity supprimé: {filename} (request_id: {request_id})")
        except (OSError, IOError) as e:
            raise InternalServerException(
                message=f"Erreur lors de la suppression du fichier '{filename}'",
                details={"filename": filename, "error": str(e)},
                request_id=request_id
            )
        
        # Supprimer le layout associé (Assets/Layouts)
        layouts_path = config_service.get_unity_layouts_path()
        if layouts_path:
            layout_dir = Path(layouts_path)
            for sidecar in (f"{document_key}.layout.json", f"{document_key}.layout.meta"):
                sidecar_path = layout_dir / sidecar
                if sidecar_path.is_file():
                    try:
                        sidecar_path.unlink()
                        logger.info(f"Layout supprimé: {sidecar} (request_id: {request_id})")
                    except (OSError, IOError) as e:
                        logger.warning("Impossible de supprimer le layout %s: %s", sidecar, e)
        
        # Supprimer le sidecar last_seq (ADR-006) s'il existe
        seq_path = unity_dir / f"{document_key}.seq"
        if seq_path.is_file():
            try:
                seq_path.unlink()
                logger.info(f"Sidecar .seq supprimé pour {document_key} (request_id: {request_id})")
            except (OSError, IOError) as e:
                logger.warning("Impossible de supprimer le fichier .seq %s: %s", document_key, e)
        
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de la suppression du dialogue Unity {filename} (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la suppression du dialogue Unity",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/preview",
    response_model=UnityDialoguePreviewResponse,
    status_code=status.HTTP_200_OK
)
async def preview_unity_dialogue_for_context(
    request_data: UnityDialoguePreviewRequest,
    request: Request,
    request_id: Annotated[str, Depends(get_request_id)]
) -> UnityDialoguePreviewResponse:
    """Génère un résumé texte injectable LLM à partir d'un dialogue Unity JSON (pour continuité).
    
    Args:
        request_data: Contenu JSON du dialogue Unity.
        request: La requête HTTP.
        request_id: ID de la requête.
        
    Returns:
        Résumé texte formaté pour injection dans un prompt LLM.
        
    Raises:
        ValidationException: Si le JSON est invalide.
    """
    try:
        # Parser le JSON
        try:
            json_data = json.loads(request_data.json_content)
            if not isinstance(json_data, list):
                raise ValidationException(
                    message="Le JSON Unity doit être un tableau de nœuds",
                    details={"json_content": "Doit être un tableau []"},
                    request_id=request_id
                )
        except json.JSONDecodeError as e:
            raise ValidationException(
                message="Le JSON fourni n'est pas valide",
                details={"json_content": f"Erreur JSON: {str(e)}"},
                request_id=request_id
            )
        
        # Construire un résumé texte formaté
        preview_lines = []
        preview_lines.append("=== Dialogue précédent (contexte) ===\n")
        
        for node in json_data:
            if not isinstance(node, dict):
                continue
            
            node_id = node.get("id", "UNKNOWN")
            speaker = node.get("speaker", "")
            line = node.get("line", "")
            choices = node.get("choices", [])
            next_node = node.get("nextNode")
            
            # En-tête du nœud
            preview_lines.append(f"[{node_id}]")
            if speaker:
                preview_lines.append(f"Speaker: {speaker}")
            if line:
                preview_lines.append(f"Dialogue: {line}")
            
            # Choix si présents
            if choices:
                preview_lines.append("Choix:")
                for i, choice in enumerate(choices, 1):
                    choice_text = choice.get("text", "")
                    target = choice.get("targetNode", "")
                    if choice_text:
                        preview_lines.append(f"  {i}. {choice_text} → {target}")
            elif next_node:
                preview_lines.append(f"Suivant: → {next_node}")
            
            preview_lines.append("")  # Ligne vide entre nœuds
        
        preview_text = "\n".join(preview_lines)
        
        logger.debug(f"Preview généré pour dialogue Unity ({len(json_data)} nœud(s)) (request_id: {request_id})")
        
        return UnityDialoguePreviewResponse(
            preview_text=preview_text,
            node_count=len(json_data)
        )
        
    except ValidationException:
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de la génération du preview Unity (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la génération du preview du dialogue Unity",
            details={"error": str(e)},
            request_id=request_id
        )





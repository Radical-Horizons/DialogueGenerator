"""Router pour la bibliothèque de dialogues Unity JSON."""
import json
import logging
from pathlib import Path
from typing import Annotated, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status

from api.routers.auth import get_current_user
from api.schemas.dialogue import (
    UnityDialogueListResponse,
    UnityDialogueMetadata,
    UnityDialogueReadResponse,
    UnityDialoguePreviewRequest,
    UnityDialoguePreviewResponse,
    UnitySchemaReferenceResponse,
    UnitySchemaSectionSummary,
)
from api.dependencies import (
    get_config_service,
    get_dialogue_sharing_service,
    get_document_persistence_service,
    get_request_id
)
from api.exceptions import NotFoundException, ValidationException, InternalServerException
from services.configuration_service import ConfigurationService
from services.document_persistence_service import (
    DialogueAccessDeniedError,
    DialogueNotFoundError,
    DocumentPersistenceService,
)
from services.dialogue_sharing_service import DialogueSharingService
from api.utils.unity_schema_validator import load_unity_schema, schema_exists

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


def _capabilities_payload(capabilities: object) -> dict[str, bool]:
    """Convertit les capacités métier en payload Pydantic."""
    return {
        "can_read": bool(getattr(capabilities, "can_read")),
        "can_edit": bool(getattr(capabilities, "can_edit")),
        "can_delete": bool(getattr(capabilities, "can_delete")),
        "is_owner": bool(getattr(capabilities, "is_owner")),
    }


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
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    sharing_service: Annotated[
        DialogueSharingService,
        Depends(get_dialogue_sharing_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
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
        share_counts = sharing_service.count_shares_by_document_ids(
            [path.stem for path in json_files]
        )
        metadata_list = []
        
        for json_file in json_files:
            try:
                document_id = json_file.stem
                if not persistence_service.can_list(
                    document_id,
                    current_user,
                    json_file,
                ):
                    continue
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
                    title=title,
                    share_count=share_counts.get(document_id, 0),
                    capabilities=_capabilities_payload(
                        persistence_service.capabilities(
                            document_id,
                            current_user,
                            json_file,
                        )
                    ),
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


_SCHEMA_SOURCE = "docs/resources/dialogue-format.schema.json"


@router.get(
    "/schema",
    response_model=UnitySchemaReferenceResponse,
    status_code=status.HTTP_200_OK,
)
async def get_unity_schema_reference(
    request_id: Annotated[str, Depends(get_request_id)],
) -> UnitySchemaReferenceResponse:
    """Retourne les métadonnées du schéma Unity de référence (Story 5.3 / FR51)."""
    schema = load_unity_schema()
    sections = [
        UnitySchemaSectionSummary(
            name="nodes",
            description="Liste des nœuds dialogue (id stable, line, speaker, choices…)",
            required_fields=["id"],
        ),
        UnitySchemaSectionSummary(
            name="choices",
            description="Choix joueur par nœud — choiceId, text, targetNode obligatoires (v1.1+)",
            required_fields=["choiceId", "text", "targetNode"],
        ),
        UnitySchemaSectionSummary(
            name="visibilityConditions",
            description="Conditions structurées d'affichage nœud/choix (Story 9.2)",
            required_fields=["combinator", "items"],
        ),
        UnitySchemaSectionSummary(
            name="dialogueFlags",
            description="Liaisons flags GDD — interdit RepPalier* (runtime FR94)",
            required_fields=["flagId", "type", "initialValue"],
        ),
    ]
    version = str(schema.get("version")) if isinstance(schema, dict) and schema.get("version") else None
    logger.debug("Schéma Unity référence: available=%s version=%s (request_id=%s)", schema_exists(), version, request_id)
    return UnitySchemaReferenceResponse(
        available=schema_exists(),
        version=version,
        source_path=_SCHEMA_SOURCE,
        required_root_fields=["schemaVersion", "nodes"],
        sections=sections,
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
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
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
        document_id = filename[:-5]
        
        # Lire le fichier
        try:
            persisted = persistence_service.read_document(
                unity_dir,
                document_id,
                current_user,
            )
            json_data = persisted.document
            json_content = json.dumps(json_data, ensure_ascii=False, indent=2)
            
            # Valider que c'est du JSON valide ; accepter liste ou document canonique (schemaVersion + nodes)
            try:
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
                modified_time=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                capabilities=_capabilities_payload(persisted.capabilities),
            )
            
        except (DialogueAccessDeniedError, DialogueNotFoundError):
            raise
        except json.JSONDecodeError as e:
            raise ValidationException(
                message=f"Le fichier JSON n'est pas valide: {str(e)}",
                details={"filename": filename, "json_error": str(e)},
                request_id=request_id,
            ) from e
        except (IOError, OSError) as e:
            raise InternalServerException(
                message=f"Erreur lors de la lecture du fichier '{filename}'",
                details={"filename": filename, "error": str(e)},
                request_id=request_id
            )
        
    except DialogueAccessDeniedError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "dialogue_access_denied", "filename": filename},
        )
    except DialogueNotFoundError:
        raise NotFoundException(
            resource_type="Dialogue Unity",
            resource_id=filename,
            request_id=request_id,
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
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
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
        
        document_key = filename[:-5] if filename.endswith(".json") else filename
        layouts_path = config_service.get_unity_layouts_path()
        layout_dir = (
            Path(layouts_path)
            if isinstance(layouts_path, (str, Path)) and str(layouts_path)
            else None
        )
        persistence_service.delete_document(
            unity_dir,
            layout_dir,
            document_key,
            current_user,
        )
        logger.info(
            "Dialogue Unity supprimé: %s (request_id: %s)",
            filename,
            request_id,
        )
    except DialogueAccessDeniedError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "dialogue_access_denied", "filename": filename},
        )
    except DialogueNotFoundError:
        raise NotFoundException(
            resource_type="Dialogue Unity",
            resource_id=filename,
            request_id=request_id,
        )
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





"""Router pour les documents canoniques (GET/PUT par id avec revision).

Story 16.2 : endpoints GET/PUT /documents/{id} ; document = blob persisté ;
revision dans .meta ; pas de reconstruction à partir de nodes/edges.

Note production : le body des PUT (document, layout) n'est pas borné par défaut.
En déploiement, imposer une limite (ex. middleware ou reverse proxy) pour éviter
un DoS par envoi de très gros JSON (layout = objet libre, non validé en taille).
"""
from copy import deepcopy
import json
import logging
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import JSONResponse

from api.dependencies import (
    get_choice_effect_validation_service,
    get_config_service,
    get_dialogue_flag_reference_validation_service,
    get_dialogue_flags_service,
    get_dialogue_preview_service,
    get_document_persistence_service,
    get_request_id,
    get_visibility_condition_validation_service,
)
from api.routers.auth import get_current_user
from api.exceptions import APIException, NotFoundException, ValidationException, InternalServerException
from api.schemas.dialogue_preview import DialoguePreviewRequest, DialoguePreviewResponse
from api.schemas.documents import (
    CheckMigrationResponse,
    DocumentGetResponse,
    DocumentMigrationItem,
    LayoutGetResponse,
    PutDocumentRequest,
    PutDocumentResponse,
    PutLayoutRequest,
    PutLayoutResponse,
    ValidateFlagReferencesRequest,
    ValidateFlagReferencesResponse,
)
from api.schemas.dialogue_access import DialogueCapabilitiesResponse
from services.configuration_service import ConfigurationService
from services.unity_export_validation_service import validate_unity_export_document
from services.dialogue_flags_service import DialogueFlagsService
from services.choice_effect_validation import ChoiceEffectValidationService
from services.visibility_condition_validation import VisibilityConditionValidationService
from services.dialogue_flag_reference_validation_service import (
    DialogueFlagReferenceValidationService,
    analysis_to_validation_api_payload,
)
from services.game_systems_social_diagnostics import validate_document_social_systems
from services.document_persistence_service import (
    DialogueAccessDeniedError,
    DialogueNotFoundError,
    DialogueRevisionConflictError,
    DocumentPersistenceService,
)
from services.document_id_validation import validate_document_id

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])

def _capabilities_response(
    capabilities: Any,
) -> DialogueCapabilitiesResponse:
    """Sérialise les capacités calculées par le service métier."""
    return DialogueCapabilitiesResponse(
        can_read=capabilities.can_read,
        can_edit=capabilities.can_edit,
        can_delete=capabilities.can_delete,
        is_owner=capabilities.is_owner,
    )


def _raise_access_denied(document_id: str) -> None:
    """Traduit un refus métier en réponse HTTP 403 stable."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "dialogue_access_denied",
            "document_id": document_id,
        },
    )


def _safe_document_id(document_id: str) -> str:
    """Valide l'id document (pas de path traversal). Retourne l'id normalisé."""
    return validate_document_id(document_id)


def _read_document_blob(base_dir: Path, document_id: str) -> tuple[dict, bool]:
    """Lit le fichier JSON du document. Lève FileNotFoundError si absent.
    Retourne (document, was_normalized_from_list)."""
    path = base_dir / f"{document_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Document {document_id} non trouvé")
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if isinstance(data, list):
        return {"schemaVersion": "1.1.0", "nodes": data}, True
    return data, False


def _document_exists(base_dir: Path, document_id: str) -> bool:
    """Indique si le document existe (fichier .json présent)."""
    return (base_dir / f"{document_id}.json").exists()


def _first_missing_choice_id_path(document: dict) -> str | None:
    """Retourne le chemin du premier choice sans choiceId, ou None (Story 16.5, refus GET v1.1.0 sans choiceId)."""
    if not isinstance(document, dict):
        return None
    sv = document.get("schemaVersion")
    if sv is None:
        return None
    try:
        sv_str = str(sv).strip() if sv is not None else ""
    except (TypeError, ValueError):
        return None
    if not sv_str:
        return None
    # Exiger choiceId pour schemaVersion >= 1.1.0 (ou "1.1" comme alias)
    if sv_str < "1.1.0" and sv_str != "1.1":
        return None
    nodes = document.get("nodes") or []
    for i, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        choices = node.get("choices") or []
        for j, choice in enumerate(choices):
            if isinstance(choice, dict) and not choice.get("choiceId"):
                return f"nodes.{i}.choices.{j}"
    return None


@router.get(
    "/check-migration",
    response_model=CheckMigrationResponse,
    status_code=status.HTTP_200_OK,
)
async def check_migration(
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> CheckMigrationResponse:
    """Liste les documents v1.1.0 ayant au moins un choice sans choiceId (CI / pre-commit gate)."""
    try:
        unity_path = config_service.get_unity_dialogues_path()
        if not unity_path:
            return CheckMigrationResponse(needsMigration=[])
        base_dir = Path(unity_path)
        if not base_dir.exists():
            return CheckMigrationResponse(needsMigration=[])
        needs: list[DocumentMigrationItem] = []
        for path in base_dir.iterdir():
            if not path.is_file() or path.suffix.lower() != ".json" or path.name.endswith(".layout.json"):
                continue
            document_id = path.stem
            if not persistence_service.can_list(document_id, current_user, path):
                continue
            try:
                doc, _ = _read_document_blob(base_dir, document_id)
            except (FileNotFoundError, json.JSONDecodeError):
                continue
            missing_path = _first_missing_choice_id_path(doc)
            if missing_path is not None:
                needs.append(DocumentMigrationItem(documentId=document_id, path=missing_path))
        logger.info(f"check-migration: {len(needs)} document(s) à migrer (request_id: {request_id})")
        return CheckMigrationResponse(needsMigration=needs)
    except Exception as e:
        logger.exception(f"Erreur check-migration (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la vérification migration choiceId",
            details={"error": str(e)},
            request_id=request_id,
        )


def _resolve_document_base(
    document_id: str,
    config_service: ConfigurationService,
    request_id: str,
) -> tuple[Path, str]:
    """Valide document_id et retourne (base_dir, doc_id). Lève ValidationException si invalide."""
    try:
        doc_id = _safe_document_id(document_id)
    except ValueError:
        raise ValidationException(
            message="Identifiant de document invalide",
            details={"document_id": document_id},
            request_id=request_id,
        )
    if not doc_id:
        raise ValidationException(
            message="document_id requis",
            details={"document_id": document_id},
            request_id=request_id,
        )
    unity_path = config_service.get_unity_dialogues_path()
    if not unity_path:
        raise ValidationException(
            message="Le chemin Unity dialogues n'est pas configuré.",
            details={"field": "unity_dialogues_path"},
            request_id=request_id,
        )
    return Path(unity_path), doc_id


def _resolve_layout_base(
    document_id: str,
    config_service: ConfigurationService,
    request_id: str,
) -> tuple[Path, str]:
    """Valide document_id et retourne (layouts_dir, doc_id). Layouts dans Assets/Layouts."""
    try:
        doc_id = _safe_document_id(document_id)
    except ValueError:
        raise ValidationException(
            message="Identifiant de document invalide",
            details={"document_id": document_id},
            request_id=request_id,
        )
    if not doc_id:
        raise ValidationException(
            message="document_id requis",
            details={"document_id": document_id},
            request_id=request_id,
        )
    layouts_path = config_service.get_unity_layouts_path()
    if not layouts_path:
        raise ValidationException(
            message="Le chemin Unity dialogues n'est pas configuré.",
            details={"field": "unity_dialogues_path"},
            request_id=request_id,
        )
    return Path(layouts_path), doc_id


@router.get(
    "/{document_id}",
    response_model=DocumentGetResponse,
    status_code=status.HTTP_200_OK,
)
async def get_document(
    document_id: str,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> DocumentGetResponse:
    """Retourne le document persisté avec schemaVersion et revision (pas de reconstruction)."""
    try:
        base_dir, doc_id = _resolve_document_base(document_id, config_service, request_id)
        base_dir.mkdir(parents=True, exist_ok=True)

        persisted = persistence_service.read_document(base_dir, doc_id, current_user)
        document = persisted.document
        was_normalized_from_list = persisted.was_legacy_list
        revision = persisted.revision
        schema_version = (document.get("schemaVersion") or "1.1.0") if isinstance(document, dict) else "1.1.0"

        # Story 16.5 (AC3) : refus strict document v1.1.0 sans choiceId en flux normal (sauf format legacy tableau)
        if not was_normalized_from_list:
            missing_path = _first_missing_choice_id_path(document)
            if missing_path is not None:
                raise ValidationException(
                    message="Ce dialogue doit être migré avec l'outil de migration choiceId.",
                    details={"path": missing_path},
                    request_id=request_id,
                    code="missing_choice_id",
                )

        logger.info(f"GET document {doc_id} revision={revision} (request_id: {request_id})")
        return DocumentGetResponse(
            document=document,
            schemaVersion=schema_version,
            revision=revision,
            capabilities=_capabilities_response(persisted.capabilities),
        )
    except DialogueAccessDeniedError:
        _raise_access_denied(document_id)
    except (FileNotFoundError, DialogueNotFoundError):
        raise NotFoundException(
            resource_type="Document",
            resource_id=document_id,
            request_id=request_id,
        )
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.exception(f"Erreur GET document {document_id} (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la lecture du document",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/{document_id}/preview",
    response_model=DialoguePreviewResponse,
    status_code=status.HTTP_200_OK,
)
async def post_document_preview(
    document_id: str,
    body: DialoguePreviewRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)],
    preview_service: Annotated[Any, Depends(get_dialogue_preview_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
) -> DialoguePreviewResponse:
    """Évalue la visibilité nœuds/choix pour un état simulé (Story 9.4).

    409 si ``revision`` dans le corps ne correspond pas à la révision persistée.
    """
    try:
        base_dir, doc_id = _resolve_document_base(document_id, config_service, request_id)
        persisted = persistence_service.read_document(base_dir, doc_id, current_user)
        document = persisted.document
        revision = persisted.revision
        try:
            return preview_service.preview_document(document, body, stored_revision=revision)
        except ValueError as exc:
            if str(exc) == "revision_stale":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "revision_stale",
                        "expected_revision": revision,
                        "request_id": request_id,
                    },
                ) from exc
            raise
    except DialogueAccessDeniedError:
        _raise_access_denied(document_id)
    except (FileNotFoundError, DialogueNotFoundError):
        raise NotFoundException(
            resource_type="Document",
            resource_id=document_id,
            request_id=request_id,
        )
    except (ValidationException, NotFoundException, HTTPException):
        raise
    except Exception as e:
        logger.exception(f"Erreur POST preview document {document_id} (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors du preview document",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/{document_id}/validate-flag-references",
    response_model=ValidateFlagReferencesResponse,
    status_code=status.HTTP_200_OK,
)
async def post_validate_flag_references(
    document_id: str,
    body: ValidateFlagReferencesRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    flag_ref_svc: Annotated[
        DialogueFlagReferenceValidationService,
        Depends(get_dialogue_flag_reference_validation_service),
    ],
    request_id: Annotated[str, Depends(get_request_id)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
) -> ValidateFlagReferencesResponse:
    """Valide les références flags vs ``dialogueFlags`` (Story 9.5 / FR93).

    Corps optionnel : si ``document`` est absent, lecture du fichier persisté.
    """
    try:
        base_dir, doc_id = _resolve_document_base(document_id, config_service, request_id)
        if body.document is not None:
            payload = body.document
        else:
            payload = persistence_service.read_document(
                base_dir,
                doc_id,
                current_user,
            ).document

        analysis = flag_ref_svc.analyze_document(payload)
        err_details, warn_details = analysis_to_validation_api_payload(analysis)
        return ValidateFlagReferencesResponse(
            valid=len(err_details) == 0,
            summary=analysis.summary,
            used_flag_count=analysis.used_flag_count,
            errors=err_details,
            warnings=warn_details,
        )
    except DialogueAccessDeniedError:
        _raise_access_denied(document_id)
    except (FileNotFoundError, DialogueNotFoundError):
        raise NotFoundException(
            resource_type="Document",
            resource_id=document_id,
            request_id=request_id,
        )
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.exception(
            "Erreur POST validate-flag-references %s (request_id: %s)",
            document_id,
            request_id,
        )
        raise InternalServerException(
            message="Erreur lors de la validation des références flags",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.get(
    "/{document_id}/layout",
    response_model=LayoutGetResponse,
    status_code=status.HTTP_200_OK,
)
async def get_layout(
    document_id: str,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> LayoutGetResponse:
    """Retourne le layout persisté (sidecar) avec revision. 404 si document ou layout absent.
    Les layouts sont lus depuis Assets/Layouts (séparé de Assets/Dialogue).
    """
    try:
        doc_base_dir, doc_id = _resolve_document_base(document_id, config_service, request_id)
        if not _document_exists(doc_base_dir, doc_id):
            raise NotFoundException(
                resource_type="Document",
                resource_id=document_id,
                request_id=request_id,
            )
        layout_base_dir, _ = _resolve_layout_base(document_id, config_service, request_id)
        persisted = persistence_service.read_layout(
            doc_base_dir,
            layout_base_dir,
            doc_id,
            current_user,
        )
        layout = persisted.layout
        revision = persisted.revision

        logger.info(f"GET layout {doc_id} revision={revision} (request_id: {request_id})")
        return LayoutGetResponse(layout=layout, revision=revision)
    except DialogueAccessDeniedError:
        _raise_access_denied(document_id)
    except (FileNotFoundError, DialogueNotFoundError):
        raise NotFoundException(
            resource_type="Layout",
            resource_id=document_id,
            request_id=request_id,
        )
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.exception(f"Erreur GET layout {document_id} (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la lecture du layout",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.put(
    "/{document_id}/layout",
    status_code=status.HTTP_200_OK,
    response_model=PutLayoutResponse,
    responses={
        409: {
            "description": "Conflit de révision (revision obsolète). Corps : layout actuel + revision.",
            "model": LayoutGetResponse,
        },
    },
)
async def put_layout(
    document_id: str,
    body: PutLayoutRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> PutLayoutResponse | JSONResponse:
    """Persiste le layout ; revision optimiste ; 409 si conflit (AC1).
    Les layouts sont écrits dans Assets/Layouts (séparé de Assets/Dialogue).

    En production, imposer une limite de taille sur le body (reverse proxy ou
    middleware) pour éviter un DoS par envoi d'un très gros JSON (layout non borné).
    """
    try:
        doc_base_dir, doc_id = _resolve_document_base(document_id, config_service, request_id)
        if not _document_exists(doc_base_dir, doc_id):
            raise NotFoundException(
                resource_type="Document",
                resource_id=document_id,
                request_id=request_id,
            )
        layout_base_dir, _ = _resolve_layout_base(document_id, config_service, request_id)
        new_revision = persistence_service.write_layout(
            doc_base_dir,
            layout_base_dir,
            doc_id,
            body.layout,
            body.revision,
            current_user,
        )

        logger.info(
            f"PUT layout {doc_id} revision={new_revision} (request_id: {request_id})"
        )
        return PutLayoutResponse(revision=new_revision)
    except DialogueRevisionConflictError as exc:
        payload = LayoutGetResponse(layout=exc.payload, revision=exc.revision)
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=payload.model_dump(),
        )
    except DialogueAccessDeniedError:
        _raise_access_denied(document_id)
    except DialogueNotFoundError:
        raise NotFoundException(
            resource_type="Document",
            resource_id=document_id,
            request_id=request_id,
        )
    except (APIException, ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.exception(
            f"Erreur PUT layout {document_id} (request_id: {request_id})"
        )
        raise InternalServerException(
            message="Erreur lors de l'écriture du layout",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.put(
    "/{document_id}",
    status_code=status.HTTP_200_OK,
    response_model=PutDocumentResponse,
    responses={
        409: {
            "description": "Conflit de révision (révision obsolète ou création avec revision != 1).",
            "model": DocumentGetResponse,
        },
    },
)
async def put_document(
    document_id: str,
    body: PutDocumentRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    dialogue_flags_service: Annotated[DialogueFlagsService, Depends(get_dialogue_flags_service)],
    visibility_condition_validation_service: Annotated[
        VisibilityConditionValidationService,
        Depends(get_visibility_condition_validation_service),
    ],
    choice_effect_validation_service: Annotated[
        ChoiceEffectValidationService,
        Depends(get_choice_effect_validation_service),
    ],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
    x_validation_mode: Annotated[str | None, Header(alias="X-Validation-Mode")] = None,
) -> PutDocumentResponse | JSONResponse:
    """Valide et persiste le document ; revision optimiste ; 409 si conflit ; draft vs export (AC4)."""
    try:
        base_dir, doc_id = _resolve_document_base(document_id, config_service, request_id)
        base_dir.mkdir(parents=True, exist_ok=True)

        doc = deepcopy(body.document) if isinstance(body.document, dict) else body.document
        # AC3 : refuser payload type nodes/edges (ancien contrat graphe)
        if isinstance(doc, dict):
            has_nodes = "nodes" in doc
            has_edges = "edges" in doc
            has_schema_version = "schemaVersion" in doc
            if has_nodes and has_edges and not has_schema_version:
                raise APIException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code="GRAPH_PAYLOAD_NOT_ACCEPTED",
                    message="Seul le document canonique est accepté (schemaVersion, nodes). Payload nodes/edges non accepté.",
                    details={"code": "graph_payload_not_accepted"},
                    request_id=request_id,
                )

        # Mode validation : header X-Validation-Mode override body.validationMode
        validation_mode = (x_validation_mode or body.validationMode or "draft").strip().lower()
        if validation_mode not in ("draft", "export"):
            validation_mode = "draft"

        flag_warnings: list[str] = []
        if isinstance(doc, dict) and "dialogueFlags" in doc:
            try:
                normalized_flags, flag_warnings = dialogue_flags_service.normalize_and_warnings(
                    doc.get("dialogueFlags")
                )
                doc["dialogueFlags"] = normalized_flags
            except ValueError as exc:
                raise ValidationException(
                    message=str(exc),
                    details={"field": "dialogueFlags"},
                    request_id=request_id,
                )

        if isinstance(doc, dict):
            try:
                visibility_condition_validation_service.validate_document(doc)
            except ValueError as exc:
                raise ValidationException(
                    message=str(exc),
                    details={"field": "visibilityConditions"},
                    request_id=request_id,
                )

        if isinstance(doc, dict):
            try:
                choice_effect_validation_service.validate_document(doc)
            except ValueError as exc:
                raise ValidationException(
                    message=str(exc),
                    details={"field": "choiceEffects"},
                    request_id=request_id,
                )

        # Validation export unifiée (normalise choiceId, flags, targetNode, puis schéma + GDD)
        export_validation = validate_unity_export_document(doc)
        is_valid = export_validation.is_valid
        errors_structured = export_validation.errors_structured
        validation_report = [
            {
                "code": e.get("code", "validation_error"),
                "message": e.get("message", ""),
                "path": e.get("path", ""),
            }
            for e in errors_structured
        ]
        if isinstance(doc, dict):
            validation_report.extend(validate_document_social_systems(doc))

        # AC4 export : si validation échoue, refuser persistance et retourner 400 + validationReport
        if validation_mode == "export" and not is_valid:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"validationReport": validation_report, "message": "Validation export échouée"},
            )

        # Story 16.5 AC3 : refus en draft pour document v1.1.0 sans choiceId (non contournable, ADR-008)
        has_missing_choice_id = any(e.get("code") == "missing_choice_id" for e in errors_structured)
        doc_sv = doc.get("schemaVersion") if isinstance(doc, dict) else None
        doc_sv_str = (str(doc_sv).strip() if doc_sv is not None else "") or ""
        refuse_draft_v1_1_0 = (
            not is_valid
            and has_missing_choice_id
            and (doc_sv_str >= "1.1.0" or doc_sv_str == "1.1")
        )
        if validation_mode == "draft" and refuse_draft_v1_1_0:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "validationReport": validation_report,
                    "message": "Ce dialogue doit être migré avec l'outil de migration choiceId (document v1.1.0 sans choiceId non accepté en draft).",
                },
            )

        # Persistance : fichier puis index, avec compensation en cas d'échec SQLite.
        new_revision = persistence_service.write_document(
            base_dir,
            doc_id,
            doc,
            body.revision,
            current_user,
            create_only=body.createOnly,
        )

        logger.info(f"PUT document {doc_id} revision={new_revision} mode={validation_mode} (request_id: {request_id})")
        return PutDocumentResponse(
            revision=new_revision,
            validationReport=validation_report,
            flagThresholdWarnings=flag_warnings,
        )
    except DialogueRevisionConflictError as exc:
        schema_ver = str(exc.payload.get("schemaVersion") or "1.1.0")
        payload = DocumentGetResponse(
            document=exc.payload,
            schemaVersion=schema_ver,
            revision=exc.revision,
            capabilities=_capabilities_response(
                persistence_service.capabilities(
                    doc_id,
                    current_user,
                    base_dir / f"{doc_id}.json",
                )
            ),
        )
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=payload.model_dump(),
        )
    except DialogueAccessDeniedError:
        _raise_access_denied(document_id)
    except (APIException, ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.exception(f"Erreur PUT document {document_id} (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de l'écriture du document",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_document(
    document_id: str,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    persistence_service: Annotated[
        DocumentPersistenceService,
        Depends(get_document_persistence_service),
    ],
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    request_id: Annotated[str, Depends(get_request_id)],
) -> None:
    """Supprime le document, ses sidecars et son index après autorisation."""
    try:
        base_dir, resolved_id = _resolve_document_base(document_id, config_service, request_id)
        configured_layout_path = config_service.get_unity_layouts_path()
        layout_base_dir = (
            Path(configured_layout_path)
            if configured_layout_path
            else None
        )
        persistence_service.delete_document(
            base_dir,
            layout_base_dir,
            resolved_id,
            current_user,
        )
        logger.info(
            "DELETE document %s (request_id: %s)",
            resolved_id,
            request_id,
        )
    except DialogueAccessDeniedError:
        _raise_access_denied(document_id)
    except DialogueNotFoundError:
        raise NotFoundException(
            resource_type="Document",
            resource_id=document_id,
            request_id=request_id,
        )
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.exception(f"Erreur DELETE document {document_id} (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la suppression du document",
            details={"error": str(e)},
            request_id=request_id,
        )

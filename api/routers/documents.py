"""Router pour les documents canoniques (GET/PUT par id avec revision).

Story 16.2 : endpoints GET/PUT /documents/{id} ; document = blob persisté ;
revision dans .meta ; pas de reconstruction à partir de nodes/edges.

Note production : le body des PUT (document, layout) n'est pas borné par défaut.
En déploiement, imposer une limite (ex. middleware ou reverse proxy) pour éviter
un DoS par envoi de très gros JSON (layout = objet libre, non validé en taille).
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Header, status
from fastapi.responses import JSONResponse

from api.dependencies import get_config_service, get_request_id
from api.exceptions import APIException, NotFoundException, ValidationException, InternalServerException
from api.schemas.documents import (
    CheckMigrationResponse,
    DocumentGetResponse,
    DocumentMigrationItem,
    LayoutGetResponse,
    PutDocumentRequest,
    PutDocumentResponse,
    PutLayoutRequest,
    PutLayoutResponse,
)
from api.utils.unity_schema_validator import validate_unity_json_structured
from services.configuration_service import ConfigurationService

logger = logging.getLogger(__name__)

router = APIRouter()

META_FILENAME_SUFFIX = ".meta"
LAYOUT_META_SUFFIX = ".layout.meta"


def _safe_document_id(document_id: str) -> str:
    """Valide l'id document (pas de path traversal). Retourne l'id normalisé."""
    if ".." in document_id or "/" in document_id or "\\" in document_id:
        raise ValueError("document_id invalide (path traversal)")
    return document_id.strip() or ""


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


def _read_meta(base_dir: Path, document_id: str) -> int:
    """Lit la revision depuis {id}.meta. Retourne 1 si pas de .meta."""
    meta_path = base_dir / f"{document_id}{META_FILENAME_SUFFIX}"
    if not meta_path.exists():
        return 1
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        return int(data.get("revision", 1))
    except (json.JSONDecodeError, TypeError, ValueError):
        return 1


def _write_document_blob(base_dir: Path, document_id: str, document: dict) -> None:
    """Écrit le document JSON. Crée le dossier si besoin."""
    base_dir.mkdir(parents=True, exist_ok=True)
    path = base_dir / f"{document_id}.json"
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_meta(base_dir: Path, document_id: str, revision: int) -> None:
    """Écrit {id}.meta avec revision et updated_at."""
    meta_path = base_dir / f"{document_id}{META_FILENAME_SUFFIX}"
    meta_path.write_text(
        json.dumps(
            {"revision": revision, "updated_at": datetime.now(timezone.utc).isoformat()},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _document_exists(base_dir: Path, document_id: str) -> bool:
    """Indique si le document existe (fichier .json présent)."""
    return (base_dir / f"{document_id}.json").exists()


def _read_layout_meta(base_dir: Path, document_id: str) -> int:
    """Lit la revision depuis {id}.layout.meta. Retourne 1 si pas de .layout.meta."""
    meta_path = base_dir / f"{document_id}{LAYOUT_META_SUFFIX}"
    if not meta_path.exists():
        return 1
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        return int(data.get("revision", 1))
    except (json.JSONDecodeError, TypeError, ValueError):
        return 1


def _read_layout_blob(base_dir: Path, document_id: str) -> dict:
    """Lit le fichier JSON du layout. Lève FileNotFoundError si absent."""
    path = base_dir / f"{document_id}.layout.json"
    if not path.exists():
        raise FileNotFoundError(f"Layout {document_id} non trouvé")
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw)


def _write_layout_blob(base_dir: Path, document_id: str, layout: dict) -> None:
    """Écrit le layout JSON. Crée le dossier si besoin."""
    base_dir.mkdir(parents=True, exist_ok=True)
    path = base_dir / f"{document_id}.layout.json"
    path.write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_layout_meta(base_dir: Path, document_id: str, revision: int) -> None:
    """Écrit {id}.layout.meta avec revision et updated_at."""
    meta_path = base_dir / f"{document_id}{LAYOUT_META_SUFFIX}"
    meta_path.write_text(
        json.dumps(
            {"revision": revision, "updated_at": datetime.now(timezone.utc).isoformat()},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _layout_exists(base_dir: Path, document_id: str) -> bool:
    """Indique si le layout existe (fichier .layout.json présent)."""
    return (base_dir / f"{document_id}.layout.json").exists()


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
    request_id: Annotated[str, Depends(get_request_id)],
) -> DocumentGetResponse:
    """Retourne le document persisté avec schemaVersion et revision (pas de reconstruction)."""
    try:
        base_dir, doc_id = _resolve_document_base(document_id, config_service, request_id)
        base_dir.mkdir(parents=True, exist_ok=True)

        document, was_normalized_from_list = _read_document_blob(base_dir, doc_id)
        revision = _read_meta(base_dir, doc_id)
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
        )
    except FileNotFoundError:
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


@router.get(
    "/{document_id}/layout",
    response_model=LayoutGetResponse,
    status_code=status.HTTP_200_OK,
)
async def get_layout(
    document_id: str,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
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
        layout = _read_layout_blob(layout_base_dir, doc_id)
        revision = _read_layout_meta(layout_base_dir, doc_id)

        logger.info(f"GET layout {doc_id} revision={revision} (request_id: {request_id})")
        return LayoutGetResponse(layout=layout, revision=revision)
    except FileNotFoundError:
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
        layout_base_dir.mkdir(parents=True, exist_ok=True)

        client_revision = body.revision
        if _layout_exists(layout_base_dir, doc_id):
            current_revision = _read_layout_meta(layout_base_dir, doc_id)
            if client_revision != current_revision:
                current_layout = _read_layout_blob(layout_base_dir, doc_id)
                payload = LayoutGetResponse(
                    layout=current_layout,
                    revision=current_revision,
                )
                return JSONResponse(
                    status_code=status.HTTP_409_CONFLICT,
                    content=payload.model_dump(),
                )
            new_revision = current_revision + 1
        else:
            if client_revision != 1:
                current_layout = {}
                current_revision = 1
                payload = LayoutGetResponse(
                    layout=current_layout,
                    revision=current_revision,
                )
                return JSONResponse(
                    status_code=status.HTTP_409_CONFLICT,
                    content=payload.model_dump(),
                )
            new_revision = 1

        _write_layout_blob(layout_base_dir, doc_id, body.layout)
        _write_layout_meta(layout_base_dir, doc_id, new_revision)

        logger.info(
            f"PUT layout {doc_id} revision={new_revision} (request_id: {request_id})"
        )
        return PutLayoutResponse(revision=new_revision)
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
)
async def put_document(
    document_id: str,
    body: PutDocumentRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)],
    x_validation_mode: Annotated[str | None, Header(alias="X-Validation-Mode")] = None,
) -> PutDocumentResponse | JSONResponse:
    """Valide et persiste le document ; revision optimiste ; 409 si conflit ; draft vs export (AC4)."""
    try:
        base_dir, doc_id = _resolve_document_base(document_id, config_service, request_id)
        base_dir.mkdir(parents=True, exist_ok=True)

        doc = body.document
        client_revision = body.revision

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

        # Révision optimiste : si document existe, comparer revision
        if _document_exists(base_dir, doc_id):
            current_revision = _read_meta(base_dir, doc_id)
            if client_revision != current_revision:
                current_doc, _ = _read_document_blob(base_dir, doc_id)
                schema_ver = (current_doc.get("schemaVersion") or "1.1.0") if isinstance(current_doc, dict) else "1.1.0"
                payload = DocumentGetResponse(
                    document=current_doc,
                    schemaVersion=schema_ver,
                    revision=current_revision,
                )
                return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=payload.model_dump())
            new_revision = current_revision + 1
        else:
            new_revision = 1

        # Mode validation : header X-Validation-Mode override body.validationMode
        validation_mode = (x_validation_mode or body.validationMode or "draft").strip().lower()
        if validation_mode not in ("draft", "export"):
            validation_mode = "draft"

        # Validation (validate_unity_json_structured sans modifier choiceId, ordre choices[], node.id)
        is_valid, errors_structured = validate_unity_json_structured(doc)
        validation_report = [{"code": e.get("code", "validation_error"), "message": e.get("message", ""), "path": e.get("path", "")} for e in errors_structured]

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

        # Persistance : ne pas modifier choiceId, ordre choices[], node.id (document tel quel)
        _write_document_blob(base_dir, doc_id, doc)
        _write_meta(base_dir, doc_id, new_revision)

        logger.info(f"PUT document {doc_id} revision={new_revision} mode={validation_mode} (request_id: {request_id})")
        return PutDocumentResponse(revision=new_revision, validationReport=validation_report)
    except (APIException, ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.exception(f"Erreur PUT document {document_id} (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de l'écriture du document",
            details={"error": str(e)},
            request_id=request_id,
        )

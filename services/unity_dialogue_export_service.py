"""Service partagé pour valider et écrire un dialogue Unity JSON sur disque.

SOLID:
- SRP: Une seule responsabilité — valider (schéma Unity) et persister le JSON
  dans le répertoire configuré. Pas de conversion graphe/Unity (faite par l'appelant).
- DIP: ConfigurationService et validator sont injectés (pas d'instanciation du chemin
  ni du validateur concret dans la logique métier). Par défaut validate_unity_json (Story 5.1).

ADR-006: Écriture atomique (tmp → fsync → rename) et persistance last_seq par document (sidecar).
"""
import json
import logging
import os
import re
from pathlib import Path
from typing import Callable, List, Optional, Tuple, Any, Dict

from services.configuration_service import ConfigurationService
from api.exceptions import ValidationException
from services.unity_dialogue_download_service import safe_export_filename
from services.unity_export_normalizer import normalize_unity_export_document
from services.unity_export_validation_service import (
    unity_export_schema_validator,
    validate_unity_export_document,
)

logger = logging.getLogger(__name__)

# Nom du fichier sidecar pour last_seq (ADR-006): {stem}.seq à côté du .json
SEQ_SUFFIX = ".seq"


def _resolve_export_basename(
    filename: Optional[str],
    title: Optional[str],
    request_id: Optional[str],
) -> str:
    """Dérive un nom de fichier export sûr (basename, sans path traversal).

    Args:
        filename: Nom fourni par le client (optionnel).
        title: Titre pour génération slug si filename absent.
        request_id: ID requête pour ValidationException.

    Returns:
        Nom de fichier se terminant par ``.json``.

    Raises:
        ValidationException: Si le nom client est invalide.
    """
    if filename:
        try:
            return safe_export_filename(filename)
        except ValueError as exc:
            raise ValidationException(
                message="Nom de fichier export invalide",
                details={"filename": str(exc)},
                request_id=request_id,
            ) from exc
    if title:
        slug = re.sub(r"[^\w\s-]", "", title.lower())
        slug = re.sub(r"[-\s]+", "_", slug)[:100] or "dialogue"
        return f"{slug}.json"
    return "dialogue.json"


def _resolve_export_path(
    unity_dir: Path,
    basename: str,
    request_id: Optional[str],
) -> Path:
    """Résout le chemin d'écriture et vérifie qu'il reste sous ``unity_dir``.

    Args:
        unity_dir: Répertoire Unity configuré.
        basename: Nom de fichier (basename sûr).
        request_id: ID requête pour ValidationException.

    Returns:
        Chemin absolu résolu du fichier cible.

    Raises:
        ValidationException: Si le chemin résolu sort du répertoire Unity.
    """
    file_path = (unity_dir / basename).resolve()
    try:
        file_path.relative_to(unity_dir.resolve())
    except ValueError as exc:
        raise ValidationException(
            message="Nom de fichier export invalide",
            details={"filename": "Chemin hors du répertoire Unity configuré"},
            request_id=request_id,
        ) from exc
    return file_path


def _document_key_from_filename(name: str) -> str:
    """Retourne la clé document pour le sidecar last_seq (sans .json)."""
    if name.endswith(".json"):
        return name[:-5]  # stem
    return name


def read_last_seq(unity_dir: Path, document_key: str) -> int:
    """Lit le last_seq persisté pour un document (ADR-006).

    Args:
        unity_dir: Répertoire Unity dialogues.
        document_key: Clé document (stem du fichier, ex. "my_dialogue").

    Returns:
        Dernier seq connu, ou 0 si aucun sidecar.
    """
    sidecar = unity_dir / (document_key + SEQ_SUFFIX)
    if not sidecar.is_file():
        return 0
    try:
        raw = sidecar.read_text(encoding="utf-8").strip()
        return int(raw) if raw else 0
    except (ValueError, OSError) as e:
        logger.warning("Lecture last_seq ignorée pour %s: %s", document_key, e)
        return 0


def write_last_seq(unity_dir: Path, document_key: str, seq: int) -> None:
    """Persiste last_seq pour un document (ADR-006).

    Args:
        unity_dir: Répertoire Unity dialogues.
        document_key: Clé document (stem du fichier).
        seq: Valeur à écrire.
    """
    sidecar = unity_dir / (document_key + SEQ_SUFFIX)
    try:
        sidecar.write_text(str(seq), encoding="utf-8")
    except OSError as e:
        logger.warning("Écriture last_seq ignorée pour %s: %s", document_key, e)


def write_unity_dialogue_to_file(
    config_service: ConfigurationService,
    json_content: str,
    filename: Optional[str] = None,
    title: Optional[str] = None,
    request_id: Optional[str] = None,
    validator: Optional[Callable[[Dict[str, Any]], Tuple[bool, List[str]]]] = None,
    last_seq_after_write: Optional[int] = None,
    preserve_source_fields: bool = False,
) -> Tuple[Path, str]:
    """Valide le JSON Unity et l'écrit dans le répertoire configuré (écriture atomique ADR-006).
    Accepte tableau de nœuds ou document { schemaVersion, nodes }.

    Par défaut, écrit le format canonique ``{ schemaVersion, nodes }``. Avec
    ``preserve_source_fields=True``, réécrit le document source tel quel (batch export
    de documents persistés — conserve ``title``, ``dialogueFlags``, etc.).

    Args:
        config_service: Service de configuration (chemin Unity).
        json_content: Contenu JSON Unity (tableau de nœuds ou document canonique).
        filename: Nom de fichier optionnel (sans ou avec .json).
        title: Titre utilisé pour générer le nom de fichier si filename absent.
        request_id: ID de requête pour les exceptions.
        validator: Callable (document) -> (is_valid, errors). Par défaut pipeline export FR51.
        last_seq_after_write: Si fourni, persiste ce seq dans le sidecar après écriture (ADR-006).
        preserve_source_fields: Conserver les champs hors ``nodes`` du document source.

    Returns:
        Tuple (chemin absolu du fichier écrit, nom du fichier).

    Raises:
        ValidationException: Si le chemin Unity n'est pas configuré, ou si le JSON
            est invalide / non conforme au schéma Unity.
    """
    unity_path = config_service.get_unity_dialogues_path()
    if not unity_path:
        raise ValidationException(
            message="Le chemin Unity dialogues n'est pas configuré. Configurez-le dans les paramètres.",
            details={"field": "unity_dialogues_path"},
            request_id=request_id,
        )

    unity_dir = Path(unity_path)
    unity_dir.mkdir(parents=True, exist_ok=True)

    try:
        json_data = json.loads(json_content)
    except json.JSONDecodeError as e:
        raise ValidationException(
            message="Le JSON fourni n'est pas valide",
            details={"json_content": f"Erreur JSON: {str(e)}"},
            request_id=request_id,
        )

    # Accepter document canonique (schemaVersion + nodes) ou tableau legacy ; toujours écrire en canonique
    if isinstance(json_data, list):
        nodes = json_data
        document = {"schemaVersion": "1.1.0", "nodes": nodes}
    elif isinstance(json_data, dict) and "nodes" in json_data:
        nodes = json_data["nodes"]
        if not isinstance(nodes, list):
            raise ValidationException(
                message="Le document doit contenir un tableau 'nodes'",
                details={"json_content": "nodes doit être un tableau []"},
                request_id=request_id,
            )
        if preserve_source_fields:
            document = json_data
        else:
            document = {"schemaVersion": json_data.get("schemaVersion", "1.1.0"), "nodes": nodes}
    else:
        raise ValidationException(
            message="Le JSON Unity doit être un tableau de nœuds ou un document (schemaVersion, nodes)",
            details={"json_content": "Format attendu: [] ou { \"schemaVersion\": \"1.1.0\", \"nodes\": [...] }"},
            request_id=request_id,
        )

    document = normalize_unity_export_document(document, in_place=True)

    structured_errors: List[Dict[str, Any]] = []
    if validator is None:
        export_result = validate_unity_export_document(document)
        is_valid = export_result.is_valid
        validation_errors = export_result.errors
        structured_errors = export_result.errors_structured
    else:
        is_valid, validation_errors = validator(document)
    if not is_valid:
        raise ValidationException(
            message="Le dialogue Unity contient des erreurs de validation",
            details={
                "validation_errors": validation_errors,
                "structured_errors": structured_errors,
                "json_content": "Le JSON ne respecte pas le schéma Unity (IDs uniques, références valides, etc.)",
            },
            request_id=request_id,
        )

    name = _resolve_export_basename(filename, title, request_id)
    file_path = _resolve_export_path(unity_dir, name, request_id)
    formatted = json.dumps(document, indent=2, ensure_ascii=False)

    # ADR-006: Écriture atomique (tmp → fsync → rename) pour éviter fichier tronqué
    tmp_path = file_path.with_suffix(file_path.suffix + ".tmp")
    tmp_path.write_text(formatted, encoding="utf-8")
    try:
        with open(tmp_path, "r+b") as f:
            os.fsync(f.fileno())
    except OSError as e:
        logger.warning("Fsync ignoré sur %s: %s", tmp_path, e)
    tmp_path.replace(file_path)

    if last_seq_after_write is not None:
        doc_key = _document_key_from_filename(name)
        write_last_seq(unity_dir, doc_key, last_seq_after_write)

    logger.info("Dialogue Unity exporté: %s", file_path)
    return file_path, name

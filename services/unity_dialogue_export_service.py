"""Service partagé pour valider et écrire un dialogue Unity JSON sur disque.

SOLID:
- SRP: Une seule responsabilité — valider (schéma Unity) et persister le JSON
  dans le répertoire configuré. Pas de conversion graphe/Unity (faite par l'appelant).
- DIP: ConfigurationService et validator sont injectés (pas d'instanciation du chemin
  ni du validateur concret dans la logique métier). Par défaut validator=UnityJsonRenderer.

ADR-006: Écriture atomique (tmp → fsync → rename) et persistance last_seq par document (sidecar).
"""
import json
import logging
import os
import re
from pathlib import Path
from typing import Callable, List, Optional, Tuple, Any, Dict

from services.configuration_service import ConfigurationService
from services.json_renderer.unity_json_renderer import UnityJsonRenderer
from api.exceptions import ValidationException

logger = logging.getLogger(__name__)

# Nom du fichier sidecar pour last_seq (ADR-006): {stem}.seq à côté du .json
SEQ_SUFFIX = ".seq"


def _default_validator(nodes: List[Dict[str, Any]]) -> Tuple[bool, List[str]]:
    """Validateur par défaut (UnityJsonRenderer). Permet DIP : le service dépend d'un callable."""
    return UnityJsonRenderer().validate_nodes(nodes)


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
    validator: Optional[Callable[[List[Dict[str, Any]]], Tuple[bool, List[str]]]] = None,
    last_seq_after_write: Optional[int] = None,
) -> Tuple[Path, str]:
    """Valide le JSON Unity et l'écrit dans le répertoire configuré (écriture atomique ADR-006).

    Args:
        config_service: Service de configuration (chemin Unity).
        json_content: Contenu JSON Unity (tableau de nœuds).
        filename: Nom de fichier optionnel (sans ou avec .json).
        title: Titre utilisé pour générer le nom de fichier si filename absent.
        request_id: ID de requête pour les exceptions.
        validator: Callable (nodes) -> (is_valid, errors). Par défaut UnityJsonRenderer.
        last_seq_after_write: Si fourni, persiste ce seq dans le sidecar après écriture (ADR-006).

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

    if not isinstance(json_data, list):
        raise ValidationException(
            message="Le JSON Unity doit être un tableau de nœuds",
            details={"json_content": "Doit être un tableau []"},
            request_id=request_id,
        )

    validate_fn = validator or _default_validator
    is_valid, validation_errors = validate_fn(json_data)
    if not is_valid:
        raise ValidationException(
            message="Le dialogue Unity contient des erreurs de validation",
            details={
                "validation_errors": validation_errors,
                "json_content": "Le JSON ne respecte pas le schéma Unity (IDs uniques, références valides, etc.)",
            },
            request_id=request_id,
        )

    if filename:
        name = filename
    elif title:
        slug = re.sub(r"[^\w\s-]", "", title.lower())
        slug = re.sub(r"[-\s]+", "_", slug)
        name = slug[:100]
    else:
        name = "dialogue"

    if not name.endswith(".json"):
        name += ".json"

    file_path = unity_dir / name
    formatted = json.dumps(json_data, indent=2, ensure_ascii=False)

    # ADR-006: Écriture atomique (tmp → fsync → rename) pour éviter fichier tronqué
    tmp_path = unity_dir / (name + ".tmp")
    tmp_path.write_text(formatted, encoding="utf-8")
    try:
        with open(tmp_path, "rb") as f:
            os.fsync(f.fileno())
    except OSError as e:
        logger.warning("Fsync ignoré sur %s: %s", tmp_path, e)
    tmp_path.replace(file_path)

    if last_seq_after_write is not None:
        doc_key = _document_key_from_filename(name)
        write_last_seq(unity_dir, doc_key, last_seq_after_write)

    logger.info("Dialogue Unity exporté: %s", file_path)
    return file_path, name

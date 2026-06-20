"""Lecture sécurisée de documents Unity persistés sur disque (Story 5.2 / 5.3)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from api.exceptions import ValidationException
from services.configuration_service import ConfigurationService

LEGACY_LIST_SCHEMA_VERSION = "1.2.0"


def safe_document_id(document_id: str) -> str:
    """Valide l'identifiant document (pas de path traversal).

    Args:
        document_id: Identifiant sans extension ``.json``.

    Returns:
        Identifiant nettoyé.

    Raises:
        ValueError: Si l'identifiant est vide ou contient des séquences interdites.
    """
    if ".." in document_id or "/" in document_id or "\\" in document_id:
        raise ValueError("document_id invalide (path traversal)")
    doc_id = document_id.strip()
    if not doc_id:
        raise ValueError("document_id requis")
    return doc_id


def resolve_unity_dir(
    config_service: ConfigurationService,
    request_id: Optional[str] = None,
) -> Path:
    """Retourne le répertoire Unity dialogues ou lève ValidationException.

    Args:
        config_service: Service de configuration.
        request_id: ID requête pour les exceptions.

    Returns:
        Chemin du répertoire Unity dialogues.

    Raises:
        ValidationException: Si le chemin Unity n'est pas configuré.
    """
    unity_path = config_service.get_unity_dialogues_path()
    if not unity_path:
        raise ValidationException(
            message="Le chemin Unity dialogues n'est pas configuré.",
            details={"field": "unity_dialogues_path"},
            request_id=request_id,
        )
    return Path(unity_path)


def read_document_blob(base_dir: Path, document_id: str) -> dict:
    """Lit le fichier JSON document. Lève FileNotFoundError si absent.

    Args:
        base_dir: Répertoire contenant les fichiers ``{document_id}.json``.
        document_id: Identifiant sans extension.

    Returns:
        Document canonique ou liste legacy normalisée en dict.

    Raises:
        FileNotFoundError: Document absent.
        json.JSONDecodeError: JSON invalide.
    """
    path = base_dir / f"{document_id}.json"
    if not path.is_file():
        raise FileNotFoundError(f"Document {document_id} non trouvé")
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if isinstance(data, list):
        return {"schemaVersion": LEGACY_LIST_SCHEMA_VERSION, "nodes": data}
    return data

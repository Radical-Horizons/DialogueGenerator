"""Service téléchargement dialogues Unity exportés (Story 5.4 / FR52)."""
from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Literal, Tuple

from services.configuration_service import ConfigurationService
from services.unity_persisted_document_io import resolve_unity_dir, safe_document_id

ZipCompression = Literal["store", "deflate"]


def content_disposition_attachment(filename: str) -> str:
    """Construit un en-tête Content-Disposition sûr pour pièce jointe JSON.

    Args:
        filename: Nom de fichier (basename attendu).

    Returns:
        Valeur d'en-tête ``attachment; filename="..."`` sans guillemets ni sauts de ligne.
    """
    safe_name = safe_export_filename(filename)
    header_value = safe_name.replace('"', "").replace("\r", "").replace("\n", "")
    return f'attachment; filename="{header_value}"'


def safe_export_filename(filename: str) -> str:
    """Valide un nom de fichier export (basename uniquement, pas de path traversal).

    Args:
        filename: Nom de fichier avec ou sans extension ``.json``.

    Returns:
        Nom de fichier sécurisé se terminant par ``.json``.

    Raises:
        ValueError: Si le nom contient des séquences interdites.
    """
    if ".." in filename or "/" in filename or "\\" in filename:
        raise ValueError("filename invalide (path traversal)")
    basename = Path(filename).name.strip()
    if not basename:
        raise ValueError("filename requis")
    if not basename.lower().endswith(".json"):
        basename = f"{basename}.json"
    return basename


def _format_json_utf8(raw_content: str) -> str:
    """Formate le JSON avec indent 2 et UTF-8 (ensure_ascii=False)."""
    try:
        data = json.loads(raw_content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Fichier JSON exporté invalide: {exc}") from exc
    return json.dumps(data, ensure_ascii=False, indent=2)


def read_document_download_payload(
    config_service: ConfigurationService,
    document_id: str,
    request_id: str | None = None,
) -> Tuple[str, str]:
    """Lit le JSON exporté pour téléchargement GET par document_id.

    Args:
        config_service: Service de configuration.
        document_id: Identifiant sans extension ``.json``.
        request_id: ID requête pour exceptions.

    Returns:
        Tuple (contenu JSON formaté, nom de fichier).

    Raises:
        FileNotFoundError: Document absent sur disque.
        ValueError: document_id invalide.
    """
    doc_id = safe_document_id(document_id)
    unity_dir = resolve_unity_dir(config_service, request_id)
    path = unity_dir / f"{doc_id}.json"
    if not path.is_file():
        raise FileNotFoundError(f"Document {doc_id} non trouvé")
    raw = path.read_text(encoding="utf-8")
    formatted = _format_json_utf8(raw)
    return formatted, f"{doc_id}.json"


def build_batch_download_zip(
    config_service: ConfigurationService,
    filenames: list[str],
    compression: ZipCompression = "deflate",
    request_id: str | None = None,
) -> Tuple[bytes, str]:
    """Construit une archive ZIP des fichiers exportés.

    Args:
        config_service: Service de configuration.
        filenames: Noms de fichiers exportés (basename ``.json``).
        compression: ``store`` ou ``deflate`` (zipfile).
        request_id: ID requête pour exceptions.

    Returns:
        Tuple (bytes ZIP, nom archive).

    Raises:
        FileNotFoundError: Un fichier demandé est absent.
        ValueError: Nom de fichier invalide ou liste vide.
    """
    if not filenames:
        raise ValueError("Au moins un filename requis")
    unity_dir = resolve_unity_dir(config_service, request_id)
    zip_compression = zipfile.ZIP_STORED if compression == "store" else zipfile.ZIP_DEFLATED
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zip_compression) as archive:
        for name in filenames:
            safe_name = safe_export_filename(name)
            path = unity_dir / safe_name
            if not path.is_file():
                raise FileNotFoundError(f"Fichier exporté {safe_name} non trouvé")
            content = path.read_text(encoding="utf-8")
            formatted = _format_json_utf8(content)
            archive.writestr(safe_name, formatted.encode("utf-8"))
    return buffer.getvalue(), "unity-dialogues-export.zip"

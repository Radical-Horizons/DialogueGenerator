"""Écriture atomique de fichiers JSON pour la sync GDD (pas de fichier tronqué servi)."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def write_json_atomic(path: Path, data: Any, *, indent: int = 2) -> None:
    """Écrit du JSON de façon atomique (fichier temporaire + replace).

    Args:
        path: Chemin du fichier cible.
        data: Objet sérialisable en JSON.
        indent: Indentation JSON.

    Raises:
        OSError: En cas d'échec d'écriture ou de renommage.
        TypeError: Si la sérialisation JSON échoue.
    """
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = json.dumps(data, ensure_ascii=False, indent=indent)
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(path)
    try:
        os.chmod(path, 0o644)
    except OSError:
        logger.debug("chmod ignoré pour %s (plateforme ou permissions)", path)


def read_json_file(path: Path, default: Any) -> Any:
    """Lit un fichier JSON ou retourne default.

    Args:
        path: Fichier source.
        default: Valeur si absent ou JSON invalide.

    Returns:
        Données décodées ou default.
    """
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Lecture JSON échouée pour %s: %s — utilisation du défaut", path, exc)
        return default

"""Outil one-shot pour ajouter choiceId aux documents dialogue (Story 16.5, AC1).

Usage:
  python -m scripts.migrate_choiceid [--dry-run] [--glob GLOB] <dossier|fichiers...>

Cible : dossiers ou fichiers JSON (glob ou liste). Recommandation : sauvegarde (backup)
avant exécution. Option --dry-run affiche les modifications sans écrire.

Les choiceId existants ne sont pas modifiés (idempotent). Les documents sont écrits
avec schemaVersion 1.1.0.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Union

# Racine projet = parent de scripts/
_PROJECT_ROOT = Path(__file__).resolve().parent.parent

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def _normalize_to_document(data: Union[List[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, Any]:
    """Normalise entrée en document v1.1.0 (dict avec schemaVersion et nodes)."""
    if isinstance(data, dict) and "nodes" in data:
        return data
    if isinstance(data, list):
        return {"schemaVersion": "1.1.0", "nodes": data}
    raise ValueError("Format invalide: dict avec 'nodes' ou liste de nœuds attendu")


def _stable_choice_id(node_id: str, choice_index: int) -> str:
    """Génère un choiceId stable déterministe (choice_<nodeId>_<index>)."""
    return f"choice_{node_id}_{choice_index}"


def migrate_document(doc: Union[List[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, Any]:
    """Migre un document : ajoute choiceId aux choices qui n'en ont pas, sortie schemaVersion 1.1.0.

    Idempotent : les choiceId déjà présents ne sont pas modifiés.

    Args:
        doc: Document (dict avec schemaVersion, nodes) ou liste de nœuds (legacy).

    Returns:
        Document avec schemaVersion 1.1.0 et tous les choices ayant un choiceId.
    """
    data = _normalize_to_document(doc)
    if data.get("schemaVersion") != "1.1.0":
        data["schemaVersion"] = "1.1.0"
    nodes = data.get("nodes", [])
    for node in nodes:
        node_id = node.get("id", "")
        choices = node.get("choices") or []
        for idx, choice in enumerate(choices):
            if not choice.get("choiceId"):
                choice["choiceId"] = _stable_choice_id(node_id, idx)
    return data


def migrate_file(path: Path, dry_run: bool = False) -> bool:
    """Lit un fichier JSON, migre le document, réécrit si pas dry_run. Retourne True si OK."""
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (json.JSONDecodeError, OSError) as e:
        logger.error("%s: %s", path, e)
        return False
    try:
        out = migrate_document(data)
    except ValueError as e:
        logger.error("%s: %s", path, e)
        return False
    if dry_run:
        logger.info("[dry-run] %s -> migré (non écrit)", path)
        return True
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Écrit: %s", path)
    return True


def main() -> int:
    """Point d'entrée CLI."""
    parser = argparse.ArgumentParser(
        description="Migration choiceId : ajoute choiceId stable aux documents dialogue (schemaVersion 1.1.0)."
    )
    parser.add_argument(
        "paths",
        nargs="+",
        type=Path,
        help="Dossiers ou fichiers JSON à traiter",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Afficher les changements sans écrire les fichiers",
    )
    parser.add_argument(
        "--glob",
        default="*.json",
        help="Glob pour les fichiers dans les dossiers (défaut: *.json)",
    )
    args = parser.parse_args()

    files: List[Path] = []
    for p in args.paths:
        if not p.exists():
            logger.warning("Ignoré (inexistant): %s", p)
            continue
        if p.is_file():
            if p.suffix.lower() == ".json":
                files.append(p)
            else:
                logger.warning("Ignoré (pas .json): %s", p)
        else:
            files.extend(p.glob(args.glob))

    if not files:
        logger.warning("Aucun fichier JSON à traiter.")
        return 0

    ok = 0
    for f in files:
        if migrate_file(f, dry_run=args.dry_run):
            ok += 1
    return 0 if ok == len(files) else 1


if __name__ == "__main__":
    sys.exit(main())

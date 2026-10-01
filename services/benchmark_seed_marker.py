"""Marqueur d'amorçage : ce qu'on a semé, et dans quel état on l'a laissé.

Le marqueur disait seulement « seeded ». Deux conséquences, l'une voulue et
l'autre non.

Voulue : supprimer la dernière grille ne la fait pas renaître au contenu d'usine,
ce qui contredirait l'intention de la suppression.

Non voulue : une installation déjà semée garde **pour toujours** ce qu'elle a reçu.
Le 2026-10-01, la grille est passée en v2 (critère `unsupported_invention`,
fidélité repondérée) et la suite standard gagne des cas : un poste ancien
mesurerait sous un barème et un jeu de cas que le code ne décrit plus, sans rien
signaler. Même famille que les défauts de septembre — une identité présente dans la
charge utile, absente du déclencheur.

En portant l'empreinte de ce qui a été semé, le marqueur permet de distinguer les
deux seuls cas qui comptent : l'artefact est **intact** depuis le semis (on peut le
remplacer sans rien perdre), ou il a été **touché** (on n'y revient pas, c'est de la
donnée utilisateur). Pas de système de migration : deux branches.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)

SEED_MARKER_NAME = ".seeded"
"""Nom du marqueur, commun aux grilles et aux suites."""

_VOLATILE_KEYS = frozenset({"updated_at"})
"""Champs à ignorer : ils changent à chaque écriture sans changer le contenu."""


def content_hash(payload: Dict[str, Any]) -> str:
    """Empreinte stable du contenu d'un artefact semé.

    Args:
        payload: Document sérialisable, métadonnées volatiles incluses ou non.

    Returns:
        Les seize premiers caractères du SHA-256 du document canonique.
    """
    stripped = {k: v for k, v in payload.items() if k not in _VOLATILE_KEYS}
    canonical = json.dumps(stripped, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def read_marker(directory: Path) -> Dict[str, str]:
    """Lit les empreintes consignées au dernier semis.

    Args:
        directory: Répertoire de l'artefact (grilles ou suites).

    Returns:
        ``{identifiant: empreinte}``. Vide si le marqueur manque, est illisible,
        ou vient de l'ancienne forme (le mot « seeded ») — auquel cas on ne sait
        rien de l'état du disque et on ne touche à rien.
    """
    marker = directory / SEED_MARKER_NAME
    try:
        raw = marker.read_text(encoding="utf-8")
    except OSError:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {str(k): str(v) for k, v in parsed.items() if isinstance(v, str)}


def marker_exists(directory: Path) -> bool:
    """Le répertoire a-t-il déjà été semé, sous une forme ou une autre ?"""
    return (directory / SEED_MARKER_NAME).exists()


def write_marker(directory: Path, hashes: Dict[str, str]) -> None:
    """Consigne les empreintes semées, sans faire échouer le service si ça résiste.

    Args:
        directory: Répertoire de l'artefact.
        hashes: ``{identifiant: empreinte}`` de ce qui vient d'être écrit.
    """
    marker = directory / SEED_MARKER_NAME
    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(
            json.dumps(hashes, sort_keys=True, ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.warning("Marqueur d'amorçage non écrit (%s) : %s", directory.name, exc)


def is_untouched(directory: Path, artifact_id: str, on_disk: Dict[str, Any]) -> bool:
    """L'artefact sur disque est-il exactement celui qu'on a semé ?

    Args:
        directory: Répertoire de l'artefact.
        artifact_id: Identifiant (``grid_id`` ou ``suite_id``).
        on_disk: Document lu sur disque.

    Returns:
        ``True`` seulement si une empreinte est consignée **et** qu'elle correspond.
        Un marqueur de l'ancienne forme, ou une empreinte absente, rend ``False`` :
        dans le doute on laisse la donnée tranquille.
    """
    recorded = read_marker(directory).get(artifact_id)
    return recorded is not None and recorded == content_hash(on_disk)

"""Sérialisation graphe → document Unity JSON (partagé export / preview — Story 5.5)."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from services.graph_conversion_service import GraphConversionService


def sanitize_dialogue_title_for_filename(title: str) -> str:
    """Normalise le titre métadonnées en base de nom de fichier (sans extension)."""
    sanitized = re.sub(r"[^\w\s-]", "", title)
    return re.sub(r"[-\s]+", "_", sanitized)


def graph_to_unity_json_content(
    nodes: List[Any],
    edges: List[Any],
    *,
    dialogue_flags: Optional[Dict[str, Any]] = None,
    title: Optional[str] = None,
) -> Tuple[Dict[str, Any], str]:
    """Convertit un graphe en document Unity et contenu JSON indenté UTF-8.

    Args:
        nodes: Nœuds ReactFlow.
        edges: Arêtes ReactFlow.
        dialogue_flags: Flags GDD optionnels.
        title: Titre dialogue pour métadonnées document.

    Returns:
        Tuple (document dict, json_content str indent=2 ensure_ascii=False).
    """
    document = GraphConversionService.graph_to_unity_document(
        nodes,
        edges,
        dialogue_flags=dialogue_flags,
        title=title,
    )
    json_content = json.dumps(document, ensure_ascii=False, indent=2)
    return document, json_content


def export_filename_from_title(title: str) -> str:
    """Dérive le nom de fichier export (.json) depuis un titre métadonnées."""
    sanitized = sanitize_dialogue_title_for_filename(title)
    base = sanitized[:100] if sanitized else "dialogue"
    return f"{base}.json"


def count_unity_nodes(document: Dict[str, Any]) -> int:
    """Compte les nœuds dans un document Unity."""
    nodes = document.get("nodes")
    if isinstance(nodes, list):
        return len(nodes)
    return 0


def json_content_size_bytes(json_content: str) -> int:
    """Taille UTF-8 du contenu JSON sérialisé."""
    return len(json_content.encode("utf-8"))

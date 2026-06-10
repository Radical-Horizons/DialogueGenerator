"""Extraction de texte dialogue/choix par nœud pour validation lore (FR38, stories 4.4+).

Frontière : lecture pure des payloads graphe (dict nœuds ReactFlow / Unity projetés),
sans logique de contradiction.
"""
from __future__ import annotations

from typing import Any, Dict, List

from services.graph_validation_service import (
    _is_dialogue_like,
    _node_data,
    _node_id,
    _node_type,
)


def iter_dialogue_like_nodes(nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Retourne les nœuds assimilables à du dialogue (hors START/END/test/end)."""
    out: List[Dict[str, Any]] = []
    for node in nodes:
        nid = _node_id(node)
        if not nid or nid in ("START", "END"):
            continue
        ntype = _node_type(node)
        if ntype in ("testNode", "endNode"):
            continue
        if not _is_dialogue_like(ntype):
            continue
        out.append(node)
    return out


def collect_node_text_for_lore_scan(node: Dict[str, Any]) -> str:
    """Concatène ligne principale et textes de choix exploitables pour scan lore.

    Args:
        node: Nœud graphe (format API / ReactFlow).

    Returns:
        Texte unique en minuscules pour heuristiques (chaîne vide si rien d'exploitable).
    """
    data = _node_data(node)
    parts: List[str] = []
    line_val = data.get("line")
    if line_val is not None and str(line_val).strip():
        parts.append(str(line_val))
    choices = data.get("choices")
    if isinstance(choices, list):
        for ch in choices:
            if not isinstance(ch, dict):
                continue
            t = ch.get("text")
            if t is not None and str(t).strip():
                parts.append(str(t))
    combined = " \n ".join(parts)
    return combined.lower()


def build_node_id_to_lore_text(nodes: List[Dict[str, Any]]) -> Dict[str, str]:
    """Construit la table ``node_id -> texte`` pour tous les nœuds dialogue-like.

    Args:
        nodes: Liste des nœuds du graphe.

    Returns:
        Dictionnaire id stable → texte concaténé en minuscules.
    """
    result: Dict[str, str] = {}
    for node in iter_dialogue_like_nodes(nodes):
        nid = _node_id(node)
        if not nid:
            continue
        text = collect_node_text_for_lore_scan(node)
        if text.strip():
            result[str(nid)] = text
    return result

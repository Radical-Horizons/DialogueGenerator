"""Extraction partagée des champs cherchables Unity (Story 8.6 / FR85)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

SEARCH_TEXT_MAX_CHARS = 2000


@dataclass(frozen=True)
class UnitySearchFields:
    """Champs indexables dérivés d'un document Unity."""

    title: str | None
    speakers: list[str]
    search_text: str | None
    node_count: int | None


def _as_nodes(document: Any) -> list[Any]:
    """Normalise liste legacy ou document ``{nodes}`` en liste de nœuds."""
    if isinstance(document, list):
        return document
    if isinstance(document, dict):
        nodes = document.get("nodes")
        if isinstance(nodes, list):
            return nodes
    return []


def extract_title_from_nodes(nodes: list[Any]) -> str | None:
    """Extrait un titre potentiel (START.line ou première réplique)."""
    for node in nodes:
        if isinstance(node, dict):
            node_id = node.get("id", "")
            line = node.get("line", "")
            if node_id == "START" and isinstance(line, str) and line.strip():
                return line.strip()[:50]
    for node in nodes:
        if isinstance(node, dict):
            line = node.get("line")
            if isinstance(line, str) and line.strip():
                return line.strip()[:50]
    return None


def count_nodes(document: Any) -> int | None:
    """Compte les nœuds dict d'un document Unity."""
    nodes = _as_nodes(document)
    if not nodes and not isinstance(document, (list, dict)):
        return None
    return sum(1 for node in nodes if isinstance(node, dict))


def extract_speakers_and_text(
    nodes: list[Any],
) -> tuple[list[str], str | None]:
    """Extrait speakers uniques et corps cherchable borné."""
    speakers: list[str] = []
    seen: set[str] = set()
    lines: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        speaker = node.get("speaker")
        if isinstance(speaker, str):
            normalized = speaker.strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                speakers.append(normalized)
        line = node.get("line")
        if isinstance(line, str) and line.strip():
            lines.append(line.strip())
    search_text = (
        " ".join(lines).lower()[:SEARCH_TEXT_MAX_CHARS] if lines else None
    )
    return speakers, search_text


def extract_search_fields(document: Any) -> UnitySearchFields:
    """Construit les champs indexables depuis un document Unity parsé."""
    nodes = _as_nodes(document)
    speakers, search_text = extract_speakers_and_text(nodes)
    return UnitySearchFields(
        title=extract_title_from_nodes(nodes),
        speakers=speakers,
        search_text=search_text,
        node_count=count_nodes(document),
    )

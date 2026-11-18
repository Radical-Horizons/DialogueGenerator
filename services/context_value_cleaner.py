"""Nettoyage des valeurs de fiches GDD avant leur entrée dans le contexte du prompt.

Les fiches synchronisées depuis Notion portent du balisage qui n'a aucun sens pour le
LLM : images hébergées sur S3 (URL signées de plus de mille caractères), pièces jointes,
bases de données intégrées, boutons, et liens vers d'autres pages exprimés en UUID. Mesuré
le 2026-11-18 sur la fiche de Voknir : plus de la moitié du budget de contexte partait
dans ce bruit, et la troncature coupait les fiches utiles qui venaient après.

Le nettoyage garde le texte lisible (titre d'un lien, contenu d'une cellule de tableau),
remplace les mentions de pages par le nom de la fiche citée quand l'index des relations
le connaît, et supprime le reste.
"""
from __future__ import annotations

import re
from typing import Any, List, Mapping, Optional

from services.gdd_notion_sync_utils import normalize_notion_id
from services.gdd_relation_resolver import looks_like_notion_uuid, parse_relation_tokens

_MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_NOTION_ID_IN_URL_RE = re.compile(r"([0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12})")
_MENTION_RE = re.compile(
    r"<mention-[a-z-]+\b[^>]*?url=\"([^\"]*)\"[^>]*?/?>(?:</mention-[a-z-]+>)?",
    re.IGNORECASE,
)
_LINE_BREAK_TAG_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
_CELL_END_RE = re.compile(r"</t[dh]>", re.IGNORECASE)
_ROW_END_RE = re.compile(r"</tr>", re.IGNORECASE)
_ANY_TAG_RE = re.compile(r"</?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?/?>")
_MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\((?:https?|file|collection)://[^)]*\)")
_BARE_URL_RE = re.compile(r"(?:https?|file|collection)://\S+")
_SPACES_BEFORE_NEWLINE_RE = re.compile(r"[ \t]+\n")
_MANY_BLANK_LINES_RE = re.compile(r"\n\s*\n(\s*\n)+")
_EMPTY_CELLS_RE = re.compile(r"(?:\s*\|\s*){2,}")


def _name_for_notion_url(url: str, relation_index: Optional[Mapping[str, str]]) -> str:
    """Nom de la fiche visée par une URL Notion, ou chaîne vide si inconnue."""
    if not relation_index:
        return ""
    match = _NOTION_ID_IN_URL_RE.search(url)
    if not match:
        return ""
    try:
        return relation_index.get(normalize_notion_id(match.group(1)), "")
    except ValueError:
        return ""


def _resolve_relation_list(text: str, relation_index: Optional[Mapping[str, str]]) -> Optional[str]:
    """Résout un champ relation (UUID séparés par virgules) ; None si ce n'en est pas un.

    Les UUID inconnus de l'index sont retirés et les noms répétés ne sont gardés qu'une fois.
    """
    tokens = parse_relation_tokens(text)
    if not tokens or not all(looks_like_notion_uuid(t) for t in tokens):
        return None
    names: List[str] = []
    for token in tokens:
        name = _name_for_notion_url(token, relation_index)
        if name and name not in names:
            names.append(name)
    return ", ".join(names)


def _has_readable_content(text: str) -> bool:
    """Vrai si le texte porte autre chose que des titres markdown ou de la ponctuation."""
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if any(ch.isalnum() for ch in stripped):
            return True
    return False


def clean_context_text(text: str, relation_index: Optional[Mapping[str, str]] = None) -> Optional[str]:
    """Nettoie une valeur texte de fiche GDD pour le prompt.

    Args:
        text: Valeur brute (texte Notion, champ relation, propriété).
        relation_index: Index ``{uuid_normalisé: Nom}`` pour nommer les pages citées.

    Returns:
        Texte nettoyé, ou None s'il ne reste rien de lisible (le champ est alors omis).
    """
    if not text or not text.strip():
        return None
    relation_names = _resolve_relation_list(text, relation_index)
    if relation_names is not None:
        return relation_names or None

    cleaned = _MARKDOWN_IMAGE_RE.sub("", text)
    cleaned = _MENTION_RE.sub(lambda m: _name_for_notion_url(m.group(1), relation_index), cleaned)
    cleaned = _LINE_BREAK_TAG_RE.sub("\n", cleaned)
    cleaned = _CELL_END_RE.sub(" | ", cleaned)
    cleaned = _ROW_END_RE.sub("\n", cleaned)
    cleaned = _ANY_TAG_RE.sub("", cleaned)
    cleaned = _MARKDOWN_LINK_RE.sub(r"\1", cleaned)
    cleaned = _BARE_URL_RE.sub("", cleaned)
    cleaned = _EMPTY_CELLS_RE.sub(" | ", cleaned)
    cleaned = _SPACES_BEFORE_NEWLINE_RE.sub("\n", cleaned)
    cleaned = _MANY_BLANK_LINES_RE.sub("\n\n", cleaned).strip()
    if not _has_readable_content(cleaned):
        return None
    return cleaned


def clean_context_value(value: Any, relation_index: Optional[Mapping[str, str]] = None) -> Any:
    """Nettoie une valeur extraite d'une fiche (texte ou liste de textes).

    Args:
        value: Valeur brute du champ.
        relation_index: Index ``{uuid_normalisé: Nom}`` pour nommer les pages citées.

    Returns:
        Valeur nettoyée, ou None si le champ ne porte plus rien d'utile. Les types autres
        que texte et liste de textes sont rendus tels quels.
    """
    if isinstance(value, str):
        return clean_context_text(value, relation_index)
    if isinstance(value, list) and value and all(isinstance(item, str) for item in value):
        cleaned_items: List[str] = []
        for item in value:
            cleaned = clean_context_text(item, relation_index)
            if cleaned and cleaned not in cleaned_items:
                cleaned_items.append(cleaned)
        return cleaned_items or None
    return value

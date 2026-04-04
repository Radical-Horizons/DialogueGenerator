"""Découpage du bloc markdown ``sections._general`` des fiches GDD (export Notion).

Les fiches shard exposent souvent tout le narratif dans une seule chaîne ; ce module
propose des sous-champs virtuels ``sections._general.<slug>`` alignés sur les titres
markdown ``#`` / ``##`` / ``###`` pour l’UI et l’extraction de contexte.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

# Espace après les # optionnel (exports parfois ``##Titre`` sans espace).
_HEADING_RE = re.compile(r"^(#{1,3})\s*(.+?)\s*$")


def _slugify_title(title: str, reserved: set[str]) -> str:
    """Produit un segment de chemin stable et unique parmi ``reserved``."""
    raw = title.strip()
    norm = unicodedata.normalize("NFKD", raw)
    ascii_like = "".join(c if c.isalnum() or c in " _-" else "_" for c in norm)
    base = "_".join(ascii_like.lower().split())
    base = base.strip("_")[:80] or "section"
    slug = base
    n = 2
    while slug in reserved:
        slug = f"{base}_{n}"
        n += 1
    reserved.add(slug)
    return slug


def split_sections_general_text(text: str) -> List[Tuple[str, str, str]]:
    """Découpe un texte markdown en blocs (slug, titre, corps).

    Le texte avant le premier titre ``#`` / ``##`` / ``###`` (niveau ≤ 3) forme le
    bloc ``preamble`` s'il est non vide.

    Args:
        text: Contenu typiquement issu de ``data["sections"]["_general"]``.

    Returns:
        Liste ``(slug, titre_ligne, corps)`` ; liste vide si ``text`` vide.
    """
    if not text or not isinstance(text, str):
        return []
    lines = text.splitlines()
    used_slugs: set[str] = set()
    chunks: List[Tuple[str, str, str]] = []
    current_slug = _slugify_title("preamble", used_slugs)
    current_title = "Préambule"
    buf: List[str] = []

    def flush() -> None:
        body = "\n".join(buf).strip()
        buf.clear()
        if body:
            chunks.append((current_slug, current_title, body))

    for line in lines:
        m = _HEADING_RE.match(line)
        if m and len(m.group(1)) <= 3:
            flush()
            current_title = m.group(2).strip()
            current_slug = _slugify_title(current_title, used_slugs)
            continue
        buf.append(line)
    flush()
    return chunks


def extract_virtual_sections_general_path(data: Dict[str, Any], path: str) -> Optional[str]:
    """Extrait le corps d'une sous-section si ``path`` est ``sections._general.<slug>``.

    Résolution dans l'ordre :

    1. Monolithe legacy : ``sections._general`` (chaîne) découpée par titres markdown.
    2. Sync Notion actuel : ``sections[slug]`` (corps déjà découpé à l'export).

    Args:
        data: Fiche GDD (dict racine).
        path: Chemin pointé.

    Returns:
        Texte du bloc correspondant, ou ``None`` si le chemin n'est pas virtuel ou
        si le slug est introuvable (y compris pour laisser la résolution classique).
    """
    prefix = "sections._general."
    if not path.startswith(prefix) or path == "sections._general":
        return None
    slug = path[len(prefix) :]
    if not slug or "." in slug:
        return None
    sections = data.get("sections")
    if not isinstance(sections, dict):
        return None
    raw = sections.get("_general")
    if isinstance(raw, str) and raw.strip():
        for s_slug, _title, body in split_sections_general_text(raw):
            if s_slug == slug:
                return body
        return None
    direct = sections.get(slug)
    if isinstance(direct, str) and direct.strip():
        return direct
    return None


def navigate_dict_path(data: Dict[str, Any], path: str) -> Any:
    """Parcourt ``data`` avec un chemin pointé classique (sans virtual)."""
    keys = path.split(".")
    current: Any = data
    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return None
    return current


def extract_gdd_field_value(data: Dict[str, Any], path: str) -> Any:
    """Résout une valeur : sous-sections ``sections._general.<slug>`` puis chemin standard."""
    virtual = extract_virtual_sections_general_path(data, path)
    if virtual is not None:
        return virtual
    return navigate_dict_path(data, path)

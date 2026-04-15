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

# Markdown enrichi Notion (``GET /v1/pages/{id}/markdown``) : callouts en pseudo-XML,
# titres de callout en ``<span>`` + gras — pas des lignes ``##`` exploitables telles quelles.
_CALLOUT_TAG_OPEN = re.compile(r"<callout\b[^>]*>\s*", re.IGNORECASE)
_CALLOUT_TAG_CLOSE = re.compile(r"\s*</callout>\s*", re.IGNORECASE)
_SPAN_BOLD_CALLOUT_TITLE = re.compile(
    r"^\s*<span\b[^>]*>\*\*(.+?)\*\*</span>\s*$",
    re.MULTILINE,
)
# Attributs Notion en fin (ou milieu) de ligne de titre : ``## Titre {color="yellow"}``.
_NOTION_BRACE_ATTR = re.compile(
    r'\{[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*"(?:[^"\\]|\\.)*"\}',
)
_NOTION_BRACE_ATTR_SQ = re.compile(
    r"\{[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*'(?:[^'\\]|\\.)*'\}",
)


def _clean_heading_display_title(title: str) -> str:
    """Retire le bruit markdown Notion sur une ligne de titre (affichage + base du slug).

    Ex. ``## Foo {color="yellow"}`` → ``Foo`` ; balises HTML résiduelles ; gras englobant ``**…**``.
    """
    t = (title or "").strip()
    if not t:
        return ""
    prev = None
    while prev != t:
        prev = t
        t = _NOTION_BRACE_ATTR.sub("", t)
        t = _NOTION_BRACE_ATTR_SQ.sub("", t)
        t = t.strip()
    t = re.sub(r"<[^>]+>", "", t)
    m = re.fullmatch(r"\*\*(.+?)\*\*", t.strip(), flags=re.DOTALL)
    if m:
        t = m.group(1).strip()
    return " ".join(t.split())


def normalize_notion_enhanced_markdown_for_section_split(text: str) -> str:
    """Réécrit le markdown Notion enrichi pour des titres ``##`` détectables par le découpeur.

    Sans cette étape, tout le narratif sous ``# Besoin de l'intrigue`` reste monolithique
    alors que l'API markdown expose des titres dans des ``<span>…</span>``.

    Args:
        text: Corps retourné par ``GET /v1/pages/{id}/markdown`` (ou équivalent).

    Returns:
        Texte normalisé ; chaîne vide si entrée vide.
    """
    if not text or not isinstance(text, str):
        return text
    out = _CALLOUT_TAG_OPEN.sub("\n", text)
    out = _CALLOUT_TAG_CLOSE.sub("\n", out)

    def _span_to_heading(match: re.Match[str]) -> str:
        title = _clean_heading_display_title(match.group(1)) or "Sans titre"
        return f"\n## {title}\n"

    out = _SPAN_BOLD_CALLOUT_TITLE.sub(_span_to_heading, out)
    return out


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
        Liste ``(slug, titre_affichable_nettoyé, corps)`` ; liste vide si ``text`` vide.
        Titres et slugs ignorent les suffixes Notion du type ``{color="…"}``.
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
            current_title = _clean_heading_display_title(m.group(2)) or "Sans titre"
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

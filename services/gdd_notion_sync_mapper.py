"""Transformation Notion → enregistrement GDD minimal (Nom + sections)."""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, MutableSequence, Optional, Sequence, Tuple

from services.gdd_sections_split import (
    normalize_notion_enhanced_markdown_for_section_split,
    split_sections_general_text,
)

# Bases synchronisées comme **tables** : pas d’appel ``get_page_content`` dès le départ ;
# export **compact** ``Nom`` + ``values`` (sections vides). Les autres bases peuvent quand
# même éviter ``get_page_content`` après sonde dynamique (voir ``GddNotionSyncService``).
NOTION_DATABASE_COMPACT_TABLE_IDS: frozenset[str] = frozenset(
    {
        "22c6e4d2-1b45-8066-b17c-c2af998de0b8",  # Chronologie d'Escelion
        "935bdaad-d395-4cdb-be6b-7f7f9a6789d2",  # Noms
        "2d16e4d2-1b45-8016-ba74-ccb4fbd92b72",  # Vocabulaire Alteir
        "10f87005-d58e-46cc-94dc-580b4be9a5cd",  # Compétences
        "0e4cee6a-0546-456a-b49d-5592f553cc9a",  # Compétences de perso
    }
)


def extract_page_title(page: Mapping[str, Any]) -> str:
    """Extrait le titre affiché d'une page Notion (API officielle)."""
    props = page.get("properties") or {}
    for _key, prop in props.items():
        if not isinstance(prop, dict):
            continue
        if prop.get("type") == "title":
            title_arr = prop.get("title") or []
            parts = [t.get("plain_text", "") for t in title_arr if isinstance(t, dict)]
            name = "".join(parts).strip()
            if name:
                return name
    return ""


def _plain_from_rich_text(items: Sequence[Mapping[str, Any]]) -> str:
    parts: List[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        parts.append(str(item.get("plain_text", "") or ""))
    return "".join(parts).strip()


def _format_property_value(prop: Mapping[str, Any]) -> str:
    """Convertit une propriété Notion API en texte lisible (une ligne ou court bloc)."""
    if not isinstance(prop, dict):
        return ""
    ptype = prop.get("type")
    if ptype == "title":
        return _plain_from_rich_text(prop.get("title") or [])
    if ptype == "rich_text":
        return _plain_from_rich_text(prop.get("rich_text") or [])
    if ptype == "number":
        v = prop.get("number")
        return "" if v is None else str(v)
    if ptype == "select":
        sel = prop.get("select")
        if isinstance(sel, dict):
            return str(sel.get("name", "") or "").strip()
        return ""
    if ptype == "multi_select":
        opts = prop.get("multi_select") or []
        names = [o.get("name", "") for o in opts if isinstance(o, dict)]
        return ", ".join(n for n in names if n)
    if ptype == "status":
        st = prop.get("status")
        if isinstance(st, dict):
            return str(st.get("name", "") or "").strip()
        return ""
    if ptype == "date":
        d = prop.get("date")
        if not isinstance(d, dict):
            return ""
        start = d.get("start", "")
        end = d.get("end", "")
        if end:
            return f"{start} → {end}"
        return str(start or "")
    if ptype == "checkbox":
        return "oui" if prop.get("checkbox") else "non"
    if ptype == "url":
        return str(prop.get("url", "") or "").strip()
    if ptype == "email":
        return str(prop.get("email", "") or "").strip()
    if ptype == "phone_number":
        return str(prop.get("phone_number", "") or "").strip()
    if ptype == "people":
        people = prop.get("people") or []
        names: List[str] = []
        for person in people:
            if isinstance(person, dict) and person.get("name"):
                names.append(str(person["name"]))
        return ", ".join(names)
    if ptype == "relation":
        rel = prop.get("relation") or []
        return ", ".join(str(r.get("id", "")) for r in rel if isinstance(r, dict) and r.get("id"))
    if ptype == "formula":
        f = prop.get("formula") or {}
        if not isinstance(f, dict):
            return ""
        for key in ("string", "number", "boolean", "date"):
            if key in f and f[key] is not None:
                return str(f[key])
        return ""
    if ptype == "rollup":
        r = prop.get("rollup") or {}
        if not isinstance(r, dict):
            return ""
        if r.get("type") == "array":
            arr = r.get("array") or []
            return "; ".join(_format_property_value(x) for x in arr if isinstance(x, dict))
        return str(r.get("number", r.get("date", r.get("string", ""))) or "")
    if ptype == "files":
        files = prop.get("files") or []
        bits: List[str] = []
        for f in files:
            if not isinstance(f, dict):
                continue
            if f.get("type") == "external":
                ext = f.get("external") or {}
                bits.append(str(ext.get("url", "") or ""))
            elif f.get("type") == "file":
                fi = f.get("file") or {}
                bits.append(str(fi.get("url", "") or ""))
        return ", ".join(b for b in bits if b)
    if ptype in ("created_time", "last_edited_time"):
        return str(prop.get(ptype, "") or "")
    if ptype in ("created_by", "last_edited_by"):
        inner = prop.get(ptype) or {}
        if isinstance(inner, dict) and inner.get("name"):
            return str(inner["name"])
        return ""
    if ptype == "unique_id":
        uid = prop.get("unique_id") or {}
        if isinstance(uid, dict):
            prefix = str(uid.get("prefix", "") or "")
            num = uid.get("number")
            return f"{prefix}{num}" if num is not None else prefix
        return ""
    return ""


def rich_text_properties_as_markdown_sections(
    properties: Mapping[str, Any],
) -> str:
    """Produit des blocs ``## Nom de colonne`` pour chaque propriété ``rich_text`` non vide.

    Permet de récupérer du narratif stocké dans les colonnes de la base lorsque le corps
    de page Notion n'expose pas d'enfants de blocs (API ``results: []``).

    Args:
        properties: ``page["properties"]`` (API Notion).

    Returns:
        Markdown concaténé, ou chaîne vide.
    """
    parts: List[str] = []
    for key in sorted(properties.keys()):
        prop = properties.get(key)
        if not isinstance(prop, dict) or prop.get("type") != "rich_text":
            continue
        txt = _format_property_value(prop).strip()
        if not txt:
            continue
        parts.append(f"## {key}\n\n{txt}")
    return "\n\n".join(parts)


def markdown_body_to_sync_sections(body_text: str) -> Tuple[Dict[str, str], Dict[str, str]]:
    """Découpe le markdown du corps de page en sections nommées par slug (titres #/##/###).

    Le texte peut inclure des titres ``##`` issus des colonnes ``rich_text`` fusionnées
    par :func:`notion_page_to_gdd_record_merge_body_and_properties`.

    Returns:
        Tuple ``(sections, section_titles)`` avec ``sections[slug] = corps`` et
        ``section_titles[slug] = titre affichable`` (ex. « Préambule », « Caractérisation »).
    """
    body = (body_text or "").strip()
    if not body:
        return {}, {}
    body = normalize_notion_enhanced_markdown_for_section_split(body)
    chunks = split_sections_general_text(body)
    sections: Dict[str, str] = {}
    titles: Dict[str, str] = {}
    for slug, title, chunk_body in chunks:
        sections[slug] = chunk_body
        titles[slug] = title
    return sections, titles


def properties_to_general_text(
    properties: Mapping[str, Any],
    *,
    skip_title_property: bool = True,
) -> str:
    """Agrège les propriétés Notion en texte (outil / debug ; plus injecté dans ``sections`` en sync)."""
    lines: List[str] = []
    for key in sorted(properties.keys()):
        prop = properties.get(key)
        if not isinstance(prop, dict):
            continue
        if skip_title_property and prop.get("type") == "title":
            continue
        val = _format_property_value(prop)
        if val:
            lines.append(f"**{key}** : {val}")
    return "\n".join(lines)


def notion_properties_to_values_flat(properties: Mapping[str, Any]) -> Dict[str, str]:
    """Colonnes Notion (hors titre) → texte plat, une entrée par nom de propriété."""
    values: Dict[str, str] = {}
    for key in sorted(properties.keys()):
        prop = properties.get(key)
        if not isinstance(prop, dict):
            continue
        if prop.get("type") == "title":
            continue
        val = _format_property_value(prop)
        if val:
            values[str(key)] = val
    return values


def notion_page_to_compact_row_record(page: Mapping[str, Any]) -> Dict[str, Any]:
    """Construit une ligne de base Notion au format compact (colonnes → ``values``).

    Le titre Notion devient ``Nom`` ; chaque autre propriété non vide devient une entrée
    ``values[nom_colonne]`` (texte plat). Pas de parcours des blocs de page ; les colonnes
    ne sont pas recopiées dans ``sections``.

    Args:
        page: Payload JSON page/ligne retourné par l’API (``get_page``).

    Returns:
        Dict avec ``Nom``, ``values`` et ``sections`` vide.
    """
    title = extract_page_title(page)
    props = page.get("properties") or {}
    values = notion_properties_to_values_flat(props)
    return {
        "Nom": title or "SansTitre",
        "values": values,
        "sections": {},
    }


def notion_page_to_gdd_record(page: Mapping[str, Any], body_text: str) -> Dict[str, Any]:
    """Construit un objet compatible charge GDD (liste d'entités).

    Le corps est découpé en ``sections[slug]`` (titres markdown # / ## / ###), sans
    monolithe ``_general``. Pour la sync base Notion avec colonnes, utiliser
    :func:`notion_page_to_gdd_record_merge_body_and_properties`.

    Args:
        page: Payload JSON page Notion.
        body_text: Contenu texte/markdown agrégé des blocs.

    Returns:
        Dict avec clés Nom, sections et optionnellement section_titles.
    """
    title = extract_page_title(page) or "SansTitre"
    sections, titles = markdown_body_to_sync_sections(body_text)
    out: Dict[str, Any] = {"Nom": title, "sections": sections}
    if titles:
        out["section_titles"] = titles
    return out


def notion_page_to_gdd_record_merge_body_and_properties(
    page: Mapping[str, Any], body_text: str
) -> Dict[str, Any]:
    """Enregistrement GDD pour sync base Notion.

    - ``values`` : colonnes (hors titre), texte plat.
    - ``sections`` : corps de page + colonnes ``rich_text`` (titres ``##``), découpé par
      titres markdown (clés = slugs).
    - ``section_titles`` : libellés affichables slug → titre de section.
    """
    title = extract_page_title(page) or "SansTitre"
    props = page.get("properties") or {}
    values = notion_properties_to_values_flat(props)
    props_md = rich_text_properties_as_markdown_sections(props)
    core_body = (body_text or "").strip()
    if props_md:
        core_body = f"{core_body}\n\n{props_md}".strip() if core_body else props_md
    sections, titles = markdown_body_to_sync_sections(core_body)
    out: Dict[str, Any] = {
        "Nom": title,
        "values": values,
        "sections": sections,
    }
    if titles:
        out["section_titles"] = titles
    return out


def _sections_have_text_content(sections: Any) -> bool:
    if not isinstance(sections, dict):
        return False
    for key, val in sections.items():
        if isinstance(val, str) and val.strip():
            return True
        if isinstance(val, dict) and val:
            return True
    return False


def is_record_empty_for_sync(record: Mapping[str, Any]) -> bool:
    """True si l’entité n’a ni nom exploitable ni contenu (à ne pas fusionner dans le GDD).

    Les lignes entièrement vides sont ignorées ; le manifeste peut quand même être
    avancé côté service pour éviter de les retraiter indéfiniment.
    """
    nom = str(record.get("Nom") or "").strip()
    if nom and nom != "SansTitre":
        return False
    vals = record.get("values")
    if isinstance(vals, dict) and any(str(v).strip() for v in vals.values()):
        return False
    if _sections_have_text_content(record.get("sections")):
        return False
    return True


def database_id_is_compact_table_export(database_id_normalized: str) -> bool:
    """True si cette base est exportée uniquement via lignes compactes (sans blocs)."""
    return database_id_normalized in NOTION_DATABASE_COMPACT_TABLE_IDS


def database_id_should_skip_page_blocks(database_id_normalized: str) -> bool:
    """Alias : mêmes bases que :func:`database_id_is_compact_table_export`."""
    return database_id_is_compact_table_export(database_id_normalized)


def merge_records_by_nom(
    existing: MutableSequence[Dict[str, Any]],
    new_records: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Fusionne des enregistrements : même Nom remplace la première occurrence.

    Args:
        existing: Liste actuelle (sera copiée, non mutée destructivement).
        new_records: Nouveaux enregistrements issus de Notion.

    Returns:
        Nouvelle liste fusionnée.
    """
    out: List[Dict[str, Any]] = [dict(x) for x in existing]
    for rec in new_records:
        nom = rec.get("Nom")
        idx: int | None = None
        for i, item in enumerate(out):
            if item.get("Nom") == nom:
                idx = i
                break
        if idx is not None:
            out[idx] = dict(rec)
        else:
            out.append(dict(rec))
    return out

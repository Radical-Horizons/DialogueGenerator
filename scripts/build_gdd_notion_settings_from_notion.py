#!/usr/bin/env python3
"""Construit data/gdd_notion_sync/settings.json à partir du workspace Notion réel.

Utilise POST /v1/search (pagination) pour chaque type ``page`` et ``database``
accessibles à l'intégration (token ``NOTION_API_KEY`` ou ``.env`` à la racine).

Exécution (depuis la racine du repo)::

    node scripts/getPythonPath.js -m scripts.build_gdd_notion_settings_from_notion

Ou avec venv activé : ``python -m scripts.build_gdd_notion_settings_from_notion``
"""
from __future__ import annotations

import json
import logging
import re
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

NOTION_VERSION = "2022-06-28"
SEARCH_URL = "https://api.notion.com/v1/search"
REPO_ROOT = Path(__file__).resolve().parent.parent
SETTINGS_OUT = REPO_ROOT / "data" / "gdd_notion_sync" / "settings.json"
SNAPSHOT_OUT = REPO_ROOT / "data" / "gdd_notion_sync" / "notion_search_snapshot.json"


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(REPO_ROOT / ".env")
    except Exception as exc:
        logger.debug("dotenv optionnel: %s", exc)


def _token() -> str:
    import os

    t = (os.environ.get("NOTION_API_KEY") or "").strip()
    if not t:
        logger.error(
            "NOTION_API_KEY manquant. Définis-le dans .env à la racine du projet."
        )
        sys.exit(1)
    return t


def _normalize_id(raw: str) -> str:
    s = raw.strip().replace("-", "").lower()
    if len(s) != 32 or not re.fullmatch(r"[0-9a-f]{32}", s):
        raise ValueError(f"ID Notion invalide: {raw!r}")
    return str(uuid.UUID(hex=s))


def _title_from_database(item: Dict[str, Any]) -> str:
    parts: List[str] = []
    for block in item.get("title") or []:
        if not isinstance(block, dict):
            continue
        parts.append(block.get("plain_text", "") or "")
    return "".join(parts).strip() or "SansTitre"


def _title_from_page(item: Dict[str, Any]) -> str:
    props = item.get("properties") or {}
    for _key, prop in props.items():
        if not isinstance(prop, dict):
            continue
        if prop.get("type") != "title":
            continue
        title_arr = prop.get("title") or []
        chunks: List[str] = []
        for t in title_arr:
            if isinstance(t, dict):
                chunks.append(t.get("plain_text", "") or "")
        name = "".join(chunks).strip()
        if name:
            return name
    return "SansTitre"


def _sanitize_filename_base(name: str) -> str:
    base = name.strip() or "SansTitre"
    base = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", base)
    base = re.sub(r"\s+", "_", base)
    base = base.strip("._") or "SansTitre"
    return base[:120]


def _search_all(
    client: httpx.Client,
    *,
    object_type: str,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    cursor: Optional[str] = None
    while True:
        payload: Dict[str, Any] = {
            "page_size": 100,
            "filter": {"value": object_type, "property": "object"},
        }
        if cursor:
            payload["start_cursor"] = cursor
        response = client.post(SEARCH_URL, json=payload)
        response.raise_for_status()
        data = response.json()
        out.extend(data.get("results") or [])
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return out


def _build_sources(
    pages: List[Dict[str, Any]],
    databases: List[Dict[str, Any]],
) -> tuple[List[Dict[str, str]], int]:
    """Construit les sources ; exclut toute page dont le parent est une **base** (ligne de table).

    Une base ``kind: database`` suffit pour la sync (query sur la DB) : pas d’entrées
    ``kind: page`` pour les rows, même si le ``search`` n’a pas renvoyé la base parente.

    Returns:
        (sources, nombre de pages ignorées car ``parent.type == database_id``).
    """
    used_names: Dict[str, int] = {}
    sources: List[Dict[str, str]] = []
    pages_skipped_as_db_rows = 0

    def add(kind: str, notion_id: str, title: str) -> None:
        base = _sanitize_filename_base(title)
        key = base.lower()
        used_names[key] = used_names.get(key, 0) + 1
        if used_names[key] > 1:
            short = notion_id.replace("-", "")[:8]
            fname = f"{base}_{short}.json"
        else:
            fname = f"{base}.json"
        sources.append(
            {
                "kind": kind,
                "notion_id": notion_id,
                "category_file": fname,
            }
        )

    for db in databases:
        if db.get("object") != "database":
            continue
        rid = db.get("id")
        if not rid:
            continue
        add("database", _normalize_id(str(rid)), _title_from_database(db))

    for page in pages:
        if page.get("object") != "page":
            continue
        rid = page.get("id")
        if not rid:
            continue
        parent = page.get("parent") or {}
        if parent.get("type") == "database_id":
            # Toute page enfant d’une base est une **ligne** : jamais en ``kind: page``.
            # La sync passe par ``kind: database`` sur l’id parent (même si le search
            # n’a pas renvoyé la base dans ``databases``).
            pages_skipped_as_db_rows += 1
            continue
        add("page", _normalize_id(str(rid)), _title_from_page(page))

    sources.sort(key=lambda s: (s["kind"], s["category_file"].lower()))
    return sources, pages_skipped_as_db_rows


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    _load_dotenv()
    token = _token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }
    SETTINGS_OUT.parent.mkdir(parents=True, exist_ok=True)

    with httpx.Client(timeout=60.0, headers=headers) as client:
        logger.info("Recherche des bases Notion accessibles…")
        databases = _search_all(client, object_type="database")
        logger.info("Recherche des pages Notion accessibles…")
        pages = _search_all(client, object_type="page")

    sources, pages_skipped_db_children = _build_sources(pages, databases)
    settings: Dict[str, Any] = {
        "schema_version": 1,
        "sync_interval_minutes": 60,
        "auto_sync_enabled": False,
        "sources": sources,
        "included_categories": [],
    }
    SETTINGS_OUT.write_text(
        json.dumps(settings, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    snapshot = {
        "generated_by": "scripts/build_gdd_notion_settings_from_notion.py",
        "databases_found": len(databases),
        "pages_found": len(pages),
        "pages_skipped_as_database_children": pages_skipped_db_children,
        "sources_written": len(sources),
    }
    SNAPSHOT_OUT.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    logger.info(
        "Écrit %s (%d sources : %d bases, %d pages ; %d pages ignorées car lignes de bases).",
        SETTINGS_OUT,
        len(sources),
        len(databases),
        len(pages),
        pages_skipped_db_children,
    )


if __name__ == "__main__":
    main()

"""Intégration réseau : même pipeline que le test UI « une ligne » (Espèces).

Ce test appelle :meth:`GddNotionSyncService.preview_database_first_row` avec
``category_file="Espèces.json"``, comme l’endpoint
``POST /api/v1/gdd-notion-sync/preview-database-row``.

Prérequis : variable d’environnement ``NOTION_API_KEY`` (ou fichier token du
store ; ici on s’appuie sur l’env pour CI / agents).

Le corps est lu via ``GET /v1/pages/{id}/markdown`` (Notion-Version 2026-03-11)
en priorité ; voir ``docs/notion_public_api_block_gap.md``.

Marqueurs : ``integration`` + ``slow`` (hors fumée T0 par défaut).
"""
from __future__ import annotations

import os
import unicodedata
from pathlib import Path

import pytest

from services.gdd_notion_sync_config_store import GddNotionSyncConfigStore
from services.gdd_notion_sync_service import GddNotionSyncService

# ID base « Espèces » — ``data/gdd_notion_sync/settings.json`` (category_file Espèces.json).
ESPECES_NOTION_DATABASE_ID = "1886e4d2-1b45-81e9-a768-df06185c1aea"

# Seuil : une vraie section narrative (histoire / apparence / rôle intrigue) doit porter du texte,
# pas seulement un titre ou une ligne vide (bug sync callouts / blocs).
_MIN_NARRATIVE_SECTION_CHARS = 180


def _normal_title(title: str) -> str:
    """Normalise pour comparaison insensible aux accents."""
    decomposed = unicodedata.normalize("NFKD", title.lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _is_narrative_section_title(title: str) -> bool:
    """Titres de callouts « verts » typiques des fiches Espèces (histoire, apparence, intrigue)."""
    nt = _normal_title(title)
    if "histoire" in nt and "espece" in nt.replace(" ", ""):
        return True
    if "apparence" in nt:
        return True
    if "intrigue" in nt and "role" in nt:
        return True
    return False


def _slug_suggests_narrative_section(slug: str) -> bool:
    """Détecte les slugs issus de ``## Histoire…`` / ``## Apparence`` même sans ``section_titles``."""
    nt = _normal_title(slug.replace("_", " "))
    compact = nt.replace(" ", "")
    if "histoire" in nt and "espece" in compact:
        return True
    if "apparence" in nt:
        return True
    if "intrigue" in nt and "role" in nt:
        return True
    return False


def _max_narrative_body_len(record: dict) -> tuple[int, str, str]:
    """Retourne (longueur max, slug, titre) parmi les sections narratives identifiées.

    On parcourt ``sections`` (pas seulement ``section_titles``) : Notion peut produire des
    blocs ``## Titre`` sans corps ; le découpeur n’alors aucune entrée titre, mais les
    sections avec corps ont toujours un slug.
    """
    sections = record.get("sections") if isinstance(record.get("sections"), dict) else {}
    titles = (
        record.get("section_titles")
        if isinstance(record.get("section_titles"), dict)
        else {}
    )
    best_len = 0
    best_slug = ""
    best_title = ""
    for slug, body in sections.items():
        if not isinstance(body, str):
            continue
        display = titles.get(slug)
        if not isinstance(display, str):
            display = str(slug).replace("_", " ")
        if not (
            _is_narrative_section_title(display)
            or _slug_suggests_narrative_section(str(slug))
        ):
            continue
        n = len(body.strip())
        if n > best_len:
            best_len = n
            best_slug = str(slug)
            best_title = display
    return best_len, best_slug, best_title


@pytest.fixture
def notion_api_key() -> str:
    key = os.getenv("NOTION_API_KEY", "").strip()
    if not key:
        pytest.skip("NOTION_API_KEY absent : test d’intégration Notion ignoré.")
    return key


@pytest.fixture
def especes_preview_service(tmp_path: Path, notion_api_key: str) -> GddNotionSyncService:
    """Service minimal avec source Espèces uniquement (même ``notion_id`` que settings prod)."""
    settings_path = tmp_path / "settings.json"
    token_path = tmp_path / "token.secret"
    store = GddNotionSyncConfigStore(settings_path, token_path)
    store.save_settings(
        {
            "schema_version": 1,
            "sync_interval_minutes": 60,
            "auto_sync_enabled": False,
            "sources": [
                {
                    "kind": "database",
                    "notion_id": ESPECES_NOTION_DATABASE_ID,
                    "category_file": "Espèces.json",
                }
            ],
            "included_categories": [],
        }
    )
    # Fichier token : même mécanisme que l’UI (read_token lit fichier puis env).
    store.write_token(notion_api_key)
    gdd = tmp_path / "gdd"
    gdd.mkdir(parents=True, exist_ok=True)
    return GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd,
        status_path=tmp_path / "status.json",
    )


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_especes_preview_first_row_has_narrative_sections(
    especes_preview_service: GddNotionSyncService,
) -> None:
    """Test « une ligne » Espèces : la première fiche Notion doit exposer du narratif dans ``sections``.

    On ne fige pas le ``Nom`` attendu : l’ordre de tri Notion peut changer. L’assertion
    porte sur la présence de sections Histoire / Apparence / Rôle dans l’intrigue avec
    assez de corps (comportement observé en UI avant correctif sync callouts).
    """
    raw = await especes_preview_service.preview_database_first_row(
        category_file="Espèces.json",
        request_id="pytest-especes-preview-first-row",
    )
    assert raw.get("ok") is True, raw.get("message", raw)
    assert int(raw.get("query_total_rows") or 0) >= 1, "Base Espèces vide ou inaccessible."

    rec = raw.get("mapped_record")
    assert isinstance(rec, dict), "mapped_record manquant."
    nom = str(rec.get("Nom") or "").strip()
    assert nom, "La première ligne de la base Espèces doit avoir un champ Nom non vide."

    max_len, slug, title = _max_narrative_body_len(rec)
    assert max_len >= _MIN_NARRATIVE_SECTION_CHARS, (
        f"Fiche « {nom} » : aucune section narrative (Histoire / Apparence / Rôle intrigue) "
        f"n’a au moins {_MIN_NARRATIVE_SECTION_CHARS} caractères : max observé = {max_len} "
        f"(slug={slug!r}, titre={title!r}). "
        "Cela correspond au bug de sync (callouts sans enfants côté API ou titres sans corps)."
    )

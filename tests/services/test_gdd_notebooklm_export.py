"""Tests export Markdown NotebookLM depuis le GDD local."""
from __future__ import annotations

import json
import uuid
import zipfile
from io import BytesIO
from pathlib import Path

from services.gdd_notebooklm_export import (
    build_gdd_notebooklm_zip_bytes,
    build_notebooklm_markdown_parts,
    eligible_sync_category_files,
)


def _nid() -> str:
    return str(uuid.uuid4())


def test_eligible_disk_category_files_ignores_included_filter(tmp_path: Path) -> None:
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "A.json").write_text("[]", encoding="utf-8")
    (gdd / "B.json").write_text("[]", encoding="utf-8")
    settings = {
        "sources": [
            {"kind": "database", "category_file": "A.json", "notion_id": _nid()},
            {"kind": "page", "category_file": "B.json", "notion_id": _nid()},
            {"kind": "database", "category_file": "C.json", "notion_id": _nid()},
        ],
        "included_categories": ["A.json"],
    }
    from services.gdd_notebooklm_export import eligible_disk_category_files

    assert eligible_disk_category_files(settings, gdd) == ["A.json", "B.json"]


def test_build_zip_disk_scope_includes_all_on_disk_despite_included_filter(tmp_path: Path) -> None:
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "A.json").write_text(
        json.dumps([{"Nom": "A1", "sections": {"x": "y"}}], ensure_ascii=False),
        encoding="utf-8",
    )
    (gdd / "B.json").write_text(
        json.dumps([{"Nom": "B1", "sections": {"x": "z"}}], ensure_ascii=False),
        encoding="utf-8",
    )
    settings = {
        "sources": [
            {"kind": "database", "category_file": "A.json", "notion_id": _nid()},
            {"kind": "page", "category_file": "B.json", "notion_id": _nid()},
        ],
        "included_categories": ["A.json"],
    }
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
        export_scope="disk",
    )
    body = "\n".join(t for _, t in parts)
    assert "A1" in body and "B1" in body
    parts_sync = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
        export_scope="sync",
    )
    body_sync = "\n".join(t for _, t in parts_sync)
    assert "A1" in body_sync
    assert "B1" not in body_sync


def test_eligible_sync_category_files_respects_included() -> None:
    settings = {
        "sources": [
            {"kind": "database", "category_file": "A.json", "notion_id": _nid()},
            {"kind": "page", "category_file": "B.json", "notion_id": _nid()},
            {"kind": "database", "category_file": "C.json", "notion_id": _nid()},
        ],
        "included_categories": ["A.json"],
    }
    assert eligible_sync_category_files(settings) == ["A.json"]


def test_build_zip_contains_markdown_and_vision(tmp_path: Path) -> None:
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "Pitch.json").write_text(
        json.dumps(
            [
                {
                    "Nom": "Pitch",
                    "sections": {"x": "Hello"},
                    "section_titles": {"x": "Intro"},
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    (data_dir / "Vision.json").write_text(
        json.dumps({"ok": True}, ensure_ascii=False),
        encoding="utf-8",
    )
    settings = {
        "sources": [
            {
                "kind": "page",
                "category_file": "Pitch.json",
                "notion_id": _nid(),
            }
        ],
        "included_categories": [],
    }
    raw = build_gdd_notebooklm_zip_bytes(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
    )
    zf = zipfile.ZipFile(BytesIO(raw))
    names = zf.namelist()
    md_names = [n for n in names if n.endswith(".md")]
    assert 1 <= len(md_names) <= 128
    assert not any(n.endswith("00-README.md") for n in names)
    # Pitch page → bucket production (fallback), seul fichier du ZIP
    prod = next(n for n in names if "production" in n)
    body = zf.read(prod).decode("utf-8")
    assert "Pitch" in body
    assert "Hello" in body
    assert '"ok": true' in body
    assert "Export GDD (NotebookLM)" in body


def test_small_themes_merge_into_fewer_files(tmp_path: Path) -> None:
    """Les volets < 120 Ko sont fusionnés avec le thème suivant."""
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    for fname, nom in (("Musiques.json", "M1"), ("Pitch.json", "P1")):
        (gdd / fname).write_text(
            json.dumps([{"Nom": nom, "sections": {"a": "x" * 500}}], ensure_ascii=False),
            encoding="utf-8",
        )
    settings = {
        "sources": [
            {"kind": "page", "category_file": "Musiques.json", "notion_id": _nid()},
            {"kind": "page", "category_file": "Pitch.json", "notion_id": _nid()},
        ],
        "included_categories": [],
    }
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
    )
    assert len(parts) == 1
    name, body = parts[0]
    assert "art-audio" in name
    assert "production" in name
    assert "P1" in body and "M1" in body


def test_values_included_in_markdown_output(tmp_path: Path) -> None:
    """Les métadonnées ``values`` apparaissent dans le Markdown généré.

    Utilise ``Piliers.json`` (catégorie monolithique, hors liste shards) pour
    que ``eligible_disk_category_files`` détecte le fichier directement.
    """
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "Piliers.json").write_text(
        json.dumps(
            [
                {
                    "Nom": "Uresaïr",
                    "sections": {"intro": "Un guerrier."},
                    "values": {"Espece": "VanDoei", "Occupation": "Gardien"},
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    settings = {
        "sources": [{"kind": "page", "category_file": "Piliers.json", "notion_id": _nid()}],
        "included_categories": [],
    }
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
    )
    body = "\n".join(t for _, t in parts)
    assert "Espece" in body
    assert "VanDoei" in body
    assert "Occupation" in body
    assert "Gardien" in body


def test_uuid_in_values_resolved_via_relation_index(tmp_path: Path) -> None:
    """Les UUID dans ``values`` sont remplacés par leur Nom via l'index.

    L'index utilise le format UUID canonique avec tirets (sortie de normalize_notion_id).
    """
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    uid = "1a16e4d2-1b45-8051-88d9-d744a1bbc095"
    (gdd / "Piliers.json").write_text(
        json.dumps(
            [{"Nom": "Uresair", "sections": {}, "values": {"Espece": uid}}],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    settings = {
        "sources": [{"kind": "page", "category_file": "Piliers.json", "notion_id": _nid()}],
        "included_categories": [],
    }
    relation_index = {uid: "VanDoei"}
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
        relation_index=relation_index,
    )
    body = "\n".join(t for _, t in parts)
    assert "VanDoei" in body
    assert uid not in body


def test_uuid_not_in_index_kept_as_is(tmp_path: Path) -> None:
    """UUID absent de l'index → conservé tel quel (pas de perte silencieuse)."""
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    uid = "00000000-0000-4000-8000-000000000001"
    (gdd / "Piliers.json").write_text(
        json.dumps(
            [{"Nom": "Quelque part", "sections": {}, "values": {"Lie a": uid}}],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    settings = {
        "sources": [{"kind": "page", "category_file": "Piliers.json", "notion_id": _nid()}],
        "included_categories": [],
    }
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
        relation_index={},
    )
    body = "\n".join(t for _, t in parts)
    assert uid in body


def test_skill_pages_excluded_from_disk_export(tmp_path: Path) -> None:
    """Les pages Skill Notion IA sont exclues des exports quel que soit le mode."""
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "Piliers.json").write_text(
        json.dumps([{"Nom": "Contenu GDD", "sections": {"x": "y"}}], ensure_ascii=False),
        encoding="utf-8",
    )
    for skill_file in ("Skills.json", "Gestion_de_personnages.json", "Skill___Initialisation.json"):
        (gdd / skill_file).write_text(
            json.dumps([{"Nom": "Skill tool", "sections": {}}], ensure_ascii=False),
            encoding="utf-8",
        )
    skill_sources = [
        {"kind": "page", "category_file": "Skills.json", "notion_id": _nid()},
        {"kind": "page", "category_file": "Gestion_de_personnages.json", "notion_id": _nid()},
        {"kind": "page", "category_file": "Skill___Initialisation.json", "notion_id": _nid()},
    ]
    settings = {
        "sources": [
            {"kind": "page", "category_file": "Piliers.json", "notion_id": _nid()},
            *skill_sources,
        ],
        "included_categories": ["Piliers.json", "Skills.json", "Gestion_de_personnages.json"],
    }

    from services.gdd_notebooklm_export import (
        eligible_disk_category_files,
        eligible_sync_category_files,
    )

    disk_eligible = eligible_disk_category_files(settings, gdd)
    assert "Skills.json" not in disk_eligible
    assert "Gestion_de_personnages.json" not in disk_eligible
    assert "Skill___Initialisation.json" not in disk_eligible
    assert "Piliers.json" in disk_eligible

    sync_eligible = eligible_sync_category_files(settings, gdd_root=gdd)
    assert "Skills.json" not in sync_eligible
    assert "Gestion_de_personnages.json" not in sync_eligible
    assert "Piliers.json" in sync_eligible

    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=64,
    )
    body = "\n".join(t for _, t in parts)
    assert "Skill tool" not in body
    assert "Contenu GDD" in body


def test_skill_pages_excluded_by_content(tmp_path: Path) -> None:
    """Pages Skill à noms arbitraires (ex. Recherche_Deep_Dive) exclues par contenu."""
    from services.gdd_notebooklm_export import eligible_disk_category_files

    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    # Contenu GDD légitime (aucune signature skill)
    (gdd / "Piliers.json").write_text(
        json.dumps([{"Nom": "Pilier narratif", "sections": {"intro": "Bienvenue"}}], ensure_ascii=False),
        encoding="utf-8",
    )
    # Page skill à nom quelconque : preamble + outils_requis
    (gdd / "Recherche_Deep_Dive.json").write_text(
        json.dumps(
            [{"Nom": "Recherche Deep Dive", "sections": {"preamble": "Skill IA.", "outils_requis": "search, view"}}],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    # Page skill à nom quelconque : quand_utiliser_ce_skill
    (gdd / "Game_Design_Skill.json").write_text(
        json.dumps(
            [{"Nom": "Game Design", "sections": {"quand_utiliser_ce_skill": "Toujours.", "workflow": "..."}}],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    settings = {
        "sources": [
            {"kind": "page", "category_file": "Piliers.json", "notion_id": _nid()},
            {"kind": "page", "category_file": "Recherche_Deep_Dive.json", "notion_id": _nid()},
            {"kind": "page", "category_file": "Game_Design_Skill.json", "notion_id": _nid()},
        ],
        "included_categories": ["Piliers.json", "Recherche_Deep_Dive.json", "Game_Design_Skill.json"],
    }

    disk_eligible = eligible_disk_category_files(settings, gdd)
    assert "Piliers.json" in disk_eligible
    assert "Recherche_Deep_Dive.json" not in disk_eligible, "preamble+outils_requis doit exclure"
    assert "Game_Design_Skill.json" not in disk_eligible, "quand_utiliser_ce_skill doit exclure"

    sync_eligible = eligible_sync_category_files(settings, gdd_root=gdd)
    assert "Piliers.json" in sync_eligible
    assert "Recherche_Deep_Dive.json" not in sync_eligible
    assert "Game_Design_Skill.json" not in sync_eligible


def test_competences_not_excluded(tmp_path: Path) -> None:
    """Compétences.json (données de jeu) n'est PAS exclu par le filtre Skill."""
    from services.gdd_notebooklm_export import eligible_disk_category_files

    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "Compétences.json").write_text(
        json.dumps([{"Nom": "Esquive", "sections": {}}], ensure_ascii=False),
        encoding="utf-8",
    )
    settings = {
        "sources": [{"kind": "database", "category_file": "Compétences.json", "notion_id": _nid()}],
        "included_categories": [],
    }
    assert "Compétences.json" in eligible_disk_category_files(settings, gdd)


def test_oversized_bucket_emits_part_files_without_truncation(tmp_path: Path) -> None:
    """Catégorie monolithique (``Pitch.json``) : pas de dossier shard ``personnages/``."""
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir(parents=True)
    pad = "x" * 25_000
    records = [{"Nom": f"R{i}", "sections": {"a": pad}} for i in range(30)]
    (gdd / "Pitch.json").write_text(
        json.dumps(records, ensure_ascii=False),
        encoding="utf-8",
    )
    settings = {
        "sources": [
            {
                "kind": "page",
                "category_file": "Pitch.json",
                "notion_id": _nid(),
            }
        ],
        "included_categories": [],
    }
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=128,
        max_chars_per_part=80_000,
    )
    names = [n for n, _ in parts]
    assert any(n.startswith("08-production-et-autres-part") for n in names), names
    assert all("Export tronqué" not in t for _, t in parts)
    raw = build_gdd_notebooklm_zip_bytes(
        gdd_root=gdd,
        project_root=tmp_path,
        settings=settings,
        max_files=128,
    )
    zf = zipfile.ZipFile(BytesIO(raw))
    md_all = "".join(zf.read(n).decode("utf-8") for n in zf.namelist() if n.endswith(".md"))
    assert "Export tronqué" not in md_all

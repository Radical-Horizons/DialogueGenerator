"""Catalogues Unity versionnés (Skill / Trait) — smoke de présence et chargement."""
import json
from pathlib import Path

from services.skill_check_catalog import load_skill_entries
from services.trait_catalog_service import TraitCatalogService

ROOT = Path(__file__).resolve().parents[2]
UNITY = ROOT / "data" / "UnityData"


def test_skill_catalog_csv_present_and_loads() -> None:
    """SkillCatalog.csv versionné se charge avec des compétences GDD."""
    path = UNITY / "SkillCatalog.csv"
    assert path.is_file(), f"absent: {path}"
    entries = load_skill_entries(path)
    assert len(entries) >= 50
    ids = {entry.id for entry in entries}
    assert "Rhétorique" in ids


def test_trait_catalog_matches_notion_qualities_and_flaws() -> None:
    """TraitCatalog.csv reprend exactement les bases Notion Qualités et Défauts.

    Le Notion fait autorité (page « Traits de caractère ») : pas de trait inventé, pas
    de trait oublié. Régénérer avec ``python -m scripts.generate_unity_catalogs_from_gdd``.
    """
    path = UNITY / "TraitCatalog.csv"
    assert path.is_file(), f"absent: {path}"
    gdd = ROOT / "data" / "GDD_categories"
    notion_names = {
        record["Nom"]
        for name in ("Qualités.json", "Défauts.json")
        for record in json.loads((gdd / name).read_text(encoding="utf-8"))
    }
    assert set(TraitCatalogService(path).get_trait_labels()) == notion_names

"""Catalogues Unity versionnés (Skill / Trait) — smoke de présence et chargement."""
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


def test_trait_catalog_csv_present_and_loads() -> None:
    """TraitCatalog.csv versionné se charge avec des axes bipolaires."""
    path = UNITY / "TraitCatalog.csv"
    assert path.is_file(), f"absent: {path}"
    traits = TraitCatalogService(path).load_traits()
    assert len(traits) >= 5
    labels = TraitCatalogService(path).get_trait_labels()
    assert "Courage" in labels
    assert "Lâcheté" in labels

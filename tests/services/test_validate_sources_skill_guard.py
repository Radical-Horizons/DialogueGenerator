"""Tests garde validate_sources : refus des pages Skill Notion IA."""
from __future__ import annotations

from pathlib import Path

import pytest

from services.gdd_notion_sync_config_store import GddNotionSyncConfigStore


@pytest.fixture
def store(tmp_path: Path) -> GddNotionSyncConfigStore:
    return GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")


def _src(category_file: str, kind: str = "page") -> dict:
    return {
        "kind": kind,
        "category_file": category_file,
        "notion_id": "00000000-0000-0000-0000-000000000001",
    }


@pytest.mark.parametrize(
    "skill_file",
    [
        "Skills.json",
        "Gestion_de_personnages.json",
        "Gestion_de_Lieux.json",
        "Skill___Initialisation.json",
        "Gestion_d'Espèces_civilisées.json",
    ],
)
def test_validate_sources_rejects_skill_by_name(store: GddNotionSyncConfigStore, skill_file: str) -> None:
    """validate_sources lève ValueError pour toute source identifiée comme Skill Notion IA par nom."""
    with pytest.raises(ValueError, match="Skill Notion IA"):
        store.validate_sources([_src("Personnages.json", kind="database"), _src(skill_file)])


def test_validate_sources_accepts_legit_sources(store: GddNotionSyncConfigStore) -> None:
    """Sources légitimes (Personnages, Lieux, Compétences…) ne lèvent pas d'exception."""
    legit = [
        _src("Personnages.json", kind="database"),
        _src("Lieux.json", kind="database"),
        _src("Piliers.json"),
        _src("Compétences.json", kind="database"),
        _src("Compétences_de_perso.json", kind="database"),
    ]
    store.validate_sources(legit)  # Ne doit pas lever

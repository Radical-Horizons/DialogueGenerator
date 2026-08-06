"""Tests du jeu de cas de départ du benchmark.

Le risque principal n'est pas qu'une suite soit invalide — Pydantic le dirait —
mais qu'elle cite une entité GDD sous un nom approximatif. Le pipeline ne lève
alors aucune erreur : il construit un contexte vide et le run entier mesure des
générations sans matière. C'est cette classe de défaut que ce fichier attrape.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Set

import pytest

from api.schemas.benchmark import BenchmarkSuite
from services.benchmark_suite_seed import (
    MAX_CHOICES,
    MAX_WORDS_PER_PANEL,
    MIN_CHOICES,
    PLAYER_CHARACTER,
    SMOKE_SUITE_ID,
    STANDARD_SUITE_ID,
    default_suites,
    referenced_gdd_entities,
)
from services.benchmark_suite_store import BenchmarkSuiteStore

GDD_ROOT = Path(__file__).resolve().parents[2] / "data" / "GDD_categories"


def _gdd_names(category: str) -> Set[str]:
    """Relève les noms canoniques présents sur disque pour une catégorie GDD.

    Args:
        category: Sous-répertoire de ``data/GDD_categories/``.

    Returns:
        Ensemble des valeurs du champ ``Nom``.
    """
    names: Set[str] = set()
    directory = GDD_ROOT / category
    if not directory.exists():
        return names
    for path in directory.glob("*.json"):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        records = raw if isinstance(raw, list) else [raw]
        for record in records:
            if isinstance(record, dict) and record.get("Nom"):
                names.add(record["Nom"])
    return names


def test_seed_suites_are_structurally_valid() -> None:
    """Les deux suites de départ se valident et portent le nombre de cas annoncé."""
    suites = {suite.suite_id: suite for suite in default_suites()}
    assert set(suites) == {SMOKE_SUITE_ID, STANDARD_SUITE_ID}
    assert len(suites[SMOKE_SUITE_ID].cases) == 3
    assert len(suites[STANDARD_SUITE_ID].cases) == 5


@pytest.mark.parametrize("category", ["personnages", "lieux", "especes"])
def test_every_referenced_entity_exists_in_the_gdd(category: str) -> None:
    """Chaque entité citée existe sous son nom canonique exact.

    Un nom approximatif — apostrophe droite au lieu de courbe, casse différente —
    ne produit aucune erreur au runtime : le contexte est simplement vide.
    """
    available = _gdd_names(category)
    if not available:
        pytest.skip(f"Catégorie GDD '{category}' absente de ce poste")
    missing = [name for name in referenced_gdd_entities()[category] if name not in available]
    assert not missing, f"Entités absentes du GDD ({category}) : {missing}"


def test_no_case_loads_two_full_character_sheets() -> None:
    """Une seule fiche complète par cas.

    Les fiches font 56k à 109k caractères : deux d'entre elles saturent le budget
    de contexte et tronquent tout le reste, y compris le lieu de la scène.
    """
    for suite in default_suites():
        for case in suite.cases:
            selections = case.request.context_selections
            assert len(selections.characters_full) == 1, case.case_id
            assert len(selections.locations_full) == 0, case.case_id
            assert len(selections.species_full) == 0, case.case_id


def test_player_character_is_always_uresair_in_excerpt() -> None:
    """Uresaïr est le seul PJ du first playable, et n'est jamais le locuteur."""
    for suite in default_suites():
        for case in suite.cases:
            selections = case.request.context_selections
            assert case.request.player_character_id == PLAYER_CHARACTER, case.case_id
            assert selections.characters_excerpt == [PLAYER_CHARACTER], case.case_id
            assert case.request.npc_speaker_id != PLAYER_CHARACTER, case.case_id


def test_scene_location_is_always_supplied() -> None:
    """Chaque cas situe sa scène : un dialogue hors lieu ne mesure pas le bon travail."""
    for suite in default_suites():
        for case in suite.cases:
            assert case.request.context_selections.locations_excerpt, case.case_id


def test_expectations_match_the_game_system_constraints() -> None:
    """Les attentes reprennent les contraintes chiffrées du système de dialogue."""
    for suite in default_suites():
        for case in suite.cases:
            expectations = case.expectations
            assert expectations is not None, case.case_id
            assert expectations.min_choices == MIN_CHOICES, case.case_id
            assert expectations.max_choices == MAX_CHOICES, case.case_id
            assert expectations.max_words == MAX_WORDS_PER_PANEL, case.case_id


def test_standard_suite_covers_the_category_axes() -> None:
    """La suite standard couvre plusieurs valeurs sur chaque axe de découpage.

    Un axe à valeur unique ne découpe rien : le rapport par catégorie serait
    formellement présent et informativement vide.
    """
    standard = next(s for s in default_suites() if s.suite_id == STANDARD_SUITE_ID)
    values: Dict[str, Set[str]] = {}
    for case in standard.cases:
        for axis, value in case.categories.items():
            values.setdefault(axis, set()).add(value)
    for axis in ("fonction", "ton", "contexte", "personnage"):
        assert len(values.get(axis, set())) >= 2, f"Axe '{axis}' sans variation"


def test_narration_mode_is_not_a_case_category() -> None:
    """Les didascalies relèvent du mode de run, jamais d'un axe de cas.

    Les porter par cas obligerait à dupliquer chaque scène et doublerait le coût
    de la suite pour un axe qui s'observe en comparant deux runs.
    """
    for suite in default_suites():
        for case in suite.cases:
            assert "didascalies" not in case.categories, case.case_id


def test_smoke_suite_reuses_standard_cases_verbatim() -> None:
    """La suite de fumée est un sous-ensemble strict de la standard.

    Si ses cas divergeaient, un essai de fumée validerait une chaîne que le run
    complet n'emprunte pas.
    """
    suites = {suite.suite_id: suite for suite in default_suites()}
    standard = {case.case_id: case for case in suites[STANDARD_SUITE_ID].cases}
    for case in suites[SMOKE_SUITE_ID].cases:
        assert case.case_id in standard
        assert case.model_dump(mode="json") == standard[case.case_id].model_dump(mode="json")


class TestSeeding:
    """Amorçage du magasin de suites."""

    def test_fresh_store_is_seeded(self, tmp_path: Path) -> None:
        """Un poste neuf dispose des suites de départ sans configuration préalable."""
        store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
        store.ensure_seeded()
        listed = {summary.suite_id for summary in store.list_suites()}
        assert listed == {SMOKE_SUITE_ID, STANDARD_SUITE_ID}

    def test_existing_suite_is_never_overwritten(self, tmp_path: Path) -> None:
        """Une suite maison déjà présente empêche le semis."""
        store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
        mine = BenchmarkSuite.model_validate(
            {
                "suite_id": "maison",
                "cases": [
                    {
                        "case_id": "c1",
                        "request": {
                            "user_instructions": "Écris un panneau.",
                            "context_selections": {"characters_full": [PLAYER_CHARACTER]},
                        },
                    }
                ],
            }
        )
        store.save_suite(mine)
        store.ensure_seeded()
        assert {summary.suite_id for summary in store.list_suites()} == {"maison"}

    def test_deleted_seed_suite_does_not_reappear(self, tmp_path: Path) -> None:
        """Supprimer une suite semée est une décision : le marqueur la respecte."""
        store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
        store.ensure_seeded()
        assert store.delete_suite(SMOKE_SUITE_ID) is True
        store.ensure_seeded()
        assert {summary.suite_id for summary in store.list_suites()} == {STANDARD_SUITE_ID}

    def test_seeded_suites_start_at_version_one(self, tmp_path: Path) -> None:
        """Le semis n'incrémente pas la version : la suite livrée est la version 1."""
        store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
        store.ensure_seeded()
        assert store.get_suite(STANDARD_SUITE_ID).version == 1

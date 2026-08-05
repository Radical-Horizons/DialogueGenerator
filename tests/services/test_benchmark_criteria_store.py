"""Tests du magasin de grilles de critères du benchmark."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from api.schemas.benchmark_judging import CriteriaGrid, CriterionDefinition
from services.benchmark_criteria_seed import DEFAULT_GRID_ID, default_grid_payload
from services.benchmark_criteria_store import (
    BenchmarkCriteriaStore,
    CriteriaGridInvalidError,
    CriteriaGridNotFoundError,
)


def _criterion(criterion_id: str = "voice_fidelity", **overrides: object) -> CriterionDefinition:
    """Critère minimal valide."""
    payload = {
        "criterion_id": criterion_id,
        "label": "Justesse de la voix",
        "description": "Le personnage parle comme sa fiche le décrit.",
    }
    payload.update(overrides)
    return CriterionDefinition.model_validate(payload)


@pytest.fixture
def store(tmp_path: Path) -> BenchmarkCriteriaStore:
    """Magasin isolé."""
    return BenchmarkCriteriaStore(criteria_dir=tmp_path / "criteria")


def test_empty_grid_is_rejected() -> None:
    """Une grille vide produirait des scores qui ne veulent rien dire."""
    with pytest.raises(ValidationError):
        CriteriaGrid(grid_id="vide", criteria=[])


def test_duplicate_criterion_ids_are_rejected() -> None:
    """Deux critères de même identifiant rendraient l'appariement ambigu."""
    with pytest.raises(ValidationError):
        CriteriaGrid(grid_id="doublons", criteria=[_criterion(), _criterion()])


def test_criterion_id_alphabet_is_constrained() -> None:
    """Un identifiant stable ne contient ni espace, ni accent, ni majuscule."""
    with pytest.raises(ValidationError):
        _criterion("Justesse de la Voix")


def test_seed_grid_is_written_on_explicit_seeding(store: BenchmarkCriteriaStore) -> None:
    """Un poste neuf peut juger sans configuration préalable."""
    store.ensure_seeded()
    grids = store.list_grids()
    assert [grid.grid_id for grid in grids] == [DEFAULT_GRID_ID]
    assert grids[0].criterion_count == len(default_grid_payload()["criteria"])


def test_reads_never_write_to_disk(store: BenchmarkCriteriaStore) -> None:
    """Une lecture n'amorce pas : un GET ne doit pas provoquer d'écriture.

    Les endpoints de lecture des grilles sont ouverts ; y déclencher une écriture
    exposerait le disque à un appelant anonyme.
    """
    assert store.list_grids() == []
    with pytest.raises(CriteriaGridNotFoundError):
        store.get_grid(DEFAULT_GRID_ID)
    assert not store.criteria_dir.exists() or not list(store.criteria_dir.glob("*.json"))


def test_seed_never_overwrites_an_existing_grid(store: BenchmarkCriteriaStore) -> None:
    """L'amorçage ne rétablit pas des critères délibérément retirés."""
    store.save_grid(CriteriaGrid(grid_id="maison", criteria=[_criterion()]))
    store.ensure_seeded()
    assert {grid.grid_id for grid in store.list_grids()} == {"maison"}


def test_deleting_the_last_grid_does_not_resurrect_the_seed(
    store: BenchmarkCriteriaStore,
) -> None:
    """Supprimer la dernière grille ne fait pas renaître la grille d'usine.

    Décider d'amorcer sur la vacuité du répertoire contredirait l'intention d'une
    suppression : un marqueur sur disque tranche à la place.
    """
    store.ensure_seeded()
    assert store.delete_grid(DEFAULT_GRID_ID) is True
    store.ensure_seeded()
    assert store.list_grids() == []


def test_save_then_get_roundtrip(store: BenchmarkCriteriaStore) -> None:
    """Une grille écrite est relue à l'identique."""
    saved = store.save_grid(
        CriteriaGrid(grid_id="maison", name="Maison", criteria=[_criterion()])
    )
    loaded = store.get_grid("maison")
    assert loaded.version == saved.version
    assert loaded.criterion_ids() == ["voice_fidelity"]


def test_save_bumps_version(store: BenchmarkCriteriaStore) -> None:
    """Chaque écriture incrémente la version — un run enregistre celle qu'il a employée."""
    first = store.save_grid(CriteriaGrid(grid_id="maison", criteria=[_criterion()]))
    second = store.save_grid(
        CriteriaGrid(grid_id="maison", criteria=[_criterion("french_correctness")])
    )
    assert (first.version, second.version) == (1, 2)


def test_get_with_wrong_version_is_rejected(store: BenchmarkCriteriaStore) -> None:
    """Demander une version absente échoue explicitement."""
    store.save_grid(CriteriaGrid(grid_id="maison", criteria=[_criterion()]))
    with pytest.raises(CriteriaGridInvalidError):
        store.get_grid("maison", version=99)


def test_missing_grid_raises_not_found(store: BenchmarkCriteriaStore) -> None:
    """Une grille absente ne retourne pas une grille vide silencieuse."""
    with pytest.raises(CriteriaGridNotFoundError):
        store.get_grid("inconnue")


def test_path_traversal_grid_id_is_rejected(store: BenchmarkCriteriaStore) -> None:
    """Un identifiant de grille ne peut pas sortir du répertoire de stockage."""
    with pytest.raises(CriteriaGridInvalidError):
        store.get_grid("../../etc/passwd")


def test_windows_reserved_grid_id_is_rejected(store: BenchmarkCriteriaStore) -> None:
    """`NUL.json` est le périphérique nul : l'écriture serait avalée sans erreur."""
    with pytest.raises(CriteriaGridInvalidError):
        store.save_grid(CriteriaGrid(grid_id="NUL", criteria=[_criterion()]))


def test_delete_grid(store: BenchmarkCriteriaStore) -> None:
    """La suppression est effective et son retour distingue les deux cas."""
    store.save_grid(CriteriaGrid(grid_id="maison", criteria=[_criterion()]))
    assert store.delete_grid("maison") is True
    assert store.delete_grid("maison") is False


def test_seed_grid_carries_directions_and_weights() -> None:
    """La grille de départ porte des critères négatifs et pondère le français.

    Le sens vient de la donnée : un critère négatif reste négatif quel que soit
    son libellé, et « correction du français » doit peser plus que la moyenne.
    """
    grid = CriteriaGrid.model_validate(default_grid_payload())
    by_id = {criterion.criterion_id: criterion for criterion in grid.criteria}

    negatives = [c for c in grid.criteria if c.direction == "lower_is_better"]
    assert len(negatives) >= 5, "la grille de départ compte cinq critères négatifs"
    assert by_id["ai_tics"].direction == "lower_is_better"

    french = by_id["french_correctness"]
    others = [c.weight for c in grid.criteria if c.criterion_id != "french_correctness"]
    assert french.weight >= max(others), "le français doit peser au moins autant que le reste"

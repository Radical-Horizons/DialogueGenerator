"""Une installation déjà semée ne doit pas garder un barème périmé pour toujours.

Le marqueur disait seulement « seeded ». L'effet voulu : supprimer la dernière
grille ne la fait pas renaître. L'effet non voulu : le 2026-10-01, la grille passe
en v2 et les suites gagnent des cas, mais un poste ancien continuerait de mesurer
sous la v1 **sans rien signaler**. Pour les suites c'est plus grave encore : leur
empreinte entre dans l'identité du run.

En portant l'empreinte du semis, le marqueur distingue les deux seuls cas qui
comptent — intact depuis le semis (remplaçable sans perte) ou touché (donnée
utilisateur, on n'y revient pas).
"""

from __future__ import annotations

from pathlib import Path

from api.schemas.benchmark_judging import CriteriaGrid
from services.benchmark_criteria_seed import DEFAULT_GRID_ID, default_grid_payload
from services.benchmark_criteria_store import BenchmarkCriteriaStore
from services.benchmark_seed_marker import SEED_MARKER_NAME, read_marker
from services.benchmark_suite_store import BenchmarkSuiteStore


def _store(tmp_path: Path) -> BenchmarkCriteriaStore:
    """Magasin de grilles sur un répertoire neuf."""
    return BenchmarkCriteriaStore(criteria_dir=tmp_path / "criteria")


def test_a_fresh_install_records_what_it_seeded(tmp_path: Path) -> None:
    """Le marqueur porte une empreinte, pas le mot « seeded »."""
    store = _store(tmp_path)
    store.ensure_seeded()

    recorded = read_marker(tmp_path / "criteria")

    assert DEFAULT_GRID_ID in recorded
    assert len(recorded[DEFAULT_GRID_ID]) == 16


def test_an_untouched_factory_grid_is_upgraded(tmp_path: Path) -> None:
    """Le cas qui motive tout : la grille du code a bougé, celle du disque non."""
    store = _store(tmp_path)
    ancienne = default_grid_payload()
    ancienne["version"] = 1
    ancienne["criteria"] = [
        c for c in ancienne["criteria"] if c["criterion_id"] != "unsupported_invention"
    ]
    store.save_grid(CriteriaGrid.model_validate(ancienne), bump_version=False)
    from services.benchmark_seed_marker import content_hash, write_marker

    write_marker(tmp_path / "criteria", {DEFAULT_GRID_ID: content_hash(ancienne)})

    store.ensure_seeded()

    montee = store.get_grid(DEFAULT_GRID_ID)
    assert montee.version == default_grid_payload()["version"]
    assert any(c.criterion_id == "unsupported_invention" for c in montee.criteria)


def test_a_hand_edited_grid_is_left_alone(tmp_path: Path) -> None:
    """Une grille repondérée à la main appartient à son auteur.

    L'écraser ferait mesurer sous un barème que personne n'a choisi — soit
    exactement le défaut qu'on corrige, retourné.
    """
    store = _store(tmp_path)
    store.ensure_seeded()
    grille = store.get_grid(DEFAULT_GRID_ID)
    retouchee = grille.model_dump(mode="json")
    retouchee["criteria"][0]["weight"] = 9.0
    store.save_grid(CriteriaGrid.model_validate(retouchee), bump_version=False)

    store.ensure_seeded()

    assert store.get_grid(DEFAULT_GRID_ID).criteria[0].weight == 9.0


def test_a_legacy_marker_blocks_any_upgrade(tmp_path: Path) -> None:
    """L'ancien marqueur ne dit rien de l'état du disque : dans le doute, on ne touche pas."""
    store = _store(tmp_path)
    ancienne = default_grid_payload()
    ancienne["version"] = 1
    store.save_grid(CriteriaGrid.model_validate(ancienne), bump_version=False)
    (tmp_path / "criteria" / SEED_MARKER_NAME).write_text("seeded", encoding="utf-8")

    store.ensure_seeded()

    assert store.get_grid(DEFAULT_GRID_ID).version == 1


def test_preexisting_grids_of_unknown_origin_are_never_replaced(tmp_path: Path) -> None:
    """Un répertoire déjà peuplé sans marqueur reçoit un marqueur **vide**.

    Sans empreinte consignée, aucune montée ne pourra jamais être autorisée —
    c'est l'intention.
    """
    store = _store(tmp_path)
    ancienne = default_grid_payload()
    ancienne["version"] = 1
    store.save_grid(CriteriaGrid.model_validate(ancienne), bump_version=False)

    store.ensure_seeded()

    assert read_marker(tmp_path / "criteria") == {}
    assert store.get_grid(DEFAULT_GRID_ID).version == 1


def test_a_deleted_suite_does_not_come_back(tmp_path: Path) -> None:
    """La suppression reste respectée, même quand le code a de nouvelles suites."""
    suites = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
    suites.ensure_seeded()
    ids = {s.suite_id for s in suites.list_suites()}
    victime = sorted(ids)[0]
    (tmp_path / "suites" / f"{victime}.json").unlink()

    suites.ensure_seeded()

    assert victime not in {s.suite_id for s in suites.list_suites()}


def test_untouched_suites_follow_the_code(tmp_path: Path) -> None:
    """Les suites montent comme la grille : leur empreinte est dans l'identité du run."""
    from services.benchmark_seed_marker import content_hash, write_marker
    from services.benchmark_suite_seed import default_suites

    suites = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
    reference = {s.suite_id: s for s in default_suites()}
    cible = sorted(reference)[0]
    amputee = reference[cible].model_copy(
        update={"cases": reference[cible].cases[:1], "version": 1}
    )
    suites.save_suite(amputee, bump_version=False)
    # L'empreinte porte sur le document **relu** : l'aller-retour disque n'est pas
    # l'identite (un validateur remplit `reasoning_summary`), et la production
    # compare toujours des formes relues.
    write_marker(
        tmp_path / "suites",
        {cible: content_hash(suites.get_suite(cible).model_dump(mode="json"))},
    )

    suites.ensure_seeded()

    assert len(suites.get_suite(cible).cases) == len(reference[cible].cases)

"""L'invention hors contexte se mesure à part, et se lit.

Jusqu'à la v2 de la grille, `context_fidelity` disait au juge l'inverse de ce
qu'on attend de lui : « inventer du neuf non contradictoire n'est pas pénalisé
ici ». Trois verdicts sur vingt du run `20260921T144810` signalaient une
invention et ne la sanctionnaient pas, par obligation.

Deux besoins distincts, donc deux critères : une contradiction du monde rend la
génération inutilisable, une invention heureuse est un cadeau à récupérer. Fondus
dans une seule note, un 6 ne voulait plus rien dire.
"""

from __future__ import annotations

from api.schemas.benchmark_judging import CriteriaGrid
from core.prompt.benchmark_judge import build_rubric_judge_user_prompt
from services.benchmark_criteria_seed import default_grid_payload


def _grid() -> CriteriaGrid:
    """Grille de départ, telle qu'elle est semée."""
    return CriteriaGrid.model_validate(default_grid_payload())


def _criterion(grid: CriteriaGrid, criterion_id: str):
    """Le critère portant cet identifiant."""
    return next(c for c in grid.criteria if c.criterion_id == criterion_id)


def test_invention_is_its_own_criterion_lightly_weighted() -> None:
    """Elle existe, elle pèse peu, et une note haute y signale un défaut."""
    grid = _grid()
    invention = _criterion(grid, "unsupported_invention")

    assert invention.direction == "lower_is_better"
    total = sum(c.weight for c in grid.criteria)
    assert invention.weight / total < 0.05


def test_invention_must_be_named_not_just_scored() -> None:
    """Le juge est sommé d'énumérer les inventions qu'il repère.

    C'est tout l'intérêt du critère : une note seule ne permet pas de retrouver
    la trouvaille qu'on voudrait verser au GDD.
    """
    description = _criterion(_grid(), "unsupported_invention").description.lower()

    assert "énumère" in description
    assert "commentaire" in description


def test_contradicting_the_world_is_as_heavy_as_broken_french() -> None:
    """La fidélité rejoint le poids maximal de la grille.

    L'outil travaille sur 50 000 à 120 000 caractères de fiches : un dialogue qui
    contredit le monde est à jeter, quelle qu'en soit la qualité d'écriture.
    """
    grid = _grid()
    fidelity = _criterion(grid, "context_fidelity")

    assert fidelity.weight == max(c.weight for c in grid.criteria)


def test_fidelity_no_longer_absolves_invention() -> None:
    """L'amnistie explicite a disparu de la consigne de fidélité."""
    description = _criterion(_grid(), "context_fidelity").description.lower()

    assert "n'est pas pénalisé" not in description
    assert "unsupported_invention" in description


def test_both_criteria_reach_the_judge_prompt() -> None:
    """Un critère ajouté à la grille arrive au juge sans toucher au code."""
    prompt = build_rubric_judge_user_prompt(_grid(), '{"nodes": []}', context="FICHE")

    assert "`unsupported_invention`" in prompt
    assert "SENS INVERSÉ" in prompt


def test_the_grid_changed_version_with_its_criteria() -> None:
    """Une grille rééditée change de version, sinon le rapport mélange deux barèmes.

    `grid_version` entre dans la clé de regroupement du rapport : sans le bump,
    des notes rendues sous l'ancienne pondération tomberaient dans la même
    moyenne que les nouvelles.
    """
    assert default_grid_payload()["version"] >= 2

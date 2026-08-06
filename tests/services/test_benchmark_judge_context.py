"""Tests du contexte transmis au juge de benchmark.

Le premier run réel a révélé le défaut que ces tests verrouillent : le juge notait
« justesse de la voix » et « fidélité au contexte fourni » sans avoir reçu les
fiches, et l'écrivait lui-même dans ses commentaires (« faute de fiche GDD
fournie, la fidélité exacte reste impossible à confirmer »). Deux critères
pondérés produisaient une note qui ne mesurait rien.
"""

from __future__ import annotations

import pytest

from api.schemas.benchmark_judging import CriteriaGrid
from core.prompt.benchmark_judge import (
    JUDGE_CONTEXT_MAX_CHARS,
    build_pairwise_judge_user_prompt,
    build_rubric_judge_user_prompt,
)
from services.benchmark_criteria_seed import default_grid_payload


@pytest.fixture
def grid() -> CriteriaGrid:
    """Grille de départ, telle qu'elle est semée."""
    return CriteriaGrid.model_validate(default_grid_payload())


def test_rubric_prompt_carries_the_author_context(grid: CriteriaGrid) -> None:
    """Le contexte de l'auteur apparaît dans le prompt de notation."""
    prompt = build_rubric_judge_user_prompt(
        grid, '{"nodes": []}', context="FICHE : Voknir parle par saccades."
    )
    assert "CONTEXTE FOURNI À L'AUTEUR" in prompt
    assert "Voknir parle par saccades" in prompt


def test_rubric_prompt_says_so_when_context_is_missing(grid: CriteriaGrid) -> None:
    """Sans contexte, le juge est prévenu au lieu de noter à l'aveugle.

    Une note de fidélité rendue sans référence est pire qu'absente : elle entre
    dans la moyenne pondérée avec l'autorité d'une mesure.
    """
    prompt = build_rubric_judge_user_prompt(grid, '{"nodes": []}')
    assert "indisponible" in prompt
    assert "vérification externe est impossible" in prompt


def test_pairwise_prompt_carries_the_shared_context(grid: CriteriaGrid) -> None:
    """Le duel reçoit le contexte commun aux deux propositions."""
    prompt = build_pairwise_judge_user_prompt(
        grid, "A", "B", truncated=False, context="FICHE : Genka personnifie les idées."
    )
    assert "CONTEXTE FOURNI À L'AUTEUR" in prompt
    assert "Genka personnifie les idées" in prompt


def test_oversized_context_is_cut_and_the_cut_is_announced(grid: CriteriaGrid) -> None:
    """Un contexte trop long est coupé, et le juge en est averti.

    Sans la mention, il reprocherait à l'auteur d'employer un élément du monde
    qui se trouvait simplement au-delà de la coupure.
    """
    prompt = build_rubric_judge_user_prompt(
        grid, '{"nodes": []}', context="Z" * (JUDGE_CONTEXT_MAX_CHARS + 5000)
    )
    assert "contexte coupé par l'outil" in prompt
    assert prompt.count("Z") == JUDGE_CONTEXT_MAX_CHARS

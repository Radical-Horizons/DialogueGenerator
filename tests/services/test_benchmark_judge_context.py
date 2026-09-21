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
    JUDGE_CONTEXT_POLICY,
    judge_prompt_fingerprint,
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


def test_a_huge_context_reaches_the_judge_whole(grid: CriteriaGrid) -> None:
    """Rien n'est coupé : le juge voit tout ce que l'auteur a vu.

    Le prompt d'un candidat place `<scene_instructions>` à la **fin**. Toute
    coupure par le début évince donc la consigne de scène en premier — ce qui
    s'est produit sur les vingt générations du run `20260921T144810`, où le
    juge notait `instruction_compliance` sans avoir lu la consigne.
    """
    scene = "<scene_instructions>Mode de narration : SANS didascalies.</scene_instructions>"
    context = ("Z" * 120_000) + scene

    prompt = build_rubric_judge_user_prompt(grid, '{"nodes": []}', context=context)

    assert scene in prompt
    assert prompt.count("Z") == 120_000


def test_the_context_policy_is_part_of_the_judge_identity() -> None:
    """Changer ce que le juge voit change le juge, donc son empreinte.

    L'empreinte ne hachait que le prompt système. La coupure vivait dans le
    prompt utilisateur : un juge aveugle et un juge informé portaient la même
    signature, et leurs verdicts pouvaient tomber dans la même moyenne.
    """
    system_prompt = "Tu es juge. Note le dialogue."

    import core.prompt.benchmark_judge as judge_module

    current = judge_prompt_fingerprint(system_prompt)
    original = judge_module.JUDGE_CONTEXT_POLICY
    try:
        judge_module.JUDGE_CONTEXT_POLICY = "truncated-24000"
        other = judge_prompt_fingerprint(system_prompt)
    finally:
        judge_module.JUDGE_CONTEXT_POLICY = original

    assert current != other
    assert JUDGE_CONTEXT_POLICY == "full-prompt"

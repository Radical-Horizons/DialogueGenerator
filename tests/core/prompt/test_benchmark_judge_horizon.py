"""Le juge doit savoir où s'arrête l'unité qu'on lui soumet.

Au run du 2026-09-21, le prompt système décrivait encore l'ancienne unité —
« une réplique de PNJ et les choix proposés au joueur », soit un nœud isolé —
alors qu'on lui soumettait un fragment de deux niveaux. Le juge a donc lu
l'horizon du fragment comme un défaut d'écriture, et l'a écrit :

    « les branches aboutissent toutes à END sans conséquence narrative visible »

Les **cinq** modèles ont été pénalisés sur « conséquence perceptible », critère
pondéré 1,2. Un critère que personne ne peut satisfaire ne classe personne : il
abaisse tout le monde d'autant et ajoute du bruit à la moyenne.
"""

from __future__ import annotations

import pytest

from core.prompt.benchmark_judge import (
    BENCHMARK_PAIRWISE_JUDGE_SYSTEM_PROMPT,
    BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT,
    FRAGMENT_HORIZON_NOTICE,
)

PROMPTS = {
    "rubrique": BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT,
    "duels": BENCHMARK_PAIRWISE_JUDGE_SYSTEM_PROMPT,
}


@pytest.mark.parametrize("name", sorted(PROMPTS))
def test_both_judges_are_told_where_the_fragment_stops(name: str) -> None:
    """Les deux jambes notent la même unité : elles doivent la connaître pareil."""
    assert FRAGMENT_HORIZON_NOTICE in PROMPTS[name]


@pytest.mark.parametrize("name", sorted(PROMPTS))
def test_the_notice_says_end_is_by_design(name: str) -> None:
    """Le mot qui compte : l'horizon vient du banc, pas du modèle."""
    prompt = PROMPTS[name]

    assert "par construction du banc" in prompt
    assert "END" in prompt


def test_the_rubric_prompt_no_longer_describes_a_single_node() -> None:
    """La description de l'unité doit suivre la bascule en mode fragment."""
    prompt = BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT

    assert "une réplique de PNJ et les choix" not in prompt
    assert "un panneau par option" in prompt


def test_the_notice_redirects_to_what_can_be_judged() -> None:
    """Interdire de pénaliser ne suffit pas : il faut dire sur quoi juger."""
    assert "engage, annonce ou rend inévitable" in FRAGMENT_HORIZON_NOTICE

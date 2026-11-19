"""Actions du PJ générées : « * [Vous …]* » recollé en « *[Vous …]* » avant le JSON Unity."""
from __future__ import annotations

import pytest

from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse
from services.generated_markup_cleanup import tidy_choice_action_markup
from services.unity_dialogue_generation_service import UnityDialogueGenerationService


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            "* [Vous observez les fissures sans interrompre Voknir.]*",
            "*[Vous observez les fissures sans interrompre Voknir.]*",
        ),
        ("*[Vous reculez.] *", "*[Vous reculez.]*"),
        (
            "* [Vous vous penchez.] * « Montre-moi. »",
            "*[Vous vous penchez.]* « Montre-moi. »",
        ),
    ],
)
def test_stray_spaces_around_an_action_are_removed(raw: str, expected: str) -> None:
    """L'espace qui casse l'italique autour des crochets disparaît."""
    assert tidy_choice_action_markup(raw) == expected


@pytest.mark.parametrize(
    "text",
    [
        "*[Vous pénétrez dans l'atelier.]* « Salutation, cartographe. »",
        "« Alors marche avec moi. »",
        "« Le prix ? » *Il hésite.* [note] *encore*",
        "",
    ],
)
def test_well_formed_or_spoken_choices_are_untouched(text: str) -> None:
    """Un choix déjà propre, une réplique ou un crochet hors action ne bougent pas."""
    assert tidy_choice_action_markup(text) == text


def test_enrich_with_ids_tidies_generated_choices() -> None:
    """Le nœud enrichi, celui qui part dans le document et l'export, porte le texte recollé."""
    response = UnityDialogueGenerationResponse.model_validate(
        {
            "title": "Encre rétive",
            "node": {
                "speaker": "Voknir Esh'Maradel",
                "line": "« Elles glissent hors de vos yeux. »",
                "choices": [
                    {"text": "* [Vous observez les fissures.]*"},
                    {"text": "« Donne-moi une coordonnée. »"},
                ],
            }
        }
    )
    node = UnityDialogueGenerationService().enrich_with_ids(content=response, start_id="N1")[0]
    assert [c["text"] for c in node["choices"]] == [
        "*[Vous observez les fissures.]*",
        "« Donne-moi une coordonnée. »",
    ]

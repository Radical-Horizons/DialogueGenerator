"""Deux défauts objectivement vérifiables, que le juge ne voit pas.

Le protocole dit : « ce qui est objectivement vérifiable relève d'une porte,
pas du juge ». Ces deux-là manquaient, et le run du 2026-09-21 l'a montré —
les cinq modèles ont reçu **exactement** 6,2 en « Respect de la consigne »,
alors que leurs écarts de forme allaient de zéro à quatre par génération.

- `speaker_label` : `gpt-5.6-sol` a écrit `genka_lien`, `l_ensevelie` et
  `akthar_neth_amatru` dans le champ locuteur, qui s'affiche tel quel en jeu.
  Aucun autre modèle n'a dérapé. Le juge ne lit pas ce champ.
- `narration` : des didascalies dans un run qui n'en veut pas. Cette porte
  n'aurait **pas** dû exister tant que le prompt les autorisait par ailleurs —
  elle aurait puni les modèles pour avoir suivi la majorité de leur consigne.
  Elle ne devient légitime qu'une fois le prompt rendu cohérent.

Les deux sont des observations : le texte reste jugeable, le défaut se corrige
au prompt.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest

from services.benchmark_gate_service import BenchmarkGateService

FRENCH_LINE = "« Je n'ai pas confiance en vous, marchand. Dites-moi ce que vous voulez. »"


def _gates() -> BenchmarkGateService:
    """Service de portes sans catalogue de flags."""
    return BenchmarkGateService(flag_validation_service=None)


def _document(speaker: str = "Voknir", line: str = FRENCH_LINE, choice: str = "« Partir. »") -> str:
    """Document Unity d'un panneau."""
    return json.dumps(
        {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "START",
                    "displayName": "Ouverture",
                    "speaker": speaker,
                    "line": line,
                    "choices": [{"choiceId": "c0", "text": choice, "targetNode": "END"}],
                }
            ],
        },
        ensure_ascii=False,
    )


def _gates_hit(failures: List[Any]) -> Dict[str, str]:
    """Indexe la sévérité par identifiant de porte."""
    return {f.gate: f.severity for f in failures}


@pytest.mark.parametrize("speaker", ["genka_lien", "l_ensevelie", "akthar_neth_amatru"])
def test_technical_speaker_identifiers_are_observed(speaker: str) -> None:
    """Les trois formes réellement produites par Sol le 2026-09-21."""
    failures = _gates().evaluate(_document(speaker=speaker))

    assert _gates_hit(failures).get("speaker_label") == "observation"


@pytest.mark.parametrize("speaker", ["Genka Lien", "L'Ensevelie", "Voknir Esh'Maradel"])
def test_proper_names_pass(speaker: str) -> None:
    """Un nom affichable ne doit jamais déclencher la porte."""
    assert "speaker_label" not in _gates_hit(_gates().evaluate(_document(speaker=speaker)))


def test_stage_directions_are_observed_when_the_run_forbids_them() -> None:
    """Le run demande un dialogue sans narration : l'écart se relève."""
    document = _document(line="*Voknir lève les yeux.* " + FRENCH_LINE)
    failures = _gates().evaluate(document, allow_stage_directions=False)

    assert _gates_hit(failures).get("narration") == "observation"


def test_stage_directions_in_a_choice_count_too() -> None:
    """Une option en italique est une didascalie comme une autre."""
    document = _document(choice="*[S'approcher sans répondre.]*")
    failures = _gates().evaluate(document, allow_stage_directions=False)

    assert "narration" in _gates_hit(failures)


def test_stage_directions_are_silent_when_the_run_allows_them() -> None:
    """En mode « avec », les didascalies sont la consigne — pas un écart.

    C'est le défaut par défaut : la production les autorise, et son verdict ne
    doit pas changer parce que le benchmark a gagné une porte.
    """
    document = _document(line="*Voknir lève les yeux.* " + FRENCH_LINE)

    assert "narration" not in _gates_hit(_gates().evaluate(document))


def test_neither_gate_ever_disqualifies() -> None:
    """Forme fautive, texte jugeable : ces portes n'écartent jamais."""
    document = _document(speaker="genka_lien", line="*Il sourit.* " + FRENCH_LINE)
    failures = _gates().evaluate(document, allow_stage_directions=False)

    assert {"speaker_label", "narration"} <= set(_gates_hit(failures))
    assert not [f for f in failures if f.severity == "blocking"]


def _fragment(levels: int, choices_per_panel: int = 3) -> str:
    """Construit un fragment de `levels` niveaux, façon sortie réelle."""
    nodes: List[Dict[str, Any]] = []
    frontier = ["START"]
    for level in range(levels):
        next_frontier: List[str] = []
        for node_id in frontier:
            width = choices_per_panel if level < levels - 1 else 2
            children = [f"{node_id}-{i}" for i in range(width)]
            nodes.append(
                {
                    "id": node_id,
                    "displayName": f"Panneau {node_id}",
                    "speaker": "Voknir",
                    "line": FRENCH_LINE,
                    "choices": [
                        {
                            "choiceId": f"{node_id}-c{i}",
                            "text": "« Insister. »",
                            "targetNode": child if level < levels - 1 else "END",
                        }
                        for i, child in enumerate(children)
                    ],
                }
            )
            if level < levels - 1:
                next_frontier.extend(children)
        frontier = next_frontier
    return json.dumps({"schemaVersion": "1.1.0", "nodes": nodes}, ensure_ascii=False)


def test_a_well_formed_two_level_fragment_is_silent() -> None:
    """Ouverture à trois options plus trois suites : la forme attendue."""
    failures = _gates().evaluate(_fragment(levels=2))

    assert "panel_count" not in _gates_hit(failures)


def test_a_third_level_is_observed() -> None:
    """Le cas `gpt-5.6-luna` du 2026-09-21 : dix panneaux au lieu de quatre.

    Sans cette porte il passait en silence, et le run comparait une unité de
    mesure qui variait du simple au triple selon le modèle.
    """
    document = _fragment(levels=3)
    assert len(json.loads(document)["nodes"]) > 4

    assert _gates_hit(_gates().evaluate(document)).get("panel_count") == "observation"


def test_the_shape_gate_never_disqualifies() -> None:
    """Trop de panneaux reste du texte jugeable."""
    failures = _gates().evaluate(_fragment(levels=3))

    assert not [f for f in failures if f.severity == "blocking"]


@pytest.mark.parametrize("speaker", ["Akthar_Neth", "GENKA_LIEN", "L_Ensevelie"])
def test_technical_identifiers_are_caught_whatever_the_case(speaker: str) -> None:
    """Sol n'a produit que des minuscules ; la porte ne doit pas s'y limiter."""
    assert "speaker_label" in _gates_hit(_gates().evaluate(_document(speaker=speaker)))


def test_emphasis_inside_quotes_is_speech_not_stage_direction() -> None:
    """« Je ne *veux* pas. » est du texte parlé, pas une didascalie."""
    document = _document(line="« Je ne *veux* pas de votre or, marchand. »")
    failures = _gates().evaluate(document, allow_stage_directions=False)

    assert "narration" not in _gates_hit(failures)


def test_a_stage_direction_outside_quotes_is_still_caught() -> None:
    """L'exclusion de l'emphase ne doit pas ouvrir une porte dérobée."""
    document = _document(line="*Voknir recule d'un pas.* « Je ne *veux* pas. »")
    failures = _gates().evaluate(document, allow_stage_directions=False)

    assert "narration" in _gates_hit(failures)


def test_the_shape_gate_finds_the_opening_by_id_not_by_order() -> None:
    """Rien ne garantit que l'ouverture soit en tête après résolution.

    La porte cherche `START` ; si elle se fiait au premier élément du tableau,
    un document réordonné lui ferait calculer une forme attendue fantaisiste.
    """
    document = json.loads(_fragment(levels=3))
    document["nodes"].reverse()
    failures = _gates().evaluate(json.dumps(document, ensure_ascii=False))

    assert _gates_hit(failures).get("panel_count") == "observation"

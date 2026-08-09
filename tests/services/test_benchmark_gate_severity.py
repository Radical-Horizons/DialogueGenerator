"""Une valeur technique ne disqualifie jamais une réponse.

Un panneau trop long, une cible pendante ou des options en nombre inattendu
laissent un texte parfaitement jugeable : la justesse de la voix, la tenue de la
langue et l'intérêt des choix s'y lisent. Les écarter retirerait de la mesure le
matériau qu'on cherche à évaluer, pour des défauts que le prompting corrige.

Ne bloque que ce qui rend le texte illisible : rien à parser, rien à lire — plus
la langue, seule exception, parce que la grille note la tenue du français.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest

from api.schemas.benchmark import BLOCKING_GATES, BenchmarkCaseExpectations
from services.benchmark_gate_service import BenchmarkGateService

FRENCH_LINE = (
    "Je n'ai pas confiance en toi, marchand : tu vends des promesses et tu gardes "
    "les pièces. Dis-moi ce que tu veux vraiment."
)


def _gates() -> BenchmarkGateService:
    """Service de portes sans catalogue de flags."""
    return BenchmarkGateService(flag_validation_service=None)


def _document(nodes: List[Dict[str, Any]]) -> str:
    """Sérialise un document Unity."""
    return json.dumps({"schemaVersion": "1.1.0", "nodes": nodes}, ensure_ascii=False)


def _node(node_id: str, line: str, choices: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Nœud Unity minimal."""
    return {
        "id": node_id,
        "displayName": "Panneau",
        "speaker": "Voknir",
        "line": line,
        "choices": choices,
    }


def _severities(failures: List[Any]) -> Dict[str, str]:
    """Indexe la sévérité par identifiant de porte."""
    return {failure.gate: failure.severity for failure in failures}


def test_blocking_set_stays_minimal() -> None:
    """La liste des portes disqualifiantes doit tenir sur une ligne."""
    assert BLOCKING_GATES == frozenset({"parsable", "non_empty"})


def test_overlong_panel_is_observed_not_rejected() -> None:
    """Un panneau verbeux est un défaut de forme, pas une raison de jeter le texte."""
    document = _document(
        [_node("START", FRENCH_LINE * 20, [{"choiceId": "c0", "text": "Partir", "targetNode": "END"}])]
    )
    failures = _gates().evaluate(document, expectations=BenchmarkCaseExpectations(max_words=300))

    assert _severities(failures).get("length") == "observation"
    assert not [f for f in failures if f.severity == "blocking"]


def test_dangling_target_is_observed_not_rejected() -> None:
    """Une cible pendante n'empêche pas de juger la réplique et ses options."""
    document = _document(
        [_node("START", FRENCH_LINE, [{"choiceId": "c0", "text": "Insister", "targetNode": "absent"}])]
    )
    failures = _gates().evaluate(document)

    assert _severities(failures).get("connectivity") == "observation"
    assert not [f for f in failures if f.severity == "blocking"]


def test_missing_panels_are_observed_not_rejected() -> None:
    """Un fragment incomplet reste du texte à juger.

    C'est le cas qui a coûté deux mesures au bench du 8 août : Pydantic puis les
    portes rejetaient un panneau isolé, texte compris.
    """
    document = _document(
        [_node("START", FRENCH_LINE, [{"choiceId": "c0", "text": "Insister", "targetNode": "END"}])]
    )
    failures = _gates().evaluate(document, expectations=BenchmarkCaseExpectations(min_panels=4))

    assert _severities(failures).get("panel_count") == "observation"
    assert not [f for f in failures if f.severity == "blocking"]


@pytest.mark.parametrize(
    "expectations",
    [
        BenchmarkCaseExpectations(min_choices=3),
        BenchmarkCaseExpectations(max_choices=1),
        BenchmarkCaseExpectations(expected_flag_ids=["FLAG_ABSENT"]),
    ],
)
def test_expectation_misses_are_observations(expectations: BenchmarkCaseExpectations) -> None:
    """Bornes d'options et flags attendus : corrigeables au prompt, donc observés."""
    document = _document(
        [
            _node(
                "START",
                FRENCH_LINE,
                [
                    {"choiceId": "c0", "text": "Insister", "targetNode": "END"},
                    {"choiceId": "c1", "text": "Se taire", "targetNode": "END"},
                ],
            )
        ]
    )
    failures = _gates().evaluate(document, expectations=expectations)

    assert failures, "l'écart doit être relevé, seulement pas disqualifiant"
    assert not [f for f in failures if f.severity == "blocking"]


def test_unparsable_output_still_blocks() -> None:
    """Sans JSON, il n'y a rien à juger."""
    failures = _gates().evaluate("ceci n'est pas du JSON")
    assert _severities(failures).get("parsable") == "blocking"


def test_empty_output_still_blocks() -> None:
    """Sans texte, il n'y a rien à lire."""
    failures = _gates().evaluate(_document([_node("START", "", [])]))
    assert any(f.severity == "blocking" for f in failures)


def test_wrong_language_still_blocks() -> None:
    """Seule exception assumée : la grille note la tenue du français.

    Sur un texte anglais, « justesse de la voix » produirait une note qui ne
    mesure rien.
    """
    english = _document(
        [
            _node(
                "START",
                "I do not trust you, merchant. You sell promises and keep the coins.",
                [{"choiceId": "c0", "text": "Walk away from the stall", "targetNode": "END"}],
            )
        ]
    )
    failures = _gates().evaluate(english)
    assert _severities(failures).get("language") == "blocking"

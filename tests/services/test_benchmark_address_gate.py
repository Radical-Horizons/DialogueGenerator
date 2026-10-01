"""Le tu/vous est une contrainte mécanique : elle ne se délègue pas au juge.

Les cas de la suite imposent « même tu/vous que le START ». Le 2026-10-01, sur le
cas `akthar-interdit`, Luna a ouvert en tutoyant Uresäir puis vouvoyé dans les
trois panneaux suivants. Le juge voyait pourtant la consigne entière — c'était le
premier run après la suppression de la troncature — et il a mis **9** sur
`instruction_compliance`, en écrivant que « les répliques restent dans le format
demandé ».

Leçon : ce qu'une expression régulière vérifie à coup sûr ne doit pas dépendre du
discernement d'un modèle.
"""

from __future__ import annotations

from services.benchmark_gate_service import BenchmarkGateService


def _panel(node_id: str, line: str, choices: list[str] | None = None) -> dict:
    """Panneau minimal : une réplique PNJ et des libellés de choix."""
    return {
        "id": node_id,
        "speaker": "Akthar-Neth Amatru",
        "line": line,
        "choices": [{"text": text} for text in (choices or [])],
    }


def _gates(nodes: list[dict]) -> list:
    """Observations de la porte d'adresse."""
    return BenchmarkGateService._address_consistency_failures(nodes)


def test_switching_from_tu_to_vous_is_reported() -> None:
    """Le défaut réel du run du 2026-10-01, réduit à l'os."""
    nodes = [
        _panel("START", "« Tu demandes le nom de ce que Nous avons enterré. »"),
        _panel("suite", "« Cette formulation profanerait votre jugement. »"),
    ]

    failures = _gates(nodes)

    assert len(failures) == 1
    assert failures[0].gate == "address_consistency"
    assert failures[0].severity == "observation"
    assert "suite" in failures[0].message


def test_a_consistent_fragment_passes() -> None:
    """Rien à signaler quand le locuteur ne change pas d'adresse."""
    nodes = [
        _panel("START", "« Tu demandes beaucoup, et tu le sais. »"),
        _panel("suite", "« Ce que tu réclames, Nous ne te le donnerons pas. »"),
    ]

    assert _gates(nodes) == []


def test_npc_and_player_are_tracked_separately() -> None:
    """Le PNJ peut tutoyer un PJ qui le vouvoie : c'est une caractérisation.

    C'est exactement la configuration du run réel. Confondre les deux sens
    d'adresse aurait produit une observation sur chaque fragment bien écrit.
    """
    nodes = [
        _panel("START", "« Tu demandes le nom. »", ["« Je vous le demande, oui. »"]),
        _panel("suite", "« Tu ne l'obtiendras pas ainsi. »", ["« Alors gardez votre nom. »"]),
    ]

    assert _gates(nodes) == []


def test_a_panel_without_any_marker_is_not_a_switch() -> None:
    """Un panneau qui n'adresse personne ne compte pas comme un changement.

    Akthar-Neth parle souvent de lui au pluriel sans s'adresser à quiconque :
    le compter comme une bascule ferait sonner la porte sur rien.
    """
    nodes = [
        _panel("START", "« Tu demandes le nom. »"),
        _panel("suite", "« Nous avons sacrifié ce qui devait l'être. »"),
    ]

    assert _gates(nodes) == []


def test_the_past_participle_of_taire_is_not_an_address() -> None:
    """« Il s'est tu » n'est pas un tutoiement, dans un registre qui l'emploie."""
    nodes = [
        _panel("START", "« Nous vous répondrons, mais pas devant la Nef. »"),
        _panel("suite", "« Le Grand-Père s'est tu, et nul ne sait pourquoi. »"),
    ]

    assert _gates(nodes) == []


def test_the_noun_ton_is_not_an_address() -> None:
    """« Sur ce ton » n'est pas un possessif."""
    nodes = [
        _panel("START", "« Nous ne vous répondrons pas. »"),
        _panel("suite", "« On ne s'adresse pas à l'Exégète sur ce ton. »"),
    ]

    assert _gates(nodes) == []


def test_a_fragment_without_start_is_left_alone() -> None:
    """Sans panneau d'ouverture, il n'y a pas de référence — la forme du fragment
    est déjà le problème, et `panel_count` le dit."""
    assert _gates([_panel("autre", "« Tu demandes le nom. »")]) == []

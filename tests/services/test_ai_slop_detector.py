"""Tests unitaires AISlopDetector (FR43)."""

import pytest

from services.ai_slop_detector import AISlopDetector, AiSlopDetectionOptionsData


def _dialogue_node(
    nid: str,
    line: str,
    choices: list | None = None,
) -> dict:
    return {
        "id": nid,
        "type": "dialogueNode",
        "data": {
            "id": nid,
            "stableId": f"stable-{nid}",
            "speaker": "X",
            "line": line,
            "choices": choices or [],
        },
    }


def test_repetition_ignores_test_node_line_mirroring_parent_choice():
    """Barre de test : même texte que le choix parent → pas de répétition (structurelle)."""
    phrase = "Cette phrase est assez longue pour dépasser le seuil."
    dlg = _dialogue_node(
        "D1",
        "Ligne principale différente.",
        choices=[{"text": phrase, "choiceId": "__idx_0"}],
    )
    test_node = {
        "id": "test-node-D1-choice-0",
        "type": "testNode",
        "data": {"id": "test-node-D1-choice-0", "line": phrase, "test": "Raison+Rhétorique:8"},
    }
    edges = [
        {
            "id": "e1",
            "source": "D1",
            "target": "test-node-D1-choice-0",
            "sourceHandle": "choice:__idx_0",
            "data": {"edgeType": "choice", "choiceIndex": 0},
        }
    ]
    r = AISlopDetector.detect([dlg, test_node], edges, None)
    rep = [o for o in r.occurrences if o.kind == "repetition"]
    assert not rep
    assert not r.repetition_groups


def test_repetition_same_line_two_nodes():
    """Deux nœuds avec la même ligne longue → groupe répétition + occurrences."""
    phrase = "Cette phrase est assez longue pour dépasser le seuil."
    nodes = [
        _dialogue_node("A", phrase),
        _dialogue_node("B", phrase),
    ]
    r = AISlopDetector.detect(nodes, [], None)
    assert len(r.repetition_groups) == 1
    assert r.repetition_groups[0].occurrence_count == 2
    assert set(r.repetition_groups[0].node_ids) == {"A", "B"}
    rep_kinds = [o.kind for o in r.occurrences if o.kind == "repetition"]
    assert len(rep_kinds) == 2


def test_gpt_ism_known_phrase():
    """Sous-chaîne GPT-ism connue → occurrence gpt_ism."""
    nodes = [
        _dialogue_node(
            "N1",
            "Ah, je vois. Le trésor est là-bas.",
        ),
    ]
    r = AISlopDetector.detect(nodes, [], None)
    gpt = [o for o in r.occurrences if o.kind == "gpt_ism"]
    assert len(gpt) >= 1
    assert gpt[0].matched_span.lower() == "ah, je vois"


def test_empty_text_nodes_message_not_silent():
    """Nœuds sans texte extractible → message explicite, pas d’exception."""
    nodes = [
        _dialogue_node("A", "   "),
    ]
    r = AISlopDetector.detect(nodes, [], None)
    assert r.message
    assert "Aucun texte" in r.message or "sans contenu" in r.message


def test_all_disabled_options_clears_and_message():
    """Toutes les familles désactivées → message et listes vides."""
    nodes = [_dialogue_node("A", "Cette phrase est assez longue pour dépasser le seuil.")]
    opts = AiSlopDetectionOptionsData(
        include_gpt_isms=False,
        include_repetitions=False,
        include_generic_phrases=False,
    )
    r = AISlopDetector.detect(nodes, [], opts)
    assert r.message
    assert not r.occurrences
    assert not r.repetition_groups


def test_invalid_regex_returns_error():
    """Regex invalide dans options → message d’erreur et pas de résultat partiel."""
    nodes = [_dialogue_node("A", "Cette phrase est assez longue pour dépasser le seuil.")]
    opts = AiSlopDetectionOptionsData(
        custom_regex_patterns=["("],
    )
    r = AISlopDetector.detect(nodes, [], opts)
    assert r.message
    assert "Regex invalide" in r.message
    assert not r.occurrences


def test_nested_quantifier_regex_rejected():
    """Motifs à quantificateurs imbriqués refusés (mitigation ReDoS)."""
    nodes = [_dialogue_node("A", "aaaaaaaaaaaaaaaaaaaa")]
    opts = AiSlopDetectionOptionsData(
        custom_regex_patterns=[r"(a+)+"],
    )
    r = AISlopDetector.detect(nodes, [], opts)
    assert r.message
    assert "quantificateurs imbriqués" in r.message.lower()
    assert not r.occurrences

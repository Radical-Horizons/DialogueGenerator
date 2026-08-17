"""Tests unitaires ContextDroppingDetector (FR44) — données génériques sans GDD réel."""
from __future__ import annotations

import pytest

from services.context_dropping_detector import ContextDroppingDetector
from services.context_dropping_facts import extract_key_phrases_from_context


def _dialogue_node(node_id: str, line: str) -> dict:
    return {
        "id": node_id,
        "type": "dialogueNode",
        "position": {"x": 0, "y": 0},
        "data": {"line": line, "choices": [], "stableId": f"st-{node_id}"},
    }


def test_extract_phrases_from_selections_generic():
    sel = {"characters_full": ["Entité Alpine Zeta"], "locations_full": []}
    phrases = extract_key_phrases_from_context(sel, rules_profile="strict")
    assert len(phrases) >= 1
    assert any("alpine" in p.normalized for p in phrases)


def test_context_dropping_when_entity_missing_from_dialogue():
    nodes = [_dialogue_node("n1", "Bonjour, dialogue sans la référence attendue.")]
    edges: list = []
    sel = {"characters_full": ["Entité Alpine Zeta"]}
    raw = ContextDroppingDetector.detect(nodes, edges, sel)
    assert raw.case_count >= 1
    assert any(c.kind == "context_dropping" for c in raw.cases)
    assert "0 cas" not in raw.summary or raw.case_count > 0


def test_empty_context_returns_explicit_message_not_success_confused():
    nodes = [_dialogue_node("n1", "Ligne seule.")]
    raw = ContextDroppingDetector.detect(nodes, [], {})
    assert raw.case_count == 0
    assert raw.message is not None
    assert "exploitable" in raw.message.lower() or "contexte" in raw.message.lower()


def test_multi_word_single_significant_word_is_enough():
    """Une seule unité significative d'une mention multi-mots suffit (pas la phrase entière)."""
    nodes = [_dialogue_node("n1", "Nous parlons seulement de Unitaire sans le reste.")]
    edges: list = []
    sel = {"characters_full": ["Unitaire Codex Ref"]}
    raw = ContextDroppingDetector.detect(nodes, edges, sel)
    assert raw.case_count == 0
    assert raw.message is not None


def test_full_phrase_present_no_case():
    nodes = [_dialogue_node("n1", "Rencontre avec Entité Alpine Zeta ici.")]
    raw = ContextDroppingDetector.detect(nodes, [], {"characters_full": ["Entité Alpine Zeta"]})
    assert raw.case_count == 0
    assert raw.message is not None


def test_strict_choices_without_numeric_mechanics_warns() -> None:
    """Mode strict : choix sans DD ni deltas → too_subtle."""
    from services.context_dropping_detector import ContextDroppingOptionsData

    node = {
        "id": "n1",
        "type": "dialogueNode",
        "position": {"x": 0, "y": 0},
        "data": {
            "line": "Rencontre avec Entité Alpine Zeta ici.",
            "choices": [{"text": "Continuer", "test": None}],
            "stableId": "st-n1",
        },
    }
    raw = ContextDroppingDetector.detect(
        [node],
        [],
        {"characters_full": ["Entité Alpine Zeta"]},
        options=ContextDroppingOptionsData(rules_profile="strict"),
    )
    assert any(c.kind == "too_subtle" and "DD" in c.message for c in raw.cases)


def test_strict_choices_with_dd_skip_mechanic_warning() -> None:
    """Un test numérique évite le warning DD."""
    from services.context_dropping_detector import ContextDroppingOptionsData

    node = {
        "id": "n1",
        "type": "dialogueNode",
        "position": {"x": 0, "y": 0},
        "data": {
            "line": "Rencontre avec Entité Alpine Zeta ici.",
            "choices": [{"text": "Tenter", "test": "Raison+Rhétorique:8"}],
            "stableId": "st-n1",
        },
    }
    raw = ContextDroppingDetector.detect(
        [node],
        [],
        {"characters_full": ["Entité Alpine Zeta"]},
        options=ContextDroppingOptionsData(rules_profile="strict"),
    )
    assert not any("DD / deltas" in (c.context_label or "") for c in raw.cases)

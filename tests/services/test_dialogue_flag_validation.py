"""Tests validation liaisons dialogueFlags (Story 9.1)."""
import pytest

from services.dialogue_flag_validation import (
    normalize_dialogue_flag_bindings,
    threshold_warnings_for_bindings,
)


@pytest.fixture
def catalog_player_bool():
    return {
        "PLAYER_KILLED_BOSS": {
            "id": "PLAYER_KILLED_BOSS",
            "type": "bool",
            "semanticType": "bool",
            "scope": "conversationnel",
            "enumValues": [],
        }
    }


@pytest.fixture
def catalog_effort_counter():
    return {
        "CURRENT_EFFORT": {
            "id": "CURRENT_EFFORT",
            "type": "int",
            "semanticType": "compteur",
            "scope": "mécanique",
            "minValue": 0,
            "maxValue": 10,
            "enumValues": [],
        }
    }


@pytest.fixture
def catalog_enum():
    return {
        "MISSION_BRANCH": {
            "id": "MISSION_BRANCH",
            "type": "string",
            "semanticType": "enum",
            "scope": "conversationnel",
            "enumValues": ["path_a", "path_b"],
            "minValue": None,
            "maxValue": None,
        }
    }


def test_normalize_bool_ok(catalog_player_bool):
    raw = [{"flagId": "PLAYER_KILLED_BOSS", "type": "bool", "initialValue": True}]
    out = normalize_dialogue_flag_bindings(raw, catalog_player_bool)
    assert out == [{"flagId": "PLAYER_KILLED_BOSS", "type": "bool", "initialValue": True}]


def test_normalize_counter_clamp_catalog(catalog_effort_counter):
    raw = [{"flagId": "CURRENT_EFFORT", "type": "compteur", "initialValue": 5}]
    out = normalize_dialogue_flag_bindings(raw, catalog_effort_counter)
    assert out[0]["initialValue"] == 5


def test_normalize_counter_out_of_bounds_raises(catalog_effort_counter):
    raw = [{"flagId": "CURRENT_EFFORT", "type": "compteur", "initialValue": 99}]
    with pytest.raises(ValueError, match="hors bornes"):
        normalize_dialogue_flag_bindings(raw, catalog_effort_counter)


def test_normalize_enum_invalid_raises(catalog_enum):
    raw = [{"flagId": "MISSION_BRANCH", "type": "enum", "initialValue": "nope"}]
    with pytest.raises(ValueError, match="enum initiale invalide"):
        normalize_dialogue_flag_bindings(raw, catalog_enum)


def test_threshold_warnings_counters():
    defs = {
        "A": {"id": "A", "semanticType": "bool", "scope": "conversationnel"},
        "B": {"id": "B", "semanticType": "bool", "scope": "conversationnel"},
        "C": {"id": "C", "semanticType": "bool", "scope": "conversationnel"},
        "D": {"id": "D", "semanticType": "bool", "scope": "conversationnel"},
        "X": {"id": "X", "semanticType": "compteur", "scope": "mécanique"},
        "Y": {"id": "Y", "semanticType": "compteur", "scope": "mécanique"},
        "Z": {"id": "Z", "semanticType": "compteur", "scope": "mécanique"},
        "W": {"id": "W", "semanticType": "compteur", "scope": "mécanique"},
    }
    bindings = [
        {"flagId": "X", "type": "compteur", "initialValue": 0},
        {"flagId": "Y", "type": "compteur", "initialValue": 0},
        {"flagId": "Z", "type": "compteur", "initialValue": 0},
        {"flagId": "W", "type": "compteur", "initialValue": 0},
    ]
    warnings = threshold_warnings_for_bindings(bindings, defs)
    assert any("Compteurs liés : 4" in w for w in warnings)


def test_normalize_duplicate_flag_raises(catalog_player_bool):
    raw = [
        {"flagId": "PLAYER_KILLED_BOSS", "type": "bool", "initialValue": True},
        {"flagId": "PLAYER_KILLED_BOSS", "type": "bool", "initialValue": False},
    ]
    with pytest.raises(ValueError, match="dupliqué"):
        normalize_dialogue_flag_bindings(raw, catalog_player_bool)

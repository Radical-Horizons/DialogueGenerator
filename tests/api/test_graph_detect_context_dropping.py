"""Tests POST /api/v1/unity-dialogues/graph/detect-context-dropping (FR44)."""
from __future__ import annotations

from fastapi.testclient import TestClient


def _minimal_dialogue_node() -> dict:
    return {
        "id": "n1",
        "type": "dialogueNode",
        "position": {"x": 0, "y": 0},
        "data": {
            "line": "Texte générique sans entité attendue.",
            "choices": [],
            "stableId": "st-n1",
        },
    }


def _minimal_graph():
    return {"nodes": [_minimal_dialogue_node()], "edges": []}


def test_detect_context_dropping_returns_case(client: TestClient):
    body = {
        **_minimal_graph(),
        "context_selections": {"characters_full": ["Personnage Fictif Trente-Six"]},
        "scene_instruction": "",
    }
    r = client.post("/api/v1/unity-dialogues/graph/detect-context-dropping", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["case_count"] >= 1
    assert "cas" in data["summary"].lower()
    assert len(data["cases"]) >= 1
    assert data["rules_profile_effective"] == "strict"


def test_detect_context_dropping_empty_context_message(client: TestClient):
    body = {**_minimal_graph(), "context_selections": {}}
    r = client.post("/api/v1/unity-dialogues/graph/detect-context-dropping", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["case_count"] == 0
    assert data["message"] is not None


def test_detect_context_dropping_options_light_profile(client: TestClient):
    body = {
        **_minimal_graph(),
        "context_selections": {"characters_full": ["Ab"]},
        "options": {"rules_profile": "light", "tolerance": 0.5},
    }
    r = client.post("/api/v1/unity-dialogues/graph/detect-context-dropping", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["rules_profile_effective"] == "light"

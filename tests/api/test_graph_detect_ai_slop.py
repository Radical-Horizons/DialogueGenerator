"""Tests POST /api/v1/unity-dialogues/graph/detect-ai-slop (FR43)."""

import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _minimal_graph() -> dict:
    return {
        "nodes": [
            {
                "id": "START",
                "type": "startNode",
                "data": {"id": "START", "label": "Start"},
            },
            {
                "id": "A",
                "type": "dialogueNode",
                "data": {
                    "id": "A",
                    "speaker": "PNJ",
                    "line": "Ah, je vois.",
                    "choices": [{"text": "Salut", "choiceId": "c1"}],
                },
            },
        ],
        "edges": [{"id": "e0", "source": "START", "target": "A"}],
    }


def test_detect_ai_slop_graph_returns_gpt_ism(client: TestClient):
    """Graphe minimal avec GPT-ism → résumé et occurrences."""
    r = client.post("/api/v1/unity-dialogues/graph/detect-ai-slop", json=_minimal_graph())
    assert r.status_code == 200, r.text
    data = r.json()
    assert "summary_gpt_isms" in data
    assert "GPT-isms" in data["summary_gpt_isms"]
    assert data["gpt_ism_occurrence_count"] >= 1


def test_detect_ai_slop_repetition_two_nodes(client: TestClient):
    """Même ligne dans deux nœuds → répétitions listées."""
    phrase = "Cette phrase de test est volontairement longue pour le seuil."
    body = {
        "nodes": [
            {
                "id": "A",
                "type": "dialogueNode",
                "data": {
                    "id": "A",
                    "speaker": "P",
                    "line": phrase,
                    "choices": [],
                },
            },
            {
                "id": "B",
                "type": "dialogueNode",
                "data": {
                    "id": "B",
                    "speaker": "P",
                    "line": phrase,
                    "choices": [],
                },
            },
        ],
        "edges": [],
    }
    r = client.post("/api/v1/unity-dialogues/graph/detect-ai-slop", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["repetition_group_count"] >= 1
    kinds = {o["kind"] for o in data["occurrences"]}
    assert "repetition" in kinds


def test_detect_ai_slop_no_nodes_message(client: TestClient):
    """Graphe vide → 200 avec message explicite."""
    r = client.post(
        "/api/v1/unity-dialogues/graph/detect-ai-slop",
        json={"nodes": [], "edges": []},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("message")


def test_detect_ai_slop_invalid_regex_422(client: TestClient):
    """Regex invalide → 422."""
    r = client.post(
        "/api/v1/unity-dialogues/graph/detect-ai-slop",
        json={
            "nodes": [
                {
                    "id": "A",
                    "type": "dialogueNode",
                    "data": {"id": "A", "speaker": "P", "line": "x", "choices": []},
                },
            ],
            "edges": [],
            "options": {"custom_regex_patterns": ["("]},
        },
    )
    assert r.status_code == 422


def test_detect_ai_slop_nested_quantifier_regex_422(client: TestClient):
    """Motif à quantificateurs imbriqués → 422 (politique anti-ReDoS)."""
    r = client.post(
        "/api/v1/unity-dialogues/graph/detect-ai-slop",
        json={
            "nodes": [
                {
                    "id": "A",
                    "type": "dialogueNode",
                    "data": {"id": "A", "speaker": "P", "line": "abc", "choices": []},
                },
            ],
            "edges": [],
            "options": {"custom_regex_patterns": [r"(a+)+"]},
        },
    )
    assert r.status_code == 422

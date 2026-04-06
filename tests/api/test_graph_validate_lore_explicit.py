"""Tests endpoint POST /api/v1/unity-dialogues/graph/validate-lore-explicit (FR38)."""
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_validate_lore_explicit_returns_contradiction_when_mocked_fact() -> None:
    nodes = [
        {
            "id": "N1",
            "type": "dialogueNode",
            "data": {
                "id": "N1",
                "displayName": "N1",
                "line": "AliasApi est mort.",
            },
        }
    ]
    edges: list = []
    body = {
        "nodes": nodes,
        "edges": edges,
        "context_selections": {},
        "gdd_lore_facts": [
            {
                "entity_name": "AliasApi",
                "category": "characters",
                "gdd_path": "Test › AliasApi",
                "vitality": "alive",
            }
        ],
    }
    r = client.post("/api/v1/unity-dialogues/graph/validate-lore-explicit", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is False
    assert data["contradiction_count"] >= 1
    assert data["nodes_with_contradictions_count"] >= 1
    assert "contradiction" in data["summary"].lower()
    assert len(data["errors"]) >= 1
    err = data["errors"][0]
    assert err["type"] == "lore_contradiction_explicit"
    assert err["node_id"] == "N1"
    assert err.get("gdd_reference")
    assert "warnings" in data
    assert isinstance(data["warnings"], list)


def test_validate_lore_explicit_empty_facts_valid() -> None:
    nodes = [
        {
            "id": "N1",
            "type": "dialogueNode",
            "data": {"id": "N1", "displayName": "N1", "line": "Texte sans lien GDD."},
        }
    ]
    r = client.post(
        "/api/v1/unity-dialogues/graph/validate-lore-explicit",
        json={"nodes": nodes, "edges": [], "context_selections": {}},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is True
    assert data["contradiction_count"] == 0
    assert data.get("potential_warnings_count", 0) >= 0
    assert "Aucune contradiction lore explicite" in data["summary"]

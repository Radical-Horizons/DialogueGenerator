"""Tests intégration GET/PUT /api/v1/validation/rules/context-dropping (Story 4.10)."""
from __future__ import annotations

import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

_RULES_FILE = Path("data") / "validation-rules" / "context-dropping.json"


@pytest.fixture(autouse=True)
def _reset_rules_file():
    """Supprime le fichier de règles avant et après chaque test pour isolation totale."""
    _RULES_FILE.unlink(missing_ok=True)
    yield
    _RULES_FILE.unlink(missing_ok=True)


# ── GET sans fichier → défauts documentés ────────────────────────────────────

def test_get_rules_returns_defaults(client: TestClient):
    r = client.get("/api/v1/validation/rules/context-dropping")
    assert r.status_code == 200
    data = r.json()
    assert "rules_profile" in data
    assert data["rules_profile"] in ("strict", "light")
    assert "mandatory_info" in data
    assert isinstance(data["mandatory_info"], list)
    assert "dialogue_type_overrides" in data


# ── PUT payload minimal valide → GET retourne mêmes champs ───────────────────

def test_put_then_get_round_trip(client: TestClient):
    payload = {
        "rules_profile": "light",
        "tolerance": 0.3,
        "mandatory_info": ["entite-fictive-a", "entite-fictive-b"],
        "dialogue_type_overrides": {"confrontation": {"rules_profile": "strict"}},
    }
    put_r = client.put("/api/v1/validation/rules/context-dropping", json=payload)
    assert put_r.status_code == 200

    get_r = client.get("/api/v1/validation/rules/context-dropping")
    assert get_r.status_code == 200
    data = get_r.json()
    assert data["rules_profile"] == "light"
    assert data["tolerance"] == pytest.approx(0.3)
    assert "entite-fictive-a" in data["mandatory_info"]
    assert "confrontation" in data["dialogue_type_overrides"]


# ── PUT payload minimal (sans champs optionnels) ──────────────────────────────

def test_put_minimal_payload(client: TestClient):
    payload = {"rules_profile": "strict"}
    r = client.put("/api/v1/validation/rules/context-dropping", json=payload)
    assert r.status_code == 200


# ── PUT profil invalide → 422 clair ──────────────────────────────────────────

def test_put_invalid_profile_returns_422(client: TestClient):
    payload = {"rules_profile": "inexistant"}
    r = client.put("/api/v1/validation/rules/context-dropping", json=payload)
    assert r.status_code == 422


# ── Les règles persistées influencent detect-context-dropping ─────────────────

def test_persisted_rules_profile_applied_to_detection(client: TestClient):
    """Règles 'light' persistées → profil_effectif 'light' lors de la détection."""
    client.put(
        "/api/v1/validation/rules/context-dropping",
        json={"rules_profile": "light"},
    )

    body = {
        "nodes": [
            {
                "id": "n1",
                "type": "dialogueNode",
                "position": {"x": 0, "y": 0},
                "data": {
                    "line": "Texte sans référence spéciale.",
                    "choices": [],
                    "stableId": "st-n1",
                },
            }
        ],
        "edges": [],
        "context_selections": {"characters_full": ["Entité Fictive Kappa"]},
    }
    r = client.post("/api/v1/unity-dialogues/graph/detect-context-dropping", json=body)
    assert r.status_code == 200
    assert r.json()["rules_profile_effective"] == "light"

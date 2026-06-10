"""Tests API preview avec stats systèmes de jeu (Story 9.6 Task 6)."""

import json
from collections.abc import Generator
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app
from services.configuration_service import ConfigurationService


def _game_systems_preview_state() -> dict[str, object]:
    """Fixture lisible pour le payload preview stats FR94."""
    return {
        "attributes": {"sociabilite": 4},
        "skills": {"tromperie": 3},
        "effort_pool": 10,
        "reputation_values": {
            "fr94::HEROINE_A::community::garde::Admiration::community_calculated": 35
        },
        "faction_titles": {"garde": "garde_capitaine"},
    }


@pytest.fixture
def client(tmp_path: Path) -> Generator[TestClient, None, None]:
    """Client isolé sur un dossier Unity temporaire."""
    mock_config_service = MagicMock(spec=ConfigurationService)
    mock_config_service.get_unity_dialogues_path.return_value = tmp_path
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_preview_game_systems_payload_round_trips_and_reports_community_limits(
    client: TestClient,
    tmp_path,
) -> None:
    """Le payload stats FR94 round-trip et signale les limites d'agrégat communautaire local."""
    doc_id = "preview-game-systems"
    (tmp_path / f"{doc_id}.json").write_text(
        json.dumps({"schemaVersion": "1.1.0", "nodes": [{"id": "START", "choices": []}]}),
        encoding="utf-8",
    )
    (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 3}), encoding="utf-8")

    game_systems_state = _game_systems_preview_state()

    response = client.post(
        f"/api/v1/documents/{doc_id}/preview",
        json={
            "revision": 3,
            "flag_states": {},
            "reputation_states": {},
            "game_systems_state": game_systems_state,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["game_systems_state"] == game_systems_state
    assert payload["simulation_limits"] == [
        "Agrégat communautaire simulé localement : témoins, propagation et poids PNJ restent responsabilité runtime."
    ]


def test_put_document_reports_reputation_influence_respect_confusion(
    client: TestClient,
) -> None:
    """La validation document réelle remonte la confusion Respect/Réputation."""
    response = client.put(
        "/api/v1/documents/fr94-social-validation",
        json={
            "revision": 1,
            "document": {
                "schemaVersion": "1.1.0",
                "nodes": [
                    {
                        "id": "START",
                        "speaker": "PNJ",
                        "line": "Bonjour",
                        "choices": [],
                        "visibilityConditions": {
                            "combinator": "AND",
                            "items": [
                                {
                                    "kind": "reputation",
                                    "axisId": "Respect",
                                    "factionId": "garde",
                                    "operator": ">=",
                                    "threshold": 10,
                                }
                            ],
                        },
                    }
                ],
            },
        },
    )

    assert response.status_code == 200
    report = response.json()["validationReport"]
    assert {
        "code": "social_system_confusion",
        "message": "Respect appartient au système Influence & Respect (PJ possédés), pas à la Réputation.",
        "path": "nodes[0](START).visibilityConditions.items[0].axisId",
    } in report

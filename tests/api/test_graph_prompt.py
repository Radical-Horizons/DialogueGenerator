"""Tests API pour GET /api/v1/unity-dialogues/graph/prompt (Story 1.14 — transparence prompt)."""
import json
import pytest
from datetime import datetime, UTC
from pathlib import Path
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from api.main import app
from api.dependencies import get_config_service, get_llm_usage_service
from models.llm_usage import LLMUsageRecord


@pytest.fixture
def client():
    """Client de test."""
    return TestClient(app)


@pytest.fixture
def unity_dialogue_file(tmp_path):
    """Crée un fichier dialogue Unity avec deux nœuds (parent → enfant) pour les tests prompt."""
    doc = {
        "schemaVersion": "1.1.0",
        "nodes": [
            {
                "id": "START",
                "speaker": "PNJ",
                "line": "Bonjour, que voulez-vous ?",
                "choices": [
                    {"text": "Accepter", "targetNode": "NODE_START_CHOICE_0", "choiceId": "c1"},
                    {"text": "Refuser", "targetNode": "END", "choiceId": "c2"},
                ],
            },
            {
                "id": "NODE_START_CHOICE_0",
                "speaker": "PNJ",
                "line": "Très bien, allons-y.",
                "nextNode": "END",
            },
        ],
    }
    path = tmp_path / "Test_Dialogue.json"
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return tmp_path, path, doc


@pytest.fixture
def mock_config_and_usage(unity_dialogue_file):
    """Override config (Unity path) et usage service pour les tests prompt."""
    tmp_path, _, _ = unity_dialogue_file
    mock_config = MagicMock()
    mock_config.get_unity_dialogues_path.return_value = str(tmp_path)
    app.dependency_overrides[get_config_service] = lambda: mock_config
    # Usage service par défaut (pas de record stocké → prompt reconstruit)
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_config_service, None)
        app.dependency_overrides.pop(get_llm_usage_service, None)


class TestGetNodePrompt:
    """Tests GET /api/v1/unity-dialogues/graph/prompt."""

    def test_get_prompt_200_reconstructed(
        self, client: TestClient, unity_dialogue_file, mock_config_and_usage
    ):
        """GIVEN un dialogue avec nœuds
        WHEN GET /graph/prompt?dialogue_id=Test_Dialogue&node_id=NODE_START_CHOICE_0
        THEN 200, raw_prompt contient contexte parent + choix, is_historical=False."""
        _tmp, path, _ = unity_dialogue_file
        assert path.exists()
        response = client.get(
            "/api/v1/unity-dialogues/graph/prompt",
            params={"dialogue_id": "Test_Dialogue", "node_id": "NODE_START_CHOICE_0"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "raw_prompt" in data
        assert data["is_historical"] is False
        assert data.get("message") == "Prompt reconstruit (contexte actuel)"
        raw = data["raw_prompt"]
        assert "Contexte précédent" in raw
        assert "PNJ" in raw
        assert "Bonjour, que voulez-vous" in raw
        assert "Réponse du joueur" in raw
        assert "Accepter" in raw
        assert "Instructions pour la suite" in raw

    def test_get_prompt_accepts_dialogue_id_with_json(
        self, client: TestClient, unity_dialogue_file, mock_config_and_usage
    ):
        """GIVEN dialogue_id avec .json
        WHEN GET /graph/prompt avec dialogue_id=Test_Dialogue.json
        THEN 200."""
        response = client.get(
            "/api/v1/unity-dialogues/graph/prompt",
            params={"dialogue_id": "Test_Dialogue.json", "node_id": "NODE_START_CHOICE_0"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "raw_prompt" in data

    def test_get_prompt_404_node_not_found(
        self, client: TestClient, unity_dialogue_file, mock_config_and_usage
    ):
        """GIVEN un dialogue existant
        WHEN GET /graph/prompt avec node_id inexistant
        THEN 404."""
        response = client.get(
            "/api/v1/unity-dialogues/graph/prompt",
            params={"dialogue_id": "Test_Dialogue", "node_id": "NODE_INEXISTANT"},
        )
        assert response.status_code == 404

    def test_get_prompt_404_dialogue_not_found(
        self, client: TestClient, unity_dialogue_file, mock_config_and_usage
    ):
        """GIVEN chemin Unity configuré
        WHEN GET /graph/prompt avec dialogue_id absent
        THEN 404."""
        response = client.get(
            "/api/v1/unity-dialogues/graph/prompt",
            params={"dialogue_id": "FichierQuiNExistePas", "node_id": "NODE_START_CHOICE_0"},
        )
        assert response.status_code == 404

    def test_get_prompt_422_unity_path_not_configured(
        self, client: TestClient, unity_dialogue_file
    ):
        """GIVEN get_unity_dialogues_path retourne None
        WHEN GET /graph/prompt
        THEN 422."""
        mock_config = MagicMock()
        mock_config.get_unity_dialogues_path.return_value = None
        app.dependency_overrides[get_config_service] = lambda: mock_config
        try:
            response = client.get(
                "/api/v1/unity-dialogues/graph/prompt",
                params={"dialogue_id": "Test_Dialogue", "node_id": "NODE_START_CHOICE_0"},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.pop(get_config_service, None)

    def test_get_prompt_node_without_parent_uses_default_instructions(
        self, client: TestClient, tmp_path, mock_config_and_usage
    ):
        """GIVEN un dialogue avec un nœud sans parent (ex: START)
        WHEN GET prompt pour ce nœud
        THEN 200 et raw_prompt contient instructions par défaut."""
        doc = {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "START",
                    "speaker": "PNJ",
                    "line": "Première réplique",
                    "nextNode": "END",
                },
            ],
        }
        path = tmp_path / "Solo.json"
        path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
        mock_config = MagicMock()
        mock_config.get_unity_dialogues_path.return_value = str(tmp_path)
        app.dependency_overrides[get_config_service] = lambda: mock_config
        try:
            response = client.get(
                "/api/v1/unity-dialogues/graph/prompt",
                params={"dialogue_id": "Solo", "node_id": "START"},
            )
            assert response.status_code == 200
            data = response.json()
            assert "raw_prompt" in data
            assert "Ecris la réponse du PNJ" in data["raw_prompt"]
        finally:
            app.dependency_overrides.pop(get_config_service, None)

    def test_get_prompt_200_with_usage_record_tokens(
        self, client: TestClient, unity_dialogue_file, mock_config_and_usage
    ):
        """GIVEN un dialogue et un usage service qui retourne un record avec tokens
        WHEN GET /graph/prompt
        THEN 200 et la réponse contient prompt_tokens, completion_tokens (et raw_prompt reconstruit)."""
        _tmp, path, _ = unity_dialogue_file
        assert path.exists()
        record = LLMUsageRecord(
            request_id="req_test",
            timestamp=datetime.now(UTC),
            model_name="gpt-4o",
            prompt_tokens=120,
            completion_tokens=80,
            total_tokens=200,
            estimated_cost=0.001,
            duration_ms=1500,
            success=True,
            endpoint="graph/generate-node",
            k_variants=1,
            dialogue_id="Test_Dialogue",
            node_id="NODE_START_CHOICE_0",
        )
        mock_repo = MagicMock()
        mock_repo.get_by_dialogue_and_node.return_value = record
        mock_usage_service = MagicMock()
        mock_usage_service.repository = mock_repo
        app.dependency_overrides[get_llm_usage_service] = lambda: mock_usage_service
        try:
            response = client.get(
                "/api/v1/unity-dialogues/graph/prompt",
                params={"dialogue_id": "Test_Dialogue", "node_id": "NODE_START_CHOICE_0"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["prompt_tokens"] == 120
            assert data["completion_tokens"] == 80
            assert "raw_prompt" in data
            assert data["is_historical"] is False
        finally:
            app.dependency_overrides.pop(get_llm_usage_service, None)

    def test_get_prompt_200_uses_stored_prompt_when_present(
        self, client: TestClient, unity_dialogue_file, mock_config_and_usage
    ):
        """GIVEN un record avec champ prompt (Story 1.15+)
        WHEN GET /graph/prompt
        THEN 200, raw_prompt = contenu stocké, is_historical=True."""
        _tmp, path, _ = unity_dialogue_file
        assert path.exists()
        record = LLMUsageRecord(
            request_id="req_stored",
            timestamp=datetime.now(UTC),
            model_name="gpt-4o",
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            estimated_cost=0.0005,
            duration_ms=1000,
            success=True,
            endpoint="graph/generate-node",
            k_variants=1,
            dialogue_id="Test_Dialogue",
            node_id="NODE_START_CHOICE_0",
        )
        record_with_prompt = MagicMock()
        record_with_prompt.prompt = "System: You are a writer.\n\nUser: Contexte précédent:\nPNJ: Hello."
        record_with_prompt.prompt_tokens = 100
        record_with_prompt.completion_tokens = 50
        record_with_prompt.timestamp = record.timestamp
        mock_repo = MagicMock()
        mock_repo.get_by_dialogue_and_node.return_value = record_with_prompt
        mock_usage_service = MagicMock()
        mock_usage_service.repository = mock_repo
        app.dependency_overrides[get_llm_usage_service] = lambda: mock_usage_service
        try:
            response = client.get(
                "/api/v1/unity-dialogues/graph/prompt",
                params={"dialogue_id": "Test_Dialogue", "node_id": "NODE_START_CHOICE_0"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["raw_prompt"] == "System: You are a writer.\n\nUser: Contexte précédent:\nPNJ: Hello."
            assert data["is_historical"] is True
            assert "Prompt historique" in (data.get("message") or "")
            assert data["prompt_tokens"] == 100
            assert data["completion_tokens"] == 50
        finally:
            app.dependency_overrides.pop(get_llm_usage_service, None)

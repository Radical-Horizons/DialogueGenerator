"""Tests pour l'endpoint POST /api/v1/unity-dialogues/graph/estimate-cost."""
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

from api.main import app
from api.dependencies import (
    get_config_service,
    get_token_estimation_service,
    get_llm_pricing_service,
)
from services.configuration_service import ConfigurationService
from services.token_estimation_service import TokenEstimationService
from services.llm_pricing_service import LLMPricingService


@pytest.fixture
def mock_config_service():
    """Mock du ConfigurationService pour estimate-cost."""
    mock = MagicMock(spec=ConfigurationService)
    mock.get_available_llm_models.return_value = [
        {"api_identifier": "gpt-4o", "model_identifier": "gpt-4o"},
    ]
    return mock


@pytest.fixture
def pricing_config_path(tmp_path):
    """Fichier de prix temporaire pour tests prévisibles."""
    config_file = tmp_path / "llm_pricing.json"
    config_file.write_text("""{
  "models": {
    "gpt-4o": {
      "input_price_per_1M": 2.50,
      "output_price_per_1M": 10.00
    }
  }
}""")
    return config_file


@pytest.fixture
def client(mock_config_service, pricing_config_path):
    """Client de test avec config et pricing injectés."""
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    app.dependency_overrides[get_llm_pricing_service] = lambda: LLMPricingService(
        config_path=pricing_config_path
    )
    # TokenEstimationService par défaut (pas de mock)
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def valid_estimate_body():
    """Body valide pour estimate-cost (aligné sur GenerateNodeRequest)."""
    return {
        "parent_node_id": "NODE_1",
        "parent_node_content": {
            "id": "NODE_1",
            "speaker": "PNJ",
            "line": "Bonjour.",
            "choices": [{"text": "Réponse A", "targetNode": None}],
        },
        "user_instructions": "Continue.",
        "context_selections": {},
        "generate_all_choices": False,
        "llm_model_identifier": "gpt-4o",
    }


def test_estimate_cost_returns_200_and_shape(client, valid_estimate_body):
    """POST /estimate-cost retourne 200 et le schéma de réponse attendu."""
    response = client.post(
        "/api/v1/unity-dialogues/graph/estimate-cost",
        json=valid_estimate_body,
    )
    assert response.status_code == 200
    data = response.json()
    assert "estimated_cost_eur" in data
    assert "prompt_tokens" in data
    assert "completion_tokens" in data
    assert "model_id" in data
    assert "provider" in data
    assert data["model_id"] == "gpt-4o"
    assert data["provider"] in ("openai", "mistral")
    assert isinstance(data["prompt_tokens"], int)
    assert isinstance(data["completion_tokens"], int)
    assert data["prompt_tokens"] >= 0
    assert data["completion_tokens"] >= 1
    assert isinstance(data["estimated_cost_eur"], (int, float))


def test_estimate_cost_batch_count(client, valid_estimate_body):
    """En generate_all_choices avec plusieurs choix, batch_count et breakdown présents."""
    valid_estimate_body["parent_node_content"]["choices"] = [
        {"text": "A", "targetNode": None},
        {"text": "B", "targetNode": None},
    ]
    valid_estimate_body["generate_all_choices"] = True
    response = client.post(
        "/api/v1/unity-dialogues/graph/estimate-cost",
        json=valid_estimate_body,
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("batch_count") == 2
    assert "per_node_breakdown" in data
    assert data["per_node_breakdown"] is not None
    assert len(data["per_node_breakdown"]) == 2


def test_estimate_cost_default_model(client, valid_estimate_body):
    """Sans llm_model_identifier, le premier modèle disponible est utilisé."""
    del valid_estimate_body["llm_model_identifier"]
    response = client.post(
        "/api/v1/unity-dialogues/graph/estimate-cost",
        json=valid_estimate_body,
    )
    assert response.status_code == 200
    assert response.json()["model_id"] == "gpt-4o"

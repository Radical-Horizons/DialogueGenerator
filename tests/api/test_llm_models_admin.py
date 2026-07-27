"""Tests admin CRUD des modèles LLM."""

from __future__ import annotations

from typing import Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service, get_llm_pricing_service
from api.main import app
from api.routers.auth import get_current_user_or_none


def _admin_user() -> dict[str, object]:
    return {
        "id": "admin-id",
        "username": "admin",
        "role": "admin",
        "is_active": True,
    }


def _writer_user() -> dict[str, object]:
    return {
        "id": "writer-id",
        "username": "writer",
        "role": "writer",
        "is_active": True,
    }


@pytest.fixture
def admin_client(client: TestClient) -> Iterator[TestClient]:
    """Client avec utilisateur admin mocké."""

    def _override() -> dict[str, object]:
        return _admin_user()

    app.dependency_overrides[get_current_user_or_none] = _override
    yield client
    app.dependency_overrides.pop(get_current_user_or_none, None)


@pytest.fixture
def writer_client(client: TestClient) -> Iterator[TestClient]:
    """Client avec utilisateur writer mocké."""

    def _override() -> dict[str, object]:
        return _writer_user()

    app.dependency_overrides[get_current_user_or_none] = _override
    yield client
    app.dependency_overrides.pop(get_current_user_or_none, None)


def test_create_llm_model_requires_admin(writer_client: TestClient) -> None:
    """Writer ne peut pas créer de modèle."""
    response = writer_client.post(
        "/api/v1/config/llm/models",
        json={
            "api_identifier": "test/provider-model",
            "display_name": "Test Model",
            "client_type": "openrouter",
        },
    )
    assert response.status_code == 403


def test_create_and_delete_llm_model_admin(admin_client: TestClient) -> None:
    """Admin peut créer puis supprimer un modèle openrouter (mocks persist)."""
    mock_config = MagicMock()
    mock_config.upsert_llm_model.return_value = {
        "api_identifier": "test/or-model",
        "display_name": "OR Test",
        "client_type": "openrouter",
        "parameters": {"max_tokens": 8000, "default_temperature": 0.7},
    }
    mock_config.get_available_llm_models.return_value = [
        {
            "api_identifier": "test/or-model",
            "display_name": "OR Test",
            "client_type": "openrouter",
            "parameters": {"max_tokens": 8000, "default_temperature": 0.7},
        }
    ]
    mock_config.remove_llm_model.return_value = True
    mock_pricing = MagicMock()

    app.dependency_overrides[get_config_service] = lambda: mock_config
    app.dependency_overrides[get_llm_pricing_service] = lambda: mock_pricing
    try:
        create_resp = admin_client.post(
            "/api/v1/config/llm/models",
            json={
                "api_identifier": "test/or-model",
                "display_name": "OR Test",
                "client_type": "openrouter",
                "max_tokens": 8000,
                "input_price_per_1M": 0.5,
                "output_price_per_1M": 1.0,
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        body = create_resp.json()
        assert body["model_identifier"] == "test/or-model"
        assert body["client_type"] == "openrouter"
        mock_pricing.upsert_model_pricing.assert_called_once()

        delete_resp = admin_client.delete("/api/v1/config/llm/models/test/or-model")
        assert delete_resp.status_code == 204
        mock_config.remove_llm_model.assert_called_once_with("test/or-model")
        mock_pricing.remove_model_pricing.assert_called_once_with("test/or-model")
    finally:
        app.dependency_overrides.pop(get_config_service, None)
        app.dependency_overrides.pop(get_llm_pricing_service, None)

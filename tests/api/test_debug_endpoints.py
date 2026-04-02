"""Tests de protection des endpoints de debug."""
import os

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch


DEBUG_RAW_JSON_PAYLOAD = {
    "context_selections": {
        "characters_full": [],
        "locations_full": [],
        "items_full": [],
        "species_full": [],
        "communities_full": [],
    },
    "user_instructions": "Test debug endpoint",
    "max_context_tokens": 1000,
}


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/debug/prompt-engine", None),
        ("get", "/api/v1/config/debug/prompt-engine", None),
        ("post", "/api/v1/dialogues/debug/raw-json", DEBUG_RAW_JSON_PAYLOAD),
    ],
)
def test_debug_endpoints_return_404_when_disabled(
    client: TestClient,
    method: str,
    path: str,
    payload: dict[str, object] | None,
) -> None:
    """En production, les endpoints de debug sont masqués (404 + enveloppe API)."""
    with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=False):
        request_method = getattr(client, method)
        response = (
            request_method(path, json=payload)
            if payload is not None
            else request_method(path)
        )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"

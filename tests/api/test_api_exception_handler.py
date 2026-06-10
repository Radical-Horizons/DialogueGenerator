"""Tests handler global APIException (redaction prod)."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest

from api.exceptions import InternalServerException, NotFoundException
from api.main import api_exception_handler


def test_api_exception_handler_redacts_internal_details_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    request = MagicMock()
    request.state.request_id = "req-1"
    exc = InternalServerException(
        message="Erreur interne",
        details={"error": "boom"},
        request_id="req-1",
    )

    response = asyncio.run(api_exception_handler(request, exc))
    import json

    payload = json.loads(response.body.decode("utf-8"))
    assert payload["error"]["details"] == {}


def test_api_exception_handler_keeps_internal_details_in_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "development")
    request = MagicMock()
    request.state.request_id = "req-1"
    exc = InternalServerException(
        message="Erreur interne",
        details={"error": "boom"},
        request_id="req-1",
    )

    response = asyncio.run(api_exception_handler(request, exc))
    import json

    payload = json.loads(response.body.decode("utf-8"))
    assert payload["error"]["details"] == {"error": "boom"}


def test_api_exception_handler_keeps_non_internal_details_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    request = MagicMock()
    request.state.request_id = "req-2"
    exc = NotFoundException(resource_type="Document", resource_id="x", request_id="req-2")

    response = asyncio.run(api_exception_handler(request, exc))
    payload = response.body.decode("utf-8")

    assert "Document" in payload

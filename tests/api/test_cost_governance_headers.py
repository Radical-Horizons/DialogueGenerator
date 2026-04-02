"""Tests des en-têtes d'estimation du CostGovernanceMiddleware."""
from starlette.requests import Request

from api.middleware.cost_governance import _parse_positive_int_header


def test_parse_positive_int_header_accepts_valid_value() -> None:
    """Un entier positif dans les bornes est accepté."""
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "method": "POST",
        "path": "/api/v1/dialogues/generate/jobs",
        "raw_path": b"/",
        "root_path": "",
        "scheme": "http",
        "query_string": b"",
        "headers": [(b"x-estimated-prompt-tokens", b"8421")],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
    }
    request = Request(scope)
    assert _parse_positive_int_header(request, "x-estimated-prompt-tokens") == 8421


def test_parse_positive_int_header_rejects_negative() -> None:
    """Les valeurs négatives sont ignorées (None)."""
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "method": "POST",
        "path": "/",
        "raw_path": b"/",
        "root_path": "",
        "scheme": "http",
        "query_string": b"",
        "headers": [(b"x-estimated-prompt-tokens", b"-1")],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
    }
    request = Request(scope)
    assert _parse_positive_int_header(request, "x-estimated-prompt-tokens") is None


def test_parse_positive_int_header_missing() -> None:
    """Absence d'en-tête → None."""
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "method": "POST",
        "path": "/",
        "raw_path": b"/",
        "root_path": "",
        "scheme": "http",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
    }
    request = Request(scope)
    assert _parse_positive_int_header(request, "x-estimated-prompt-tokens") is None

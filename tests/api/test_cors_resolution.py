"""Tests pour la résolution CORS (PUBLIC_ORIGIN / CORS_ORIGINS)."""
import os
from unittest.mock import patch

from api.config.cors_resolution import normalize_browser_origin, resolve_production_cors_origins


def test_normalize_full_url_strips_path() -> None:
    assert normalize_browser_origin("https://demo.example/login") == "https://demo.example"


def test_normalize_domain_adds_https() -> None:
    assert normalize_browser_origin("demo.example") == "https://demo.example"


def test_normalize_localhost_port() -> None:
    assert normalize_browser_origin("http://localhost:3000/path") == "http://localhost:3000"


def test_resolve_prefers_cors_over_public() -> None:
    with patch.dict(
        os.environ,
        {"CORS_ORIGINS": "https://a.com", "PUBLIC_ORIGIN": "https://b.com"},
        clear=True,
    ):
        assert resolve_production_cors_origins() == ["https://a.com"]


def test_resolve_public_when_cors_empty() -> None:
    with patch.dict(
        os.environ,
        {"PUBLIC_ORIGIN": "https://demo.auto-diffusion.net/login"},
        clear=True,
    ):
        assert resolve_production_cors_origins() == ["https://demo.auto-diffusion.net"]


def test_resolve_csv_public() -> None:
    with patch.dict(
        os.environ,
        {"PUBLIC_ORIGIN": "https://a.com,https://b.com"},
        clear=True,
    ):
        assert resolve_production_cors_origins() == ["https://a.com", "https://b.com"]


def test_resolve_empty_when_unset() -> None:
    with patch.dict(os.environ, {}, clear=True):
        assert resolve_production_cors_origins() == []

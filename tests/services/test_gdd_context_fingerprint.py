"""Tests empreinte contexte GDD (Story 3.9)."""
from unittest.mock import MagicMock

from services.gdd_context_fingerprint import (
    compute_gdd_content_fingerprint,
    structured_context_fingerprint,
)


def test_structured_context_fingerprint_stable() -> None:
    a = structured_context_fingerprint({"z": 1, "a": {"b": 2}})
    b = structured_context_fingerprint({"a": {"b": 2}, "z": 1})
    assert a == b
    assert len(a) == 64


def test_compute_gdd_content_fingerprint_delegates_to_builder() -> None:
    mock_cb = MagicMock()
    mock_cb.build_context_json.return_value = {"x": 1}

    fp = compute_gdd_content_fingerprint(mock_cb, {"characters": ["A"]})

    mock_cb.load_gdd_files.assert_called_once()
    mock_cb.build_context_json.assert_called_once()
    assert fp == structured_context_fingerprint({"x": 1})

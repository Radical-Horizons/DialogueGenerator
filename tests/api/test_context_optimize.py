"""Tests POST /api/v1/context/optimize (FR21)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

from core.context.context_builder import ContextBuilder
from api.schemas.dialogue import ContextSelection, OptimizeContextResponse
from services.context_token_budget import ContextSelectionTokenMetrics


@pytest.fixture
def mock_context_builder_opt():
    mock_builder = MagicMock(spec=ContextBuilder)
    mock_builder.build_context_json = MagicMock(return_value=MagicMock())
    mock_builder.serialize_context_to_text = MagicMock(return_value="ctx")
    mock_builder._count_tokens = MagicMock(return_value=10)
    return mock_builder


@pytest.fixture
def optimize_client(monkeypatch, mock_context_builder_opt):
    """Client avec ContextBuilder mocké et métriques token synthétiques."""

    def token_fn(s: ContextSelection) -> int:
        d = s.model_dump()
        return sum(
            len(d[f"{t}_full"]) * 800 + len(d[f"{t}_excerpt"]) * 80
            for t in ("characters", "locations", "items", "species", "communities")
        )

    def fake_metrics(_b, *, full_selection, **kwargs):
        return ContextSelectionTokenMetrics(
            selection_tokens=token_fn(full_selection),
            context_tokens=token_fn(full_selection),
            breakdown=[],
            breakdown_note="test",
        )

    import services.context_selection_optimizer as opt_mod

    monkeypatch.setattr(opt_mod, "compute_context_selection_token_metrics", fake_metrics)

    from api.main import app
    from api.dependencies import get_context_builder

    app.dependency_overrides[get_context_builder] = lambda: mock_context_builder_opt
    yield TestClient(app)
    app.dependency_overrides.clear()


def _minimal_optimize_body(budget: int = 50_000) -> dict:
    return {
        "user_instructions": " ",
        "context_selections": {
            "characters_full": ["Alice"],
            "characters_excerpt": [],
            "locations_full": [],
            "locations_excerpt": [],
            "items_full": [],
            "items_excerpt": [],
            "species_full": [],
            "species_excerpt": [],
            "communities_full": [],
            "communities_excerpt": [],
            "dialogues_examples": [],
        },
        "choices_mode": "free",
        "max_context_tokens": budget,
        "include_narrative_guides": True,
        "optimization_rules": {
            "pinned_entity_keys": [],
            "strategy": "conservative",
            "pre_generation_proxy_warning_threshold_percent": 50,
        },
    }


def test_optimize_returns_200_and_schema(optimize_client: TestClient) -> None:
    body = _minimal_optimize_body(10_000)
    body["context_selections"]["characters_full"] = [f"C{i}" for i in range(14)]
    r = optimize_client.post("/api/v1/context/optimize", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    parsed = OptimizeContextResponse.model_validate(data)
    assert "proposed_context_selections" in data
    assert "selection_tokens_before" in data
    assert "pre_generation_context_fidelity_proxy_percent" in data
    assert isinstance(parsed.warnings, list)
    assert parsed.budget_respected is True
    assert data.get("budget_respected") is True


def test_optimize_no_op_when_budget_high(optimize_client: TestClient) -> None:
    body = _minimal_optimize_body(100_000)
    r = optimize_client.post("/api/v1/context/optimize", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data.get("no_op") is True
    assert data.get("tokens_saved") == 0
    assert data.get("budget_respected") is True


def test_optimize_422_on_invalid_rules(optimize_client: TestClient) -> None:
    body = _minimal_optimize_body()
    body["optimization_rules"] = {"pre_generation_proxy_warning_threshold_percent": 0}
    r = optimize_client.post("/api/v1/context/optimize", json=body)
    assert r.status_code == 422

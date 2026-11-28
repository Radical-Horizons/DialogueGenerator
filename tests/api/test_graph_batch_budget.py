"""Budget des lots : le refus porte sur l'estimation montrée à l'auteur.

Un emplacement à écrire = un appel LLM avec le prompt complet. ``estimate-cost``, le job
multi-parents et ``generate-node`` en lot de choix doivent compter pareil. Aucun appel LLM.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Iterator, List
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_batch_node_generation_job_manager,
    get_batch_node_generation_service,
    get_config_service,
    get_context_builder,
    get_cost_governance_service,
    get_graph_node_orchestrator,
    get_graph_prompt_context_factory,
    get_llm_pricing_service,
    get_llm_usage_service,
    get_token_estimation_service,
)
from api.main import app
from api.routers.auth import get_current_user
from api.routers.graph_cost import _estimate_cost_cache
from api.services.batch_node_generation_job_manager import BatchNodeGenerationJobManager
from services.batch_node_generation_service import BatchNodeGenerationReport

BASE = "/api/v1/unity-dialogues/graph"
PROMPT_TOKENS = 12_500
COMPLETION_TOKENS = 800

# Test à moitié écrit (2 vides) + choix simple + choix déjà relié = 3 emplacements.
CHOICES: List[Dict[str, Any]] = [
    {
        "text": "Convaincre.",
        "test": "Sociabilité+Rhétorique:8",
        "testSuccessNode": "NODE_S",
        "testFailureNode": "NODE_F",
    },
    {"text": "Partir.", "targetNode": "END"},
    {"text": "Rester.", "targetNode": "NODE_SUITE"},
]
SLOTS_PER_PARENT = 3


def _parent_content(choices: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"speaker": "PNJ", "line": "Alors ?", "choices": choices}


def _job_body(parent_count: int, choices: List[Dict[str, Any]] = CHOICES) -> Dict[str, Any]:
    return {
        "parents": [
            {
                "parent_node_id": f"n{i}",
                "parent_node_content": _parent_content(choices),
                "context_selections": {},
            }
            for i in range(parent_count)
        ]
    }


def _provide(value: Any) -> Callable[[], Any]:
    """Override sans paramètre : FastAPI lirait un défaut comme un paramètre de requête."""
    return lambda: value


@pytest.fixture
def services() -> Iterator[Dict[str, MagicMock]]:
    """API avec estimation à tokens fixes, tarif linéaire et budget pilotable."""
    config = MagicMock()
    config.get_available_llm_models.return_value = []
    context_builder = MagicMock()
    context_builder.get_characters_names.return_value = []
    factory = MagicMock()
    factory.default_system_prompt.return_value = "système"
    factory.build.return_value.render.return_value = "prompt"
    tokens = MagicMock()
    tokens.estimate_tokens.return_value = (PROMPT_TOKENS, COMPLETION_TOKENS)
    pricing = MagicMock()
    pricing.calculate_cost.side_effect = lambda *args, **kwargs: (
        sum(args[1:3]) if args[1:] else kwargs["prompt_tokens"] + kwargs["completion_tokens"]
    ) / 1_000_000
    pricing.get_model_pricing.return_value = None
    cost = MagicMock()
    cost.check_budget.return_value = {"allowed": True, "percentage": 0.0, "warning": None}
    batch_service = MagicMock()
    batch_service.generate_batch = AsyncMock(
        return_value=BatchNodeGenerationReport(items=[], started_at="t0", finished_at="t1")
    )
    orchestrator = MagicMock()
    orchestrator.generate = AsyncMock(side_effect=AssertionError("appel LLM non attendu"))
    jobs = BatchNodeGenerationJobManager()

    overrides = {
        get_config_service: config,
        get_llm_usage_service: MagicMock(),
        get_context_builder: context_builder,
        get_graph_prompt_context_factory: factory,
        get_token_estimation_service: tokens,
        get_llm_pricing_service: pricing,
        get_cost_governance_service: cost,
        get_batch_node_generation_service: batch_service,
        get_batch_node_generation_job_manager: jobs,
        get_graph_node_orchestrator: orchestrator,
    }
    for dependency, value in overrides.items():
        app.dependency_overrides[dependency] = _provide(value)
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "writer-1",
        "username": "writer-1",
        "role": "writer",
        "is_active": True,
    }
    _estimate_cost_cache.clear()
    try:
        yield {
            "cost": cost,
            "pricing": pricing,
            "batch_service": batch_service,
            "orchestrator": orchestrator,
            "factory": factory,
        }
    finally:
        app.dependency_overrides.clear()
        _estimate_cost_cache.clear()


def _estimate(client: TestClient, choices: List[Dict[str, Any]]) -> Dict[str, Any]:
    response = client.post(
        f"{BASE}/estimate-cost",
        json={
            "parent_node_id": "n0",
            "parent_node_content": _parent_content(choices),
            "user_instructions": "",
            "context_selections": {},
            "generate_all_choices": True,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_estimate_counts_one_full_prompt_per_open_slot(
    services: Dict[str, MagicMock],
) -> None:
    """Emplacements × (prompt + réponse) : les issues écrites ne comptent pas."""
    data = _estimate(TestClient(app), CHOICES)

    assert data["batch_count"] == SLOTS_PER_PARENT
    assert data["prompt_tokens"] == PROMPT_TOKENS * SLOTS_PER_PARENT
    assert data["completion_tokens"] == COMPLETION_TOKENS * SLOTS_PER_PARENT
    assert [n["prompt_tokens"] for n in data["per_node_breakdown"]] == [
        PROMPT_TOKENS
    ] * SLOTS_PER_PARENT


def test_job_budget_is_checked_on_the_shown_estimate(
    services: Dict[str, MagicMock],
) -> None:
    """Le montant opposé au budget est la somme des estimations par parent."""
    client = TestClient(app)
    shown = _estimate(client, CHOICES)

    response = client.post(f"{BASE}/batch-generate-from-nodes/jobs", json=_job_body(10))

    assert response.status_code == 202, response.text
    checked = services["cost"].check_budget.call_args.kwargs["estimated_cost"]
    assert checked == pytest.approx(
        10 * (shown["prompt_tokens"] + shown["completion_tokens"]) / 1_000_000
    )


def test_job_refused_when_real_cost_exceeds_remaining_budget(
    services: Dict[str, MagicMock],
) -> None:
    """Un budget que le forfait (6 000 tokens/parent) laissait passer refuse le lot."""
    remaining_usd = 0.2  # forfait : 0,06 ; estimation réelle : 0,399
    services["cost"].check_budget.side_effect = lambda **kwargs: {
        "allowed": kwargs["estimated_cost"] < remaining_usd,
        "percentage": 100.0,
        "warning": "Monthly quota reached",
    }

    response = TestClient(app).post(
        f"{BASE}/batch-generate-from-nodes/jobs", json=_job_body(10)
    )

    assert response.status_code == 429, response.text
    assert response.json()["error"]["code"] == "QUOTA_EXCEEDED"
    assert not services["batch_service"].generate_batch.called


def test_choices_batch_on_generate_node_is_refused_before_any_llm_call(
    services: Dict[str, MagicMock],
) -> None:
    """Lot de choix (et lot de moins de 10 parents, en boucle front) : même contrôle."""
    services["cost"].check_budget.return_value = {
        "allowed": False,
        "percentage": 104.0,
        "warning": "Monthly quota reached",
    }

    response = TestClient(app).post(
        f"{BASE}/generate-node",
        json={
            "parent_node_id": "n0",
            "parent_node_content": _parent_content(CHOICES),
            "user_instructions": "Continue.",
            "context_selections": {},
            "generate_all_choices": True,
        },
    )

    assert response.status_code == 429, response.text
    assert response.json()["error"]["code"] == "QUOTA_EXCEEDED"
    assert services["cost"].check_budget.call_args.kwargs["estimated_cost"] == pytest.approx(
        SLOTS_PER_PARENT * (PROMPT_TOKENS + COMPLETION_TOKENS) / 1_000_000
    )
    assert not services["orchestrator"].generate.called


def test_batch_budget_builds_a_shared_context_once(
    services: Dict[str, MagicMock],
) -> None:
    """Parents d'une même scène : le contexte GDD n'est résolu qu'une fois."""
    response = TestClient(app).post(
        f"{BASE}/batch-generate-from-nodes/jobs", json=_job_body(40)
    )

    assert response.status_code == 202, response.text
    assert services["factory"].build.call_count == 1

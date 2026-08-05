"""Tests du contrat API de la comparaison par paires."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_benchmark_criteria_store,
    get_benchmark_pairwise_pass_service,
    get_benchmark_run_service,
    get_benchmark_suite_store,
)
from api.main import app
from api.routers.auth import get_current_user_or_none
from api.schemas.benchmark import BenchmarkModelDiagnostic
from models.benchmark_judge_output import (
    BenchmarkPairwiseCriterionVerdict,
    BenchmarkPairwiseJudgeResult,
)
from api.schemas.benchmark_judging import CriteriaGrid, CriterionDefinition
from services.benchmark_criteria_store import BenchmarkCriteriaStore
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_judge_pass_service import BenchmarkPairwisePassService
from services.benchmark_judge_service import BenchmarkPairwiseJudgeService
from services.benchmark_run_service import BenchmarkRunService
from services.benchmark_suite_store import BenchmarkSuiteStore

MODEL_A = "gpt-5.6-luna"
MODEL_B = "gpt-5.6-terra"
JUDGE = "gpt-5.6-sol"
BASE = "/api/v1/benchmark"
CRITERIA = ("voice_fidelity", "french_correctness")

FRENCH_LINE = (
    "Je n'ai pas confiance en toi, marchand : tu vends des promesses et tu gardes "
    "les pièces. Dis-moi ce que tu veux vraiment."
)


def _unity_document() -> str:
    """Génération Unity valide et française."""
    return json.dumps(
        {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "node-1",
                    "displayName": "Marchandage",
                    "speaker": "Uresaïr",
                    "line": FRENCH_LINE,
                    "choices": [
                        {
                            "choiceId": "choice_node-1_0",
                            "text": "Refuser net et tourner les talons",
                            "targetNode": "END",
                        }
                    ],
                }
            ],
        },
        ensure_ascii=False,
    )


class _Event:
    """Événement de génération."""

    def __init__(self, type: str, data: Dict[str, Any]) -> None:
        self.type = type
        self.data = data


class _FakeConfigService:
    """Configuration LLM minimale."""

    def get_llm_config(self) -> Dict[str, Any]:
        return {}

    def get_available_llm_models(self) -> List[Dict[str, Any]]:
        return [{"api_identifier": MODEL_A, "client_type": "openai"}]

    def get_llm_fallback_chain(self) -> List[str]:
        return []


class _FakeOrchestrator:
    """Orchestrateur émettant une génération valide."""

    def __init__(self) -> None:
        self.config_service = _FakeConfigService()

    async def generate_with_events(self, request: Any, check_cancelled: Any):
        """Émet metadata puis complete."""
        yield _Event("metadata", {"cost_usd": 0.001})
        yield _Event(
            "complete",
            {"result": {"json_content": _unity_document(), "raw_prompt": "p", "prompt_hash": "h"}},
        )


class _FakePricingService:
    """Tarification fictive."""

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        return {"input_price_per_1M": 1.0}

    def calculate_cost(self, model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
        return 0.0001


class _FakeJudge:
    """Juge répondant sur tous les critères."""

    def __init__(self) -> None:
        self.last_call_cost = 0.0002
        self.last_usage_prompt_tokens = 100
        self.last_usage_completion_tokens = 30

    async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
        """Désigne la position A."""
        return [
            BenchmarkPairwiseJudgeResult(
                criteria=[
                    BenchmarkPairwiseCriterionVerdict(
                        criterion_id=cid, winner="A", margin=2, comment="ok"
                    )
                    for cid in CRITERIA
                ],
                reasoning="audit",
            )
        ]


@pytest.fixture
def pairwise_client(tmp_path: Path) -> Iterator[tuple[TestClient, Any, Any]]:
    """Client API dont les services benchmark pointent sur `tmp_path`."""
    suite_store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
    run_service = BenchmarkRunService(
        suite_store=suite_store,
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda rid: _FakeOrchestrator(),
        runs_dir=tmp_path / "runs",
    )
    run_service.diagnose_models = lambda models: [  # type: ignore[method-assign]
        BenchmarkModelDiagnostic(model_id=m, usable=True) for m in models
    ]
    criteria_store = BenchmarkCriteriaStore(criteria_dir=tmp_path / "criteria")
    criteria_store.save_grid(
        CriteriaGrid(
            grid_id="test",
            criteria=[
                CriterionDefinition(criterion_id=cid, label=cid, description=f"Consigne {cid}.")
                for cid in CRITERIA
            ],
        ),
        bump_version=False,
    )
    pass_service = BenchmarkPairwisePassService(
        run_service=run_service,
        criteria_store=criteria_store,
        judge_service=BenchmarkPairwiseJudgeService(),
        pricing_service=_FakePricingService(),
        llm_client_factory=lambda model_id: _FakeJudge(),
    )

    app.dependency_overrides[get_benchmark_suite_store] = lambda: suite_store
    app.dependency_overrides[get_benchmark_run_service] = lambda: run_service
    app.dependency_overrides[get_benchmark_criteria_store] = lambda: criteria_store
    app.dependency_overrides[get_benchmark_pairwise_pass_service] = lambda: pass_service
    try:
        with TestClient(app) as client:
            yield client, run_service, pass_service
    finally:
        for dependency in (
            get_benchmark_suite_store,
            get_benchmark_run_service,
            get_benchmark_criteria_store,
            get_benchmark_pairwise_pass_service,
        ):
            app.dependency_overrides.pop(dependency, None)


def _wait(client: TestClient, service: Any) -> None:
    """Attend la tâche de fond via le portail du client de test."""
    task = service.background_task
    assert task is not None

    async def _await_task() -> None:
        await asyncio.wait_for(asyncio.shield(task), timeout=10)

    client.portal.call(_await_task)


def _produce_run(
    client: TestClient, run_service: Any, case_ids: List[str], models: List[str]
) -> str:
    """Crée une suite, lance un run et attend sa fin."""
    client.put(
        f"{BASE}/suites/smoke",
        json={
            "suite_id": "smoke",
            "name": "",
            "description": "",
            "cases": [
                {
                    "case_id": cid,
                    "request": {
                        "llm_model_identifier": MODEL_A,
                        "user_instructions": "Le marchand refuse.",
                        "context_selections": {"characters_full": ["Uresaïr"]},
                    },
                }
                for cid in case_ids
            ],
        },
    )
    launched = client.post(
        f"{BASE}/runs",
        json={
            "suite_id": "smoke",
            "models": models,
            "repetitions": 1,
            "budget_cap_usd": 1.0,
        },
    )
    assert launched.status_code == 200, launched.text
    _wait(client, run_service)
    return launched.json()["run_id"]


def test_pairwise_pass_lifecycle(pairwise_client: tuple[TestClient, Any, Any]) -> None:
    """Cycle complet : run → passe de comparaison → duels."""
    client, run_service, pass_service = pairwise_client
    run_id = _produce_run(client, run_service, ["cas-0", "cas-1"], [MODEL_A, MODEL_B])

    launched = client.post(
        f"{BASE}/runs/{run_id}/judge/pairwise",
        json={"grid_id": "test", "judge_model": JUDGE, "budget_cap_usd": 1.0},
    )
    assert launched.status_code == 200, launched.text
    body = launched.json()
    assert body["duels_total"] == 2
    assert body["unpairable_slots"] == 0
    assert body["estimated_max_usd"] > 0

    _wait(client, pass_service)

    listed = client.get(f"{BASE}/runs/{run_id}/pairwise")
    assert listed.status_code == 200
    payload = listed.json()
    assert payload["judge_models"] == [JUDGE]
    assert len(payload["verdicts"]) == 2
    assert all(v["status"] == "decided" for v in payload["verdicts"])


def test_pairwise_state_is_persisted(pairwise_client: tuple[TestClient, Any, Any]) -> None:
    """L'état persisté survit au processus et porte les cas non appariables."""
    client, run_service, pass_service = pairwise_client
    run_id = _produce_run(client, run_service, ["cas-0"], [MODEL_A, MODEL_B])
    client.post(
        f"{BASE}/runs/{run_id}/judge/pairwise",
        json={"grid_id": "test", "judge_model": JUDGE, "budget_cap_usd": 1.0},
    )
    _wait(client, pass_service)

    state = client.get(f"{BASE}/runs/{run_id}/pairwise/{JUDGE}/state")
    assert state.status_code == 200, state.text
    body = state.json()
    assert body["status"] == "completed"
    assert body["duels_completed"] == 1
    assert body["unpairable_slots"] == 0

    assert client.get(f"{BASE}/runs/{run_id}/pairwise/inconnu/state").status_code == 404


def test_unpairable_slots_and_judge_flag_cross_the_http_boundary(
    pairwise_client: tuple[TestClient, Any, Any],
) -> None:
    """Les indicateurs de couverture et d'auto-préférence doivent franchir l'API.

    Asserter uniquement des zéros ne distinguerait pas un champ correctement câblé
    d'un champ codé en dur — or ce sont eux qui empêchent de présenter un classement
    fondé sur trois duels comme s'il en couvrait cent.
    """
    client, run_service, pass_service = pairwise_client
    run_id = _produce_run(client, run_service, ["cas-0"], [MODEL_A, MODEL_B])

    # Le second cas n'a qu'un modèle valide : créneau non appariable.
    for record in run_service.list_generations(run_id):
        run_service._persist_record(
            record.model_copy(update={"case_id": "cas-1", "repetition": 1})
            if record.model_id == MODEL_B
            else record
        )

    launched = client.post(
        f"{BASE}/runs/{run_id}/judge/pairwise",
        json={"grid_id": "test", "judge_model": MODEL_A, "budget_cap_usd": 1.0},
    )
    assert launched.status_code == 200, launched.text
    body = launched.json()
    assert body["unpairable_slots"] >= 1, "le créneau orphelin doit être compté"
    assert body["judge_is_candidate"] is True, "le juge est aussi un modèle comparé"
    _wait(client, pass_service)

    state = client.get(f"{BASE}/runs/{run_id}/pairwise/{MODEL_A}/state").json()
    assert state["unpairable_slots"] >= 1
    assert state["judge_is_candidate"] is True


def test_pairwise_listing_exposes_total_and_all_judges(
    pairwise_client: tuple[TestClient, Any, Any],
) -> None:
    """Filtrer par juge ne doit pas éteindre l'alerte « plusieurs juges »."""
    client, run_service, pass_service = pairwise_client
    run_id = _produce_run(client, run_service, ["cas-0"], [MODEL_A, MODEL_B])

    for judge in (JUDGE, "gpt-5.6-luna"):
        client.post(
            f"{BASE}/runs/{run_id}/judge/pairwise",
            json={"grid_id": "test", "judge_model": judge, "budget_cap_usd": 1.0},
        )
        _wait(client, pass_service)

    full = client.get(f"{BASE}/runs/{run_id}/pairwise").json()
    assert full["total"] == 2
    assert len(full["judge_models"]) == 2

    filtered = client.get(
        f"{BASE}/runs/{run_id}/pairwise", params={"judge_model": JUDGE}
    ).json()
    assert filtered["total"] == 1
    assert len(filtered["judge_models"]) == 2, "le lot complet reste signalé"

    paged = client.get(f"{BASE}/runs/{run_id}/pairwise", params={"limit": 1}).json()
    assert len(paged["verdicts"]) == 1
    assert paged["total"] == 2, "le total ne doit pas être celui de la page"


def test_pairwise_on_single_model_run_returns_400(
    pairwise_client: tuple[TestClient, Any, Any],
) -> None:
    """Sans deux modèles appariables, la passe est refusée avant tout appel LLM."""
    client, run_service, _ = pairwise_client
    run_id = _produce_run(client, run_service, ["cas-0"], [MODEL_A])
    response = client.post(
        f"{BASE}/runs/{run_id}/judge/pairwise",
        json={"grid_id": "test", "judge_model": JUDGE, "budget_cap_usd": 1.0},
    )
    assert response.status_code == 400
    assert "aucune paire comparable" in response.text


def test_pairwise_on_unknown_run_returns_404(
    pairwise_client: tuple[TestClient, Any, Any],
) -> None:
    """Un run inconnu ne lance aucune passe et ne renvoie pas une liste vide."""
    client, _, _ = pairwise_client
    assert (
        client.post(
            f"{BASE}/runs/inexistant/judge/pairwise",
            json={"grid_id": "test", "judge_model": JUDGE, "budget_cap_usd": 1.0},
        ).status_code
        == 404
    )
    assert client.get(f"{BASE}/runs/inexistant/pairwise").status_code == 404


def test_pairwise_with_unknown_grid_returns_404(
    pairwise_client: tuple[TestClient, Any, Any],
) -> None:
    """Une grille absente arrête la demande avant tout appel LLM."""
    client, run_service, _ = pairwise_client
    run_id = _produce_run(client, run_service, ["cas-0"], [MODEL_A, MODEL_B])
    response = client.post(
        f"{BASE}/runs/{run_id}/judge/pairwise",
        json={"grid_id": "inconnue", "judge_model": JUDGE, "budget_cap_usd": 1.0},
    )
    assert response.status_code == 404


def test_pairwise_control_endpoints_report_no_active_pass(
    pairwise_client: tuple[TestClient, Any, Any],
) -> None:
    """Pause, reprise et annulation sans passe active répondent sans mentir."""
    client, _, _ = pairwise_client
    for action in ("pause", "unpause", "cancel"):
        response = client.post(f"{BASE}/runs/quelconque/pairwise/{action}")
        assert response.status_code == 200
        assert response.json()["applied"] is False


def test_pairwise_progress_is_readable(pairwise_client: tuple[TestClient, Any, Any]) -> None:
    """La progression est lisible même sans passe en cours."""
    client, _, _ = pairwise_client
    response = client.get(f"{BASE}/pairwise/progress")
    assert response.status_code == 200
    assert response.json()["active"] is False


def test_non_admin_cannot_compare_or_read_duels(
    pairwise_client: tuple[TestClient, Any, Any],
) -> None:
    """Comparer coûte deux appels par duel, et les duels portent les textes."""
    client, _, _ = pairwise_client
    app.dependency_overrides[get_current_user_or_none] = lambda: {
        "username": "writer",
        "role": "writer",
        "is_active": True,
    }
    try:
        forbidden = [
            client.post(
                f"{BASE}/runs/quelconque/judge/pairwise",
                json={"grid_id": "test", "judge_model": JUDGE, "budget_cap_usd": 1.0},
            ),
            client.get(f"{BASE}/runs/quelconque/pairwise"),
            client.get(f"{BASE}/pairwise/progress"),
            client.post(f"{BASE}/runs/quelconque/pairwise/cancel"),
        ]
    finally:
        app.dependency_overrides.pop(get_current_user_or_none, None)
    assert [response.status_code for response in forbidden] == [403] * len(forbidden)

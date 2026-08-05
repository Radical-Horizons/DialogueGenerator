"""Tests du contrat API du jugement de benchmark.

Services redirigés vers `tmp_path` : aucun test n'écrit dans `data/benchmarks/`.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_benchmark_criteria_store,
    get_benchmark_judge_pass_service,
    get_benchmark_run_service,
    get_benchmark_suite_store,
)
from api.main import app
from api.routers.auth import get_current_user_or_none
from api.schemas.benchmark import BenchmarkModelDiagnostic
from models.benchmark_judge_output import (
    BenchmarkCriterionScore,
    BenchmarkRubricJudgeResult,
)
from services.benchmark_criteria_store import BenchmarkCriteriaStore
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_judge_pass_service import BenchmarkJudgePassService
from services.benchmark_judge_service import BenchmarkJudgeService
from services.benchmark_run_service import BenchmarkRunService
from services.benchmark_suite_store import BenchmarkSuiteStore

MODEL_A = "gpt-5.6-luna"
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


class _FakeJudgeClient:
    """Juge notant tous les critères."""

    def __init__(self) -> None:
        self.last_call_cost = 0.0002
        self.last_usage_prompt_tokens = 100
        self.last_usage_completion_tokens = 30

    async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
        """Retourne une notation complète."""
        return [
            BenchmarkRubricJudgeResult(
                criteria=[
                    BenchmarkCriterionScore(criterion_id=cid, score=7, comment="ok")
                    for cid in CRITERIA
                ],
                reasoning="audit",
            )
        ]


def _grid_payload(grid_id: str = "test") -> Dict[str, Any]:
    """Corps de création de grille."""
    return {
        "grid_id": grid_id,
        "name": "Grille de test",
        "description": "",
        "criteria": [
            {
                "criterion_id": cid,
                "label": cid,
                "description": f"Consigne {cid}.",
                "direction": "higher_is_better",
                "weight": 1.0,
            }
            for cid in CRITERIA
        ],
    }


@pytest.fixture
def judging_client(tmp_path: Path) -> Iterator[tuple[TestClient, Any, Any]]:
    """Client API dont tous les services benchmark pointent sur `tmp_path`."""
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
    # Le container amorce à la construction, pas sur un chemin de lecture : la
    # fixture reproduit ce câblage plutôt que de compter sur un GET pour semer.
    criteria_store.ensure_seeded()
    pass_service = BenchmarkJudgePassService(
        run_service=run_service,
        criteria_store=criteria_store,
        judge_service=BenchmarkJudgeService(),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        llm_client_factory=lambda model_id: _FakeJudgeClient(),
    )

    app.dependency_overrides[get_benchmark_suite_store] = lambda: suite_store
    app.dependency_overrides[get_benchmark_run_service] = lambda: run_service
    app.dependency_overrides[get_benchmark_criteria_store] = lambda: criteria_store
    app.dependency_overrides[get_benchmark_judge_pass_service] = lambda: pass_service
    try:
        with TestClient(app) as client:
            yield client, run_service, pass_service
    finally:
        for dependency in (
            get_benchmark_suite_store,
            get_benchmark_run_service,
            get_benchmark_criteria_store,
            get_benchmark_judge_pass_service,
        ):
            app.dependency_overrides.pop(dependency, None)


def _wait(client: TestClient, service: Any) -> None:
    """Attend la tâche de fond via le portail du client de test."""
    task = service.background_task
    assert task is not None

    async def _await_task() -> None:
        await asyncio.wait_for(asyncio.shield(task), timeout=10)

    client.portal.call(_await_task)


def _produce_run(client: TestClient, run_service: Any, case_ids: List[str]) -> str:
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
            "models": [MODEL_A],
            "repetitions": 1,
            "budget_cap_usd": 1.0,
        },
    )
    assert launched.status_code == 200, launched.text
    _wait(client, run_service)
    return launched.json()["run_id"]


def test_criteria_grid_crud(judging_client: tuple[TestClient, Any, Any]) -> None:
    """Créer, lister, relire et supprimer une grille."""
    client, _, _ = judging_client

    created = client.put(f"{BASE}/criteria/test", json=_grid_payload())
    assert created.status_code == 200, created.text
    assert created.json()["grid"]["version"] == 1

    listed = client.get(f"{BASE}/criteria")
    assert listed.status_code == 200
    assert "test" in {grid["grid_id"] for grid in listed.json()["grids"]}

    fetched = client.get(f"{BASE}/criteria/test")
    assert fetched.status_code == 200
    assert [c["criterion_id"] for c in fetched.json()["grid"]["criteria"]] == list(CRITERIA)

    assert client.delete(f"{BASE}/criteria/test").status_code == 204
    assert client.get(f"{BASE}/criteria/test").status_code == 404


def test_seed_grid_is_available_without_configuration(
    judging_client: tuple[TestClient, Any, Any],
) -> None:
    """Un poste neuf dispose d'une grille de départ sans rien configurer."""
    client, _, _ = judging_client
    grids = client.get(f"{BASE}/criteria").json()["grids"]
    assert grids, "la grille de départ doit être semée"
    assert grids[0]["criterion_count"] >= 15


def test_empty_grid_is_rejected(judging_client: tuple[TestClient, Any, Any]) -> None:
    """Une grille sans critère produirait des scores vides de sens."""
    client, _, _ = judging_client
    response = client.put(
        f"{BASE}/criteria/vide",
        json={"grid_id": "vide", "name": "", "description": "", "criteria": []},
    )
    assert response.status_code == 422


def test_grid_id_mismatch_is_rejected(judging_client: tuple[TestClient, Any, Any]) -> None:
    """Un `grid_id` de corps différent du chemin écrirait dans la mauvaise grille."""
    client, _, _ = judging_client
    response = client.put(f"{BASE}/criteria/test", json=_grid_payload("autre"))
    assert response.status_code == 400


def test_judge_pass_lifecycle(judging_client: tuple[TestClient, Any, Any]) -> None:
    """Cycle complet : grille → passe de jugement → verdicts."""
    client, run_service, pass_service = judging_client
    client.put(f"{BASE}/criteria/test", json=_grid_payload())
    run_id = _produce_run(client, run_service, ["cas-0", "cas-1"])

    launched = client.post(
        f"{BASE}/runs/{run_id}/judge",
        json={"grid_id": "test", "judge_model": JUDGE, "budget_cap_usd": 1.0},
    )
    assert launched.status_code == 200, launched.text
    assert launched.json()["verdicts_total"] == 2
    assert launched.json()["estimated_max_usd"] > 0

    _wait(client, pass_service)

    verdicts = client.get(f"{BASE}/runs/{run_id}/verdicts")
    assert verdicts.status_code == 200
    body = verdicts.json()
    assert body["judge_models"] == [JUDGE]
    assert len(body["verdicts"]) == 2
    assert all(v["status"] == "scored" for v in body["verdicts"])
    assert all(set(v["scores"]) == set(CRITERIA) for v in body["verdicts"])


def test_verdicts_expose_judge_plurality(
    judging_client: tuple[TestClient, Any, Any],
) -> None:
    """Deux juges dans le lot : l'API le dit, l'agrégation directe n'est pas licite."""
    client, run_service, pass_service = judging_client
    client.put(f"{BASE}/criteria/test", json=_grid_payload())
    run_id = _produce_run(client, run_service, ["cas-0"])

    for judge in (JUDGE, "gpt-5.6-terra"):
        client.post(
            f"{BASE}/runs/{run_id}/judge",
            json={"grid_id": "test", "judge_model": judge, "budget_cap_usd": 1.0},
        )
        _wait(client, pass_service)

    body = client.get(f"{BASE}/runs/{run_id}/verdicts").json()
    assert len(body["judge_models"]) == 2

    filtered = client.get(f"{BASE}/runs/{run_id}/verdicts", params={"judge_model": JUDGE}).json()
    assert len(filtered["verdicts"]) == 1
    assert filtered["total"] == 1
    # `judge_models` recense le lot complet, pas la sélection : filtrer par juge ne
    # doit pas éteindre le signal qui interdit précisément d'agréger deux juges.
    assert len(filtered["judge_models"]) == 2


def test_judge_pass_on_unknown_run_returns_404(
    judging_client: tuple[TestClient, Any, Any],
) -> None:
    """Un run inconnu ne lance aucune passe."""
    client, _, _ = judging_client
    client.put(f"{BASE}/criteria/test", json=_grid_payload())
    response = client.post(
        f"{BASE}/runs/inexistant/judge",
        json={"grid_id": "test", "judge_model": JUDGE, "budget_cap_usd": 1.0},
    )
    assert response.status_code == 404


def test_judge_pass_on_run_without_valid_generations_returns_400(
    judging_client: tuple[TestClient, Any, Any],
) -> None:
    """Un run sans matière est refusé en 400 — la branche commune à tous les refus.

    Cinq refus distincts sortent par ce chemin (passe déjà en cours, juge
    inutilisable, tarif inconnu, plafond insuffisant, run sans génération valide) :
    sans ce test, ils remonteraient tous en 500 opaque sans qu'on le voie.
    """
    client, run_service, _ = judging_client
    client.put(f"{BASE}/criteria/test", json=_grid_payload())
    run_id = _produce_run(client, run_service, ["cas-0"])

    # Les générations existent mais aucune n'est notable.
    for record in run_service.list_generations(run_id):
        invalid = record.model_copy(update={"status": "invalid"})
        run_service._persist_record(invalid)

    response = client.post(
        f"{BASE}/runs/{run_id}/judge",
        json={"grid_id": "test", "judge_model": JUDGE, "budget_cap_usd": 1.0},
    )
    assert response.status_code == 400
    assert "aucune génération valide" in response.text


def test_verdicts_on_unknown_run_returns_404(
    judging_client: tuple[TestClient, Any, Any],
) -> None:
    """Un run inconnu ne renvoie pas une liste vide — indistinguable de « pas jugé »."""
    client, _, _ = judging_client
    assert client.get(f"{BASE}/runs/inexistant/verdicts").status_code == 404
    assert client.get(f"{BASE}/runs/..%2F../verdicts").status_code in (404, 400)


def test_judge_pass_state_survives_the_process(
    judging_client: tuple[TestClient, Any, Any],
) -> None:
    """L'état persisté est consultable : c'est le seul recours après un arrêt brutal."""
    client, run_service, pass_service = judging_client
    client.put(f"{BASE}/criteria/test", json=_grid_payload())
    run_id = _produce_run(client, run_service, ["cas-0"])
    client.post(
        f"{BASE}/runs/{run_id}/judge",
        json={"grid_id": "test", "judge_model": JUDGE, "budget_cap_usd": 1.0},
    )
    _wait(client, pass_service)

    state = client.get(f"{BASE}/runs/{run_id}/judge/{JUDGE}/state")
    assert state.status_code == 200, state.text
    body = state.json()
    assert body["status"] == "completed"
    assert body["verdicts_completed"] == 1
    assert body["judge_model"] == JUDGE

    assert client.get(f"{BASE}/runs/{run_id}/judge/inconnu/state").status_code == 404


def test_judge_pass_with_unknown_grid_returns_404(
    judging_client: tuple[TestClient, Any, Any],
) -> None:
    """Une grille absente arrête la demande avant tout appel LLM."""
    client, run_service, _ = judging_client
    run_id = _produce_run(client, run_service, ["cas-0"])
    response = client.post(
        f"{BASE}/runs/{run_id}/judge",
        json={"grid_id": "inconnue", "judge_model": JUDGE, "budget_cap_usd": 1.0},
    )
    assert response.status_code == 404


def test_judge_control_endpoints_report_no_active_pass(
    judging_client: tuple[TestClient, Any, Any],
) -> None:
    """Pause, reprise et annulation sans passe active répondent sans mentir."""
    client, _, _ = judging_client
    for action in ("pause", "unpause", "cancel"):
        response = client.post(f"{BASE}/runs/quelconque/judge/{action}")
        assert response.status_code == 200
        assert response.json()["applied"] is False


def test_non_admin_cannot_judge_or_read_verdicts(
    judging_client: tuple[TestClient, Any, Any],
) -> None:
    """Juger coûte de l'argent, et les verdicts portent les textes : réservé admin."""
    client, _, _ = judging_client
    app.dependency_overrides[get_current_user_or_none] = lambda: {
        "username": "writer",
        "role": "writer",
        "is_active": True,
    }
    try:
        forbidden = [
            client.post(
                f"{BASE}/runs/quelconque/judge",
                json={"grid_id": "test", "judge_model": JUDGE, "budget_cap_usd": 1.0},
            ),
            client.get(f"{BASE}/runs/quelconque/verdicts"),
            client.get(f"{BASE}/judge/progress"),
            client.post(f"{BASE}/runs/quelconque/judge/cancel"),
            client.put(f"{BASE}/criteria/test", json=_grid_payload()),
            client.delete(f"{BASE}/criteria/test"),
        ]
    finally:
        app.dependency_overrides.pop(get_current_user_or_none, None)
    assert [response.status_code for response in forbidden] == [403] * len(forbidden)


def test_reading_grids_stays_open(judging_client: tuple[TestClient, Any, Any]) -> None:
    """Lire une grille ne coûte rien et ne fuit rien : reste ouvert."""
    client, _, _ = judging_client
    client.put(f"{BASE}/criteria/test", json=_grid_payload())
    app.dependency_overrides[get_current_user_or_none] = lambda: {
        "username": "guest",
        "role": "guest",
        "is_active": True,
    }
    try:
        assert client.get(f"{BASE}/criteria").status_code == 200
        assert client.get(f"{BASE}/criteria/test").status_code == 200
    finally:
        app.dependency_overrides.pop(get_current_user_or_none, None)

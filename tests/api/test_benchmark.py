"""Tests du contrat API du mode Benchmark.

Le magasin et le moteur sont redirigés vers `tmp_path` : aucun test n'écrit dans
`data/benchmarks/`, et deux configurations ne peuvent pas partager un magasin de
résultats.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Iterator, List, Optional

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_benchmark_run_service, get_benchmark_suite_store
from api.main import app
from api.routers.auth import get_current_user_or_none
from api.schemas.benchmark import BenchmarkModelDiagnostic
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_run_service import BenchmarkRunService
from services.benchmark_suite_store import BenchmarkSuiteStore

MODEL_A = "gpt-5.6-luna"
BASE = "/api/v1/benchmark"

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
    """Événement de génération, calqué sur ``GenerationEvent``."""

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
    """Double d'orchestrateur émettant une génération valide."""

    def __init__(self) -> None:
        self.config_service = _FakeConfigService()

    async def generate_with_events(
        self, request: Any, check_cancelled: Any
    ) -> AsyncGenerator[_Event, None]:
        """Émet metadata puis complete."""
        yield _Event("metadata", {"cost_usd": 0.001, "usage_prompt_tokens": 10,
                                  "usage_completion_tokens": 5})
        yield _Event(
            "complete",
            {
                "result": {
                    "json_content": _unity_document(),
                    "title": "Marchandage",
                    "raw_prompt": "prompt",
                    "prompt_hash": "hash",
                }
            },
        )


class _FakePricingService:
    """Tarification fictive."""

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        return {"input_price_per_1M": 1.0, "output_price_per_1M": 2.0}

    def calculate_cost(self, model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
        return 0.0001


def _case_payload(case_id: str = "cas-0") -> Dict[str, Any]:
    """Cas de benchmark minimal, accepté par le schéma Unity."""
    return {
        "case_id": case_id,
        "title": "Marchandage tendu",
        "categories": {"ton": "grave"},
        "request": {
            "llm_model_identifier": MODEL_A,
            "user_instructions": "Le marchand refuse de baisser son prix.",
            "context_selections": {"characters_full": ["Uresaïr"]},
        },
    }


@pytest.fixture
def benchmark_client(tmp_path: Path) -> Iterator[tuple[TestClient, BenchmarkRunService]]:
    """Client API dont les services benchmark pointent sur `tmp_path`."""
    store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
    service = BenchmarkRunService(
        suite_store=store,
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: _FakeOrchestrator(),
        runs_dir=tmp_path / "runs",
    )
    service.diagnose_models = lambda models: [  # type: ignore[method-assign]
        BenchmarkModelDiagnostic(model_id=model_id, usable=True) for model_id in models
    ]

    app.dependency_overrides[get_benchmark_suite_store] = lambda: store
    app.dependency_overrides[get_benchmark_run_service] = lambda: service
    try:
        with TestClient(app) as client:
            yield client, service
    finally:
        app.dependency_overrides.pop(get_benchmark_suite_store, None)
        app.dependency_overrides.pop(get_benchmark_run_service, None)


def _wait_for_run(client: TestClient, service: BenchmarkRunService) -> None:
    """Attend la fin de la tâche de fond du run lancé par l'API.

    La tâche vit dans la boucle du portail `TestClient`, qui tourne déjà :
    `loop.run_until_complete` y lèverait `RuntimeError`. Le portail est le seul
    point d'entrée légitime depuis le thread du test.

    Args:
        client: Client de test (porteur du portail).
        service: Moteur de run dont on attend la tâche.
    """
    task = service._task
    assert task is not None

    async def _await_task() -> None:
        await asyncio.wait_for(asyncio.shield(task), timeout=10)

    client.portal.call(_await_task)


def test_suite_crud_and_export_roundtrip(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """Créer, lister, exporter puis réimporter une suite."""
    client, _ = benchmark_client
    payload = {
        "suite_id": "smoke",
        "name": "Fumée",
        "description": "Suite de vérification",
        "cases": [_case_payload()],
    }

    created = client.put(f"{BASE}/suites/smoke", json=payload)
    assert created.status_code == 200, created.text
    assert created.json()["suite"]["version"] == 1

    listed = client.get(f"{BASE}/suites")
    assert listed.status_code == 200
    assert listed.json()["suites"][0]["case_count"] == 1

    exported = client.get(f"{BASE}/suites/smoke/export")
    assert exported.status_code == 200
    document = exported.json()

    document["suite_id"] = "smoke-copie"
    imported = client.post(f"{BASE}/suites/import", json=document)
    assert imported.status_code == 200
    assert imported.json()["suite"]["suite_id"] == "smoke-copie"


def test_empty_suite_is_rejected_before_any_llm_call(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """Une suite sans cas est refusée à l'écriture — aucun run ne peut la rejouer."""
    client, _ = benchmark_client
    response = client.put(
        f"{BASE}/suites/vide",
        json={"suite_id": "vide", "name": "Vide", "description": "", "cases": []},
    )
    assert response.status_code == 422


def test_suite_id_mismatch_is_rejected(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """Un `suite_id` de corps différent du chemin écrirait dans la mauvaise suite."""
    client, _ = benchmark_client
    response = client.put(
        f"{BASE}/suites/smoke",
        json={"suite_id": "autre", "name": "", "description": "", "cases": [_case_payload()]},
    )
    assert response.status_code == 400


def test_unknown_suite_returns_404(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """Une suite absente ne renvoie pas une suite vide silencieuse."""
    client, _ = benchmark_client
    assert client.get(f"{BASE}/suites/inconnue").status_code == 404


def test_run_lifecycle_status_and_generations(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """Cycle complet : suite → run → statut → générations, avec estimation de coût."""
    client, service = benchmark_client
    client.put(
        f"{BASE}/suites/smoke",
        json={
            "suite_id": "smoke",
            "name": "Fumée",
            "description": "",
            "cases": [_case_payload("cas-0"), _case_payload("cas-1")],
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
    body = launched.json()
    run_id = body["run_id"]
    assert body["estimate"]["generations"] == 2
    assert body["model_diagnostics"][0]["usable"] is True

    _wait_for_run(client, service)

    status_response = client.get(f"{BASE}/runs/{run_id}")
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "completed"
    assert status_response.json()["cases_covered"] == 2

    generations = client.get(f"{BASE}/runs/{run_id}/generations")
    assert generations.status_code == 200
    records = generations.json()["generations"]
    assert len(records) == 2
    assert {record["status"] for record in records} == {"valid"}
    assert all(record["json_content"] for record in records), "textes bruts exposés pour audit"

    runs = client.get(f"{BASE}/runs")
    assert run_id in {run["run_id"] for run in runs.json()["runs"]}


def test_run_on_unknown_suite_returns_404(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """Lancer un run sur une suite absente échoue avec un message, sans appel LLM."""
    client, _ = benchmark_client
    response = client.post(
        f"{BASE}/runs",
        json={
            "suite_id": "inconnue",
            "models": [MODEL_A],
            "repetitions": 1,
            "budget_cap_usd": 1.0,
        },
    )
    assert response.status_code == 404


def test_resume_refuses_when_suite_changed(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """La reprise sur une suite modifiée renvoie 409, pas une mesure incomparable."""
    client, service = benchmark_client
    client.put(
        f"{BASE}/suites/smoke",
        json={
            "suite_id": "smoke",
            "name": "",
            "description": "",
            "cases": [_case_payload("cas-0"), _case_payload("cas-1")],
        },
    )
    # Plafond volontairement sous le coût d'une génération : le run s'arrête
    # après le premier cas et devient reprenable.
    launched = client.post(
        f"{BASE}/runs",
        json={
            "suite_id": "smoke",
            "models": [MODEL_A],
            "repetitions": 1,
            "budget_cap_usd": 0.0005,
        },
    )
    run_id = launched.json()["run_id"]
    _wait_for_run(client, service)
    assert client.get(f"{BASE}/runs/{run_id}").json()["status"] == "interrupted_budget"

    stored = service._suite_store.get_suite("smoke")
    tampered = stored.model_copy(
        update={"cases": [stored.cases[0].model_copy(update={"title": "Titre modifié"})]}
    )
    service._suite_store.save_suite(tampered, bump_version=False)

    response = client.post(f"{BASE}/runs/{run_id}/resume")
    assert response.status_code == 409
    assert "a changé depuis le run" in response.text


def test_resume_completed_run_is_refused(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """Un run terminé n'est pas reprenable : refus explicite plutôt que rejeu."""
    client, service = benchmark_client
    client.put(
        f"{BASE}/suites/smoke",
        json={
            "suite_id": "smoke",
            "name": "",
            "description": "",
            "cases": [_case_payload("cas-0")],
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
    run_id = launched.json()["run_id"]
    _wait_for_run(client, service)

    response = client.post(f"{BASE}/runs/{run_id}/resume")
    assert response.status_code == 409
    assert "termin" in response.text


def test_resume_unknown_run_returns_404(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """Reprendre un run inexistant échoue explicitement."""
    client, _ = benchmark_client
    assert client.post(f"{BASE}/runs/inexistant/resume").status_code == 404


def test_control_endpoints_report_no_active_run(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """Pause, reprise et annulation sans run actif répondent sans mentir."""
    client, _ = benchmark_client
    for action in ("pause", "unpause", "cancel"):
        response = client.post(f"{BASE}/runs/quelconque/{action}")
        assert response.status_code == 200
        assert response.json()["applied"] is False


def test_progress_endpoint_is_inactive_before_any_run(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """La progression est lisible même sans run en cours."""
    client, _ = benchmark_client
    response = client.get(f"{BASE}/runs/progress")
    assert response.status_code == 200
    assert response.json()["active"] is False


def test_non_admin_cannot_reach_spending_or_run_data(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """Un utilisateur non administrateur ne peut ni dépenser ni lire les runs.

    `tests/conftest.py` force `DISABLE_AUTH=true`, ce qui fait fabriquer un admin
    factice par `require_admin(None)` : sans surcharge explicite de l'utilisateur
    courant, la garde ne serait jamais évaluée et pourrait disparaître sans qu'un
    test échoue. `raw_prompt` contient le contexte GDD injecté : la lecture des
    générations est donc au même niveau que le lancement.
    """
    client, _ = benchmark_client
    app.dependency_overrides[get_current_user_or_none] = lambda: {
        "username": "writer",
        "role": "writer",
        "is_active": True,
    }
    try:
        forbidden = [
            client.post(
                f"{BASE}/runs",
                json={
                    "suite_id": "smoke",
                    "models": [MODEL_A],
                    "repetitions": 1,
                    "budget_cap_usd": 1.0,
                },
            ),
            client.post(f"{BASE}/runs/quelconque/resume"),
            client.post(f"{BASE}/runs/quelconque/cancel"),
            client.get(f"{BASE}/runs"),
            client.get(f"{BASE}/runs/quelconque/generations"),
            client.put(
                f"{BASE}/suites/smoke",
                json={
                    "suite_id": "smoke",
                    "name": "",
                    "description": "",
                    "cases": [_case_payload()],
                },
            ),
            client.delete(f"{BASE}/suites/smoke"),
        ]
    finally:
        app.dependency_overrides.pop(get_current_user_or_none, None)

    assert [response.status_code for response in forbidden] == [403] * len(forbidden)


def test_guest_can_still_read_suites(
    benchmark_client: tuple[TestClient, BenchmarkRunService],
) -> None:
    """La lecture des suites reste ouverte : elle ne coûte rien et ne fuit rien."""
    client, _ = benchmark_client
    client.put(
        f"{BASE}/suites/smoke",
        json={
            "suite_id": "smoke",
            "name": "Fumée",
            "description": "",
            "cases": [_case_payload()],
        },
    )
    app.dependency_overrides[get_current_user_or_none] = lambda: {
        "username": "guest",
        "role": "guest",
        "is_active": True,
    }
    try:
        assert client.get(f"{BASE}/suites").status_code == 200
        assert client.get(f"{BASE}/suites/smoke").status_code == 200
    finally:
        app.dependency_overrides.pop(get_current_user_or_none, None)

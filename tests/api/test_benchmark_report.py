"""Tests du contrat API de l'aperçu et du rapport de benchmark.

L'aperçu existe pour une seule raison : afficher le coût **avant** de l'engager.
Le test qui compte ici est donc celui qui vérifie qu'aucun run n'apparaît après
un aperçu — le reste ne serait qu'une redite du service.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_benchmark_report_service,
    get_benchmark_run_service,
    get_benchmark_suite_store,
)
from api.main import app
from api.routers.auth import get_current_user_or_none
from api.schemas.benchmark import BenchmarkModelDiagnostic, BenchmarkSuite
from api.schemas.benchmark_report import BenchmarkRunPreviewRequest
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_report_service import BenchmarkReportService
from services.benchmark_run_service import BenchmarkRunService
from services.benchmark_suite_store import BenchmarkSuiteStore

MODEL_A = "gpt-5.6-luna"
MODEL_B = "gpt-5.6-terra"
BASE = "/api/v1/benchmark"


class _FakeConfigService:
    """Configuration LLM minimale."""

    def get_llm_config(self) -> Dict[str, Any]:
        return {}

    def get_available_llm_models(self) -> List[Dict[str, Any]]:
        return [{"api_identifier": MODEL_A, "client_type": "openai"}]

    def get_llm_fallback_chain(self) -> List[str]:
        return []


class _FakePricingService:
    """Tarification fictive, non nulle pour que le plafond ait un sens."""

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        return {"input_price_per_1M": 1.0, "output_price_per_1M": 2.0}

    def calculate_cost(self, model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
        return 0.0001


class _EmptyPass:
    """Passe de jugement sans verdict — cas d'un run jamais noté."""

    def list_verdicts(self, run_id: str) -> List[Any]:
        return []


def _case_payload(case_id: str = "cas-0") -> Dict[str, Any]:
    """Cas de benchmark minimal, accepté par le schéma."""
    return {
        "case_id": case_id,
        "title": "Marchandage tendu",
        "request": {
            "llm_model_identifier": MODEL_A,
            "user_instructions": "Le marchand refuse de baisser son prix.",
            "context_selections": {"characters_full": ["Uresaïr"]},
        },
    }


@pytest.fixture
def report_client(tmp_path: Path) -> Iterator[TestClient]:
    """Client API dont les services benchmark pointent sur `tmp_path`."""
    store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
    run_service = BenchmarkRunService(
        suite_store=store,
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: None,
        runs_dir=tmp_path / "runs",
    )
    run_service.diagnose_models = lambda models: [  # type: ignore[method-assign]
        BenchmarkModelDiagnostic(model_id=model_id, usable=True) for model_id in models
    ]
    report_service = BenchmarkReportService(
        run_service=run_service,
        judge_pass_service=_EmptyPass(),  # type: ignore[arg-type]
        pairwise_pass_service=_EmptyPass(),  # type: ignore[arg-type]
        suite_store=store,
    )

    app.dependency_overrides[get_benchmark_suite_store] = lambda: store
    app.dependency_overrides[get_benchmark_run_service] = lambda: run_service
    app.dependency_overrides[get_benchmark_report_service] = lambda: report_service
    try:
        with TestClient(app) as client:
            seeded = client.put(
                f"{BASE}/suites/alteir-smoke",
                json={"suite_id": "alteir-smoke", "cases": [_case_payload()]},
            )
            assert seeded.status_code == 200, seeded.text
            yield client
    finally:
        app.dependency_overrides.pop(get_benchmark_suite_store, None)
        app.dependency_overrides.pop(get_benchmark_run_service, None)
        app.dependency_overrides.pop(get_benchmark_report_service, None)


def test_preview_prices_a_run_without_creating_one(report_client: TestClient) -> None:
    """Le prix s'affiche avant l'engagement : aucun run ne doit naître d'un aperçu."""
    response = report_client.post(
        f"{BASE}/runs/preview",
        json={"suite_id": "alteir-smoke", "models": [MODEL_A, MODEL_B], "repetitions": 2},
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["cases"] == 1
    assert body["estimate"]["generations"] == 4
    assert body["launchable"] is True
    assert {d["model_id"] for d in body["model_diagnostics"]} == {MODEL_A, MODEL_B}

    runs = report_client.get(f"{BASE}/runs")
    assert runs.status_code == 200
    assert runs.json()["runs"] == []


def test_preview_needs_no_budget_cap(report_client: TestClient) -> None:
    """On demande un aperçu pour savoir quel plafond poser : l'exiger inverserait tout."""
    response = report_client.post(
        f"{BASE}/runs/preview", json={"suite_id": "alteir-smoke", "models": [MODEL_A]}
    )
    assert response.status_code == 200, response.text


def test_preview_on_unknown_suite_is_a_404(report_client: TestClient) -> None:
    """Une suite absente est une erreur d'adressage, pas un aperçu vide."""
    response = report_client.post(
        f"{BASE}/runs/preview", json={"suite_id": "inconnue", "models": [MODEL_A]}
    )
    assert response.status_code == 404


def test_preview_rejects_a_duplicated_model(report_client: TestClient) -> None:
    """Un doublon fausserait le nombre de générations, donc l'estimation."""
    response = report_client.post(
        f"{BASE}/runs/preview",
        json={"suite_id": "alteir-smoke", "models": [MODEL_A, MODEL_A]},
    )
    assert response.status_code == 422


def test_report_on_unknown_run_is_a_404(report_client: TestClient) -> None:
    """Un run inexistant ne renvoie pas un rapport vide, qui se lirait comme un run raté."""
    response = report_client.get(f"{BASE}/runs/inconnu/report")
    assert response.status_code == 404


def test_report_of_a_launched_run_is_readable_before_any_judging(
    report_client: TestClient,
) -> None:
    """Un run jamais noté doit rapporter sa validité, sans bloc de juge."""
    launch = report_client.post(
        f"{BASE}/runs",
        json={
            "suite_id": "alteir-smoke",
            "models": [MODEL_A],
            "repetitions": 1,
            "budget_cap_usd": 1.0,
        },
    )
    assert launch.status_code == 200, launch.text
    run_id = launch.json()["run_id"]

    response = report_client.get(f"{BASE}/runs/{run_id}/report")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["run_id"] == run_id
    assert body["narration_mode"] == "sans"
    assert [entry["model_id"] for entry in body["models"]] == [MODEL_A]
    assert body["judges"] == []


def test_second_launch_is_refused_while_a_run_holds_the_lock(
    report_client: TestClient, tmp_path: Path
) -> None:
    """Deux runs simultanés dépenseraient deux fois le plafond : le second est refusé.

    Le verrou est posé sur le service, pas simulé au niveau HTTP : c'est bien la
    garde de production qui répond.
    """
    run_service = app.dependency_overrides[get_benchmark_run_service]()
    run_service._control.active_id = "run-deja-en-cours"
    try:
        response = report_client.post(
            f"{BASE}/runs",
            json={
                "suite_id": "alteir-smoke",
                "models": [MODEL_A],
                "repetitions": 1,
                "budget_cap_usd": 1.0,
            },
        )
    finally:
        run_service._control.active_id = None

    assert response.status_code == 409
    assert "en cours" in response.text


def test_preview_stays_available_while_a_run_is_locked(report_client: TestClient) -> None:
    """Chiffrer un run n'engage rien : le verrou d'exécution ne doit pas le bloquer."""
    run_service = app.dependency_overrides[get_benchmark_run_service]()
    run_service._control.active_id = "run-deja-en-cours"
    try:
        response = report_client.post(
            f"{BASE}/runs/preview", json={"suite_id": "alteir-smoke", "models": [MODEL_A]}
        )
    finally:
        run_service._control.active_id = None

    assert response.status_code == 200, response.text


def test_non_admin_cannot_preview_or_read_a_report(report_client: TestClient) -> None:
    """L'aperçu révèle des coûts et le rapport des mesures : réservés à l'admin.

    `tests/conftest.py` force `DISABLE_AUTH=true`, ce qui fabrique un admin
    factice : sans surcharge explicite de l'utilisateur courant, ce test
    passerait sans rien prouver.
    """
    app.dependency_overrides[get_current_user_or_none] = lambda: {
        "id": 2,
        "username": "writer",
        "role": "writer",
        "is_active": True,
    }
    try:
        preview = report_client.post(
            f"{BASE}/runs/preview", json={"suite_id": "alteir-smoke", "models": [MODEL_A]}
        )
        report = report_client.get(f"{BASE}/runs/whatever/report")
        assert preview.status_code == 403
        assert report.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user_or_none, None)


class _PartialPricingService(_FakePricingService):
    """Tarification où un modèle n'a aucun prix connu."""

    def get_model_pricing(self, model_name: str):
        return None if model_name == MODEL_B else super().get_model_pricing(model_name)


def test_preview_refuses_an_unpriced_model_through_the_real_guard(tmp_path: Path) -> None:
    """L'aperçu et le lancement doivent refuser pour le **même** motif.

    Ce test n'emploie aucun double de `assert_measurable` : sans lui, l'aperçu
    pourrait annoncer `launchable: true` sur un run que `POST /runs` refuserait,
    et rien ne le signalerait.
    """
    store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
    run_service = BenchmarkRunService(
        suite_store=store,
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_PartialPricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: None,
        runs_dir=tmp_path / "runs",
    )
    run_service.diagnose_models = lambda models: [  # type: ignore[method-assign]
        BenchmarkModelDiagnostic(model_id=model_id, usable=True) for model_id in models
    ]
    report_service = BenchmarkReportService(
        run_service=run_service,
        judge_pass_service=_EmptyPass(),  # type: ignore[arg-type]
        pairwise_pass_service=_EmptyPass(),  # type: ignore[arg-type]
        suite_store=store,
    )
    store.save_suite(
        BenchmarkSuite.model_validate({"suite_id": "s", "version": 1, "cases": [_case_payload()]})
    )

    preview = report_service.preview(
        BenchmarkRunPreviewRequest(suite_id="s", models=[MODEL_A, MODEL_B])
    )

    assert preview.launchable is False
    assert MODEL_B in preview.estimate.unpriced_models
    assert any("Tarif inconnu" in reason for reason in preview.blocking_reasons)


def test_one_unusable_model_among_usable_ones_stays_launchable(tmp_path: Path) -> None:
    """Un seul modèle inutilisable ne bloque pas : le run mesure les autres.

    Comportement volontaire de `assert_measurable` (`not any(usable)`), épinglé
    ici parce que le runbook a déjà annoncé l'inverse une fois.
    """
    store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
    run_service = BenchmarkRunService(
        suite_store=store,
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: None,
        runs_dir=tmp_path / "runs",
    )
    run_service.diagnose_models = lambda models: [  # type: ignore[method-assign]
        BenchmarkModelDiagnostic(
            model_id=model_id, usable=model_id != MODEL_B, reason=None if model_id != MODEL_B else "Clé API absente"
        )
        for model_id in models
    ]
    report_service = BenchmarkReportService(
        run_service=run_service,
        judge_pass_service=_EmptyPass(),  # type: ignore[arg-type]
        pairwise_pass_service=_EmptyPass(),  # type: ignore[arg-type]
        suite_store=store,
    )
    store.save_suite(
        BenchmarkSuite.model_validate({"suite_id": "s", "version": 1, "cases": [_case_payload()]})
    )

    preview = report_service.preview(
        BenchmarkRunPreviewRequest(suite_id="s", models=[MODEL_A, MODEL_B])
    )

    assert preview.launchable is True
    unusable = [d for d in preview.model_diagnostics if not d.usable]
    assert [d.model_id for d in unusable] == [MODEL_B]
    assert unusable[0].reason == "Clé API absente"

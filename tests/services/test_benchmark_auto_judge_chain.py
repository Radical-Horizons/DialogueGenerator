"""La notation s'enchaîne à la génération, et seulement quand elle a un sens.

« Générer et ne pas noter n'a aucun intérêt » : le chaînage fait donc partie du
lancement. Mais noter coûte, et un run annulé ou en échec n'a rien de stable à
mesurer — dépenser dessus serait payer deux fois pour rien.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

from api.schemas.benchmark import (
    BenchmarkAutoJudgeConfig,
    BenchmarkRun,
    BenchmarkRunConfig,
    BenchmarkRunIdentity,
)
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_run_service import BenchmarkRunService
from services.benchmark_suite_store import BenchmarkSuiteStore

MODEL = "gpt-5.6-luna"

AUTO_JUDGE = BenchmarkAutoJudgeConfig(
    grid_id="grille-dialogue-fr", judge_model=MODEL, budget_cap_usd=1.0, with_duels=True
)


class _FakeConfigService:
    """Configuration LLM minimale."""

    def get_llm_config(self) -> Dict[str, Any]:
        return {}

    def get_available_llm_models(self) -> List[Dict[str, Any]]:
        return [{"api_identifier": MODEL, "client_type": "openai"}]

    def get_llm_fallback_chain(self) -> List[str]:
        return []


class _FakePricingService:
    """Tarification fictive."""

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        return {"input_price_per_1M": 1.0, "output_price_per_1M": 2.0}

    def calculate_cost(self, model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
        return 0.0001


def _run(auto_judge: Optional[BenchmarkAutoJudgeConfig]) -> BenchmarkRun:
    """Run persistable, avec ou sans notation enchaînée."""
    config = BenchmarkRunConfig(
        suite_id="alteir-smoke",
        models=[MODEL],
        repetitions=1,
        budget_cap_usd=1.0,
        auto_judge=auto_judge,
    )
    return BenchmarkRun(
        run_id="run-test",
        config=config,
        identity=BenchmarkRunIdentity(
            suite_id="alteir-smoke",
            suite_version=1,
            suite_fingerprint="abc",
            models=[MODEL],
            repetitions=1,
            narration_mode="sans",
        ),
        status="running",
    )


def _service(tmp_path: Path, calls: List[tuple], final_status: str) -> BenchmarkRunService:
    """Moteur dont la génération est neutralisée et le statut final imposé."""
    service = BenchmarkRunService(
        suite_store=BenchmarkSuiteStore(suites_dir=tmp_path / "suites"),
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: None,
        runs_dir=tmp_path / "runs",
        auto_judge_hook=lambda run_id, cfg: calls.append((run_id, cfg)) or _noop(),
    )

    async def _fake_execute(run: BenchmarkRun, suite: Any) -> None:
        """Ne génère rien : seul le chaînage est sous test."""

    service._execute = _fake_execute  # type: ignore[method-assign]
    service.get_run = lambda run_id: _run(AUTO_JUDGE).model_copy(  # type: ignore[method-assign]
        update={"status": final_status}
    )
    return service


async def _noop() -> None:
    """Coroutine vide, retournée par le hook factice."""


@pytest.mark.asyncio
async def test_completed_run_is_judged_without_a_second_click(tmp_path: Path) -> None:
    """Le run terminé enchaîne sur la notation, sans geste supplémentaire."""
    calls: List[tuple] = []
    service = _service(tmp_path, calls, "completed")

    await service._execute_then_judge(_run(AUTO_JUDGE), suite=None)

    assert len(calls) == 1
    assert calls[0][0] == "run-test"
    assert calls[0][1].judge_model == MODEL


@pytest.mark.asyncio
async def test_budget_interrupted_run_is_still_judged(tmp_path: Path) -> None:
    """Un run tronqué par le plafond a produit des mesures : elles méritent des notes."""
    calls: List[tuple] = []
    service = _service(tmp_path, calls, "interrupted_budget")

    await service._execute_then_judge(_run(AUTO_JUDGE), suite=None)

    assert len(calls) == 1


@pytest.mark.parametrize("status", ["cancelled", "failed"])
@pytest.mark.asyncio
async def test_cancelled_or_failed_run_is_not_judged(tmp_path: Path, status: str) -> None:
    """Annuler doit arrêter la dépense, pas en déclencher une seconde."""
    calls: List[tuple] = []
    service = _service(tmp_path, calls, status)

    await service._execute_then_judge(_run(AUTO_JUDGE), suite=None)

    assert calls == []


@pytest.mark.asyncio
async def test_run_without_auto_judge_stays_unjudged(tmp_path: Path) -> None:
    """Sans notation demandée, rien ne se déclenche — le chaînage reste un choix."""
    calls: List[tuple] = []
    service = _service(tmp_path, calls, "completed")

    await service._execute_then_judge(_run(None), suite=None)

    assert calls == []


@pytest.mark.asyncio
async def test_judging_failure_never_masks_the_run(tmp_path: Path) -> None:
    """Une notation en échec est tracée, pas propagée : le run reste terminé."""

    def _boom(run_id: str, cfg: Any) -> Any:
        raise RuntimeError("juge injoignable")

    service = BenchmarkRunService(
        suite_store=BenchmarkSuiteStore(suites_dir=tmp_path / "suites"),
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: None,
        runs_dir=tmp_path / "runs",
        auto_judge_hook=_boom,
    )

    async def _fake_execute(run: BenchmarkRun, suite: Any) -> None:
        """Ne génère rien."""

    service._execute = _fake_execute  # type: ignore[method-assign]
    service.get_run = lambda run_id: _run(AUTO_JUDGE).model_copy(  # type: ignore[method-assign]
        update={"status": "completed"}
    )

    await service._execute_then_judge(_run(AUTO_JUDGE), suite=None)
